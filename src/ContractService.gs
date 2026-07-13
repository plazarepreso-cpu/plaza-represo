function getBootstrapData() {
  const user = currentUser_();
  const contracts = listObjects_('Contratos')
    .filter(item => item.status !== 'GENERANDO')
    .sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)));
  const clients = listObjects_('Clientes').map(stripPrivateClientFields_);
  const payments = listObjects_('Pagos').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return {
    user,
    config: {
      weekdayRate: Number(getSetting_('WEEKDAY_RATE', APP_CONFIG.WEEKDAY_RATE)),
      weekendRate: Number(getSetting_('WEEKEND_RATE', APP_CONFIG.WEEKEND_RATE)),
      eventHours: Number(getSetting_('EVENT_HOURS', APP_CONFIG.EVENT_HOURS)),
      nextContractNumber: `C.${String(getSetting_('NEXT_CONTRACT_NUMBER', APP_CONFIG.START_CONTRACT_NUMBER)).padStart(4, '0')}`,
      timeZone: APP_CONFIG.TIME_ZONE
    },
    contracts,
    clients,
    payments,
    system: getSystemInfo()
  };
}

function createContract(payload) {
  const user = requireOwner_();
  const data = payload || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let contractId = '';
  try {
    if (data.requestId) {
      const existingRequest = findObject_('Contratos', 'requestId', data.requestId);
      if (existingRequest) return existingRequest;
    }
    const validation = validateContractPayload_(data, '');
    const contractNumber = nextContractNumber_();
    contractId = Utilities.getUuid();
    const clientId = Utilities.getUuid();
    const timestamp = nowIso_();
    const folder = createContractFolder_(contractNumber, data.clientName, data.eventDate);
    const ineFileId = data.ineDataUrl ? storeIne_(data.ineDataUrl, contractNumber, data.clientName) : '';

    appendObject_('Clientes', {
      id: clientId,
      name: String(data.clientName).trim(),
      address: String(data.address).trim(),
      phone: String(data.phone).trim(),
      ineFileId,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    let contract = {
      id: contractId,
      requestId: data.requestId || Utilities.getUuid(),
      contractNumber,
      version: 1,
      status: 'GENERANDO',
      createdAt: timestamp,
      updatedAt: timestamp,
      elaborationDate: data.elaborationDate,
      eventDate: data.eventDate,
      eventDay: eventDayName_(data.eventDate),
      startTime: data.startTime,
      endTime: data.endTime,
      eventType: String(data.eventType).trim(),
      clientId,
      clientName: String(data.clientName).trim(),
      address: String(data.address).trim(),
      phone: String(data.phone).trim(),
      total: validation.total,
      initialDeposit: validation.initialDeposit,
      paid: validation.initialDeposit,
      balance: validation.total - validation.initialDeposit,
      overrideReason: String(data.overrideReason || '').trim(),
      folderId: folder.getId(),
      currentPdfFileId: '',
      calendarEventId: '',
      createdBy: user.email,
      updatedBy: user.email,
      cancelReason: ''
    };
    appendObject_('Contratos', contract);

    if (validation.initialDeposit > 0) {
      appendObject_('Pagos', {
        id: Utilities.getUuid(),
        contractId,
        contractNumber,
        date: data.elaborationDate,
        amount: validation.initialDeposit,
        method: data.paymentMethod || 'No indicado',
        note: 'Apartado inicial',
        receiptFileId: '',
        createdBy: user.email,
        createdAt: timestamp
      });
    }

    const generated = generateContractPdf_(contract, folder);
    contract.currentPdfFileId = generated.pdfFileId;
    contract.status = contract.balance === 0 ? 'PAGADO' : 'CONFIRMADO';
    contract.calendarEventId = createCalendarEvent_(contract);
    contract.updatedAt = nowIso_();
    contract = updateObject_('Contratos', 'id', contractId, contract);
    audit_('CREAR_CONTRATO', 'Contrato', contractId, { contractNumber, version: 1 });
    return contract;
  } catch (error) {
    if (contractId) {
      try { updateObject_('Contratos', 'id', contractId, { status: 'ERROR', updatedAt: nowIso_() }); } catch (ignored) {}
      try { audit_('ERROR_CREAR_CONTRATO', 'Contrato', contractId, { message: error.message }); } catch (ignored) {}
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function updateContract(payload) {
  const user = requireOwner_();
  const data = payload || {};
  const existing = findObject_('Contratos', 'id', data.id);
  if (!existing) throw new Error('No se encontró el contrato.');
  if (existing.status === 'CANCELADO') throw new Error('Un contrato cancelado no puede modificarse.');
  const merged = Object.assign({}, existing, data);
  const validation = validateContractPayload_(merged, existing.id);
  if (validation.total < Number(existing.paid)) throw new Error('El nuevo total no puede ser menor que lo ya pagado.');

  let updated = Object.assign({}, existing, {
    version: Number(existing.version || 1) + 1,
    updatedAt: nowIso_(),
    elaborationDate: merged.elaborationDate,
    eventDate: merged.eventDate,
    eventDay: eventDayName_(merged.eventDate),
    startTime: merged.startTime,
    endTime: merged.endTime,
    eventType: String(merged.eventType).trim(),
    clientName: String(merged.clientName).trim(),
    address: String(merged.address).trim(),
    phone: String(merged.phone).trim(),
    total: validation.total,
    balance: validation.total - Number(existing.paid),
    overrideReason: String(merged.overrideReason || '').trim(),
    updatedBy: user.email
  });
  updated.status = updated.balance === 0 ? 'PAGADO' : 'CONFIRMADO';
  const folder = DriveApp.getFolderById(existing.folderId);
  const generated = generateContractPdf_(updated, folder);
  updated.currentPdfFileId = generated.pdfFileId;
  updated.calendarEventId = updateCalendarEvent_(updated);
  const saved = updateObject_('Contratos', 'id', existing.id, updated);
  updateObject_('Clientes', 'id', existing.clientId, {
    name: updated.clientName,
    address: updated.address,
    phone: updated.phone,
    updatedAt: updated.updatedAt
  });
  audit_('ACTUALIZAR_CONTRATO', 'Contrato', existing.id, { version: updated.version });
  return saved;
}

function addPayment(payload) {
  const user = requireOwner_();
  const data = payload || {};
  const contract = findObject_('Contratos', 'id', data.contractId);
  if (!contract) throw new Error('No se encontró el contrato.');
  if (['CANCELADO', 'ERROR'].includes(contract.status)) throw new Error('Este contrato no acepta pagos.');
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('El abono debe ser mayor que cero.');
  if (amount > Number(contract.balance)) throw new Error('El abono no puede exceder el saldo restante.');

  const payment = {
    id: Utilities.getUuid(),
    contractId: contract.id,
    contractNumber: contract.contractNumber,
    date: data.date || todayIso_(),
    amount,
    method: String(data.method || 'No indicado'),
    note: String(data.note || 'Abono al contrato'),
    receiptFileId: '',
    createdBy: user.email,
    createdAt: nowIso_(),
    newPaid: Number(contract.paid) + amount,
    newBalance: Number(contract.balance) - amount
  };
  const folder = DriveApp.getFolderById(contract.folderId);
  const receipt = generateReceiptPdf_(contract, payment, folder);
  payment.receiptFileId = receipt.pdfFileId;
  appendObject_('Pagos', payment);

  const updated = Object.assign({}, contract, {
    paid: payment.newPaid,
    balance: payment.newBalance,
    status: payment.newBalance === 0 ? 'PAGADO' : 'CONFIRMADO',
    updatedAt: nowIso_(),
    updatedBy: user.email
  });
  updated.calendarEventId = updateCalendarEvent_(updated);
  const saved = updateObject_('Contratos', 'id', contract.id, updated);
  audit_('REGISTRAR_PAGO', 'Pago', payment.id, { contractId: contract.id, amount });
  return { contract: saved, payment };
}

function cancelContract(payload) {
  const user = requireOwner_();
  const data = payload || {};
  const reason = String(data.reason || '').trim();
  if (!reason) throw new Error('Indica el motivo de la cancelación.');
  const contract = findObject_('Contratos', 'id', data.id);
  if (!contract) throw new Error('No se encontró el contrato.');
  const updated = Object.assign({}, contract, {
    status: 'CANCELADO',
    cancelReason: reason,
    updatedAt: nowIso_(),
    updatedBy: user.email
  });
  markCalendarEventCancelled_(updated);
  const saved = updateObject_('Contratos', 'id', contract.id, updated);
  audit_('CANCELAR_CONTRATO', 'Contrato', contract.id, { reason });
  return saved;
}

function getPrivateIneUrl(payload) {
  requireOwner_();
  const contract = findObject_('Contratos', 'id', payload && payload.id);
  if (!contract) throw new Error('No se encontró el contrato.');
  const client = findObject_('Clientes', 'id', contract.clientId);
  if (!client || !client.ineFileId) throw new Error('Este cliente no tiene una identificación guardada.');
  return DriveApp.getFileById(client.ineFileId).getUrl();
}

function createContractFolder_(contractNumber, clientName, eventDate) {
  const rootId = PropertiesService.getScriptProperties().getProperty('CONTRACTS_FOLDER_ID');
  const root = DriveApp.getFolderById(rootId);
  const year = String(eventDate).slice(0, 4);
  const yearFolder = getOrCreateChildFolder_(root, year);
  return yearFolder.createFolder(`${contractNumber} - ${safeFileName_(clientName)} - ${eventDate}`);
}

function getOrCreateChildFolder_(parent, name) {
  const matches = parent.getFoldersByName(name);
  return matches.hasNext() ? matches.next() : parent.createFolder(name);
}

function storeIne_(dataUrl, contractNumber, clientName) {
  const match = String(dataUrl).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error('La identificación debe ser una imagen JPG, PNG o WebP.');
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('La imagen de la INE no puede exceder 5 MB.');
  const extension = match[1].split('/')[1].replace('jpeg', 'jpg');
  const blob = Utilities.newBlob(bytes, match[1], `${contractNumber} - ${safeFileName_(clientName)}.${extension}`);
  const privateRootId = PropertiesService.getScriptProperties().getProperty('PRIVATE_INE_FOLDER_ID');
  return DriveApp.getFolderById(privateRootId).createFile(blob).getId();
}
