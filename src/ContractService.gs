function getBootstrapData() {
  const user = currentUser_();
  const contracts = listObjects_('Contratos')
    .filter(item => item.status !== 'GENERANDO')
    .map(stripPrivateContractFields_)
    .sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)));
  const clients = listObjects_('Clientes').map(stripPrivateClientFields_);
  const payments = listObjects_('Pagos').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  let automation = { installed: false, triggerCount: 0, hour: 8, timeZone: APP_CONFIG.TIME_ZONE };
  if (user.role === APP_CONFIG.ROLE_OWNER) {
    try { automation = getAutomationStatus_(); }
    catch (error) { automation.error = String(error.message || error); }
  }
  return {
    user,
    users: user.role === APP_CONFIG.ROLE_OWNER ? listAccessUsers_() : [],
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
    system: getSystemInfo_(),
    automation
  };
}

function createContract(payload) {
  const user = requireOwner_();
  const data = payload || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let contractId = '';
  let initialPayment = null;
  try {
    ensureSchema_();
    const requestId = String(data.requestId || Utilities.getUuid()).trim();
    const existingRequest = findObject_('Contratos', 'requestId', requestId);
    if (existingRequest) {
      if (['ERROR', 'GENERANDO'].includes(String(existingRequest.status))) {
        throw new Error(`El intento ${existingRequest.contractNumber || ''} quedó incompleto. Ábrelo en Contratos para repararlo antes de reintentar.`);
      }
      return existingRequest;
    }
    const validation = validateContractPayload_(data, '');
    const contractNumber = nextContractNumber_();
    contractId = Utilities.getUuid();
    const timestamp = nowIso_();
    const folder = createContractFolder_(contractNumber, data.clientName, data.eventDate);
    const client = upsertClientForContract_(data, contractNumber, timestamp);

    let contract = {
      id: contractId,
      requestId,
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
      clientId: client.id,
      ineFileId: client.contractIneFileId || client.ineFileId || '',
      clientName: String(data.clientName).trim(),
      address: String(data.address).trim(),
      phone: String(data.phone).trim(),
      total: validation.total,
      initialDeposit: validation.initialDeposit,
      paid: validation.initialDeposit,
      balance: roundMoney_(validation.total - validation.initialDeposit),
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
      initialPayment = {
        id: Utilities.getUuid(),
        requestId: `${requestId}:initial`,
        status: 'GENERANDO',
        contractId,
        contractNumber,
        date: data.elaborationDate,
        amount: validation.initialDeposit,
        method: data.paymentMethod || 'No indicado',
        note: 'Apartado inicial',
        receiptFileId: '',
        createdBy: user.email,
        createdAt: timestamp,
        newPaid: validation.initialDeposit,
        newBalance: roundMoney_(validation.total - validation.initialDeposit),
        errorMessage: ''
      };
      appendObject_('Pagos', initialPayment);
    }

    const generated = generateContractPdf_(contract, folder);
    contract.currentPdfFileId = generated.pdfFileId;
    contract.status = contract.balance === 0 ? 'PAGADO' : 'CONFIRMADO';
    if (initialPayment) {
      try {
        const receipt = generateReceiptPdf_(contract, initialPayment, folder);
        initialPayment = updateObject_('Pagos', 'id', initialPayment.id, {
          receiptFileId: receipt.pdfFileId,
          status: 'COMPLETADO',
          errorMessage: ''
        });
      } catch (receiptError) {
        updateObject_('Pagos', 'id', initialPayment.id, {
          status: 'ERROR',
          errorMessage: String(receiptError.message || receiptError).slice(0, 500)
        });
        try { audit_('ERROR_RECIBO_INICIAL', 'Pago', initialPayment.id, { message: receiptError.message }); } catch (ignored) {}
      }
    }
    let calendarPending = false;
    try {
      contract.calendarEventId = createCalendarEvent_(contract);
    } catch (calendarError) {
      calendarPending = true;
      try { audit_('CALENDARIO_PENDIENTE', 'Contrato', contractId, { message: calendarError.message }); } catch (ignored) {}
    }
    contract.updatedAt = nowIso_();
    contract = updateObject_('Contratos', 'id', contractId, contract);
    try { audit_('CREAR_CONTRATO', 'Contrato', contractId, { contractNumber, version: 1, calendarPending }); }
    catch (ignored) {}
    return contract;
  } catch (error) {
    if (initialPayment && String(initialPayment.status) !== 'COMPLETADO') {
      try {
        initialPayment = updateObject_('Pagos', 'id', initialPayment.id, {
          status: 'ERROR',
          errorMessage: String(error.message || error).slice(0, 500)
        });
      } catch (ignored) {}
    }
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
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSchema_();
    const existing = findObject_('Contratos', 'id', data.id);
    if (!existing) throw new Error('No se encontró el contrato.');
    if (existing.status === 'CANCELADO') throw new Error('Un contrato cancelado no puede modificarse.');
    if (data.expectedVersion !== undefined && Number(data.expectedVersion) !== Number(existing.version)) {
      throw new Error('El contrato cambió en otra sesión. Actualiza el panel antes de guardar.');
    }
    const merged = Object.assign({}, existing, data);
    const validation = validateContractPayload_(merged, existing.id);
    const alreadyPaid = roundMoney_(existing.paid);
    if (validation.total < alreadyPaid) throw new Error('El nuevo total no puede ser menor que lo ya pagado.');

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
      paid: alreadyPaid,
      balance: roundMoney_(validation.total - alreadyPaid),
      overrideReason: String(merged.overrideReason || '').trim(),
      updatedBy: user.email
    });
    updated.status = updated.balance === 0 ? 'PAGADO' : 'CONFIRMADO';
    const folder = DriveApp.getFolderById(existing.folderId);
    const generated = generateContractPdf_(updated, folder);
    updated.currentPdfFileId = generated.pdfFileId;
    let calendarPending = false;
    try {
      updated.calendarEventId = updateCalendarEvent_(updated);
    } catch (calendarError) {
      calendarPending = true;
      try { audit_('CALENDARIO_PENDIENTE', 'Contrato', existing.id, { message: calendarError.message }); } catch (ignored) {}
    }
    const saved = updateObject_('Contratos', 'id', existing.id, updated);
    updateObject_('Clientes', 'id', existing.clientId, {
      name: updated.clientName,
      address: updated.address,
      phone: updated.phone,
      updatedAt: updated.updatedAt
    });
    let initialPaymentRepaired = false;
    try { initialPaymentRepaired = Boolean(repairInitialPayment_(saved, folder)); }
    catch (repairError) {
      try { audit_('ERROR_REPARAR_RECIBO_INICIAL', 'Contrato', existing.id, { message: repairError.message }); }
      catch (ignored) {}
    }
    try { audit_('ACTUALIZAR_CONTRATO', 'Contrato', existing.id, { version: updated.version, calendarPending, initialPaymentRepaired }); }
    catch (ignored) {}
    return saved;
  } finally {
    lock.releaseLock();
  }
}

function addPayment(payload) {
  const user = requireOwner_();
  const data = payload || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let payment = null;
  let financialApplied = false;
  try {
    ensureSchema_();
    const requestId = String(data.requestId || Utilities.getUuid()).trim();
    payment = findObject_('Pagos', 'requestId', requestId);
    const contractId = payment ? payment.contractId : data.contractId;
    let contract = findObject_('Contratos', 'id', contractId);
    if (!contract) throw new Error('No se encontró el contrato.');

    if (payment) {
      if (String(payment.contractId) !== String(data.contractId || payment.contractId) ||
          roundMoney_(payment.amount) !== roundMoney_(data.amount === undefined ? payment.amount : data.amount)) {
        throw new Error('El identificador de esta solicitud ya pertenece a otro pago.');
      }
      if (String(payment.status) === 'COMPLETADO') return { contract, payment };
    } else {
      const pending = listObjects_('Pagos').find(item =>
        String(item.contractId) === String(contract.id) && String(item.status) === 'GENERANDO'
      );
      if (pending) throw new Error('Hay un pago anterior en proceso. Actualiza el panel antes de registrar otro.');
      const validation = validatePaymentPayload_(data, contract);
      payment = {
        id: Utilities.getUuid(),
        requestId,
        status: 'GENERANDO',
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        date: validation.date,
        amount: validation.amount,
        method: String(data.method || 'No indicado').trim(),
        note: String(data.note || 'Abono al contrato').trim(),
        receiptFileId: '',
        createdBy: user.email,
        createdAt: nowIso_(),
        newPaid: roundMoney_(roundMoney_(contract.paid) + validation.amount),
        newBalance: roundMoney_(roundMoney_(contract.balance) - validation.amount),
        errorMessage: ''
      };
      appendObject_('Pagos', payment);
    }

    financialApplied = roundMoney_(contract.paid) === roundMoney_(payment.newPaid) &&
      roundMoney_(contract.balance) === roundMoney_(payment.newBalance);
    if (!financialApplied) {
      const validation = validatePaymentPayload_({
        date: payment.date,
        amount: payment.amount
      }, contract);
      payment.amount = validation.amount;
      payment.newPaid = roundMoney_(roundMoney_(contract.paid) + validation.amount);
      payment.newBalance = roundMoney_(roundMoney_(contract.balance) - validation.amount);
      payment = updateObject_('Pagos', 'id', payment.id, {
        status: 'GENERANDO',
        amount: payment.amount,
        newPaid: payment.newPaid,
        newBalance: payment.newBalance,
        errorMessage: ''
      });
    }

    if (!payment.receiptFileId) {
      const folder = DriveApp.getFolderById(contract.folderId);
      const receipt = generateReceiptPdf_(contract, payment, folder);
      payment = updateObject_('Pagos', 'id', payment.id, {
        receiptFileId: receipt.pdfFileId,
        status: 'GENERANDO',
        errorMessage: ''
      });
    }

    let saved = contract;
    if (!financialApplied) {
      const updated = Object.assign({}, contract, {
        paid: payment.newPaid,
        balance: payment.newBalance,
        status: payment.newBalance === 0 ? 'PAGADO' : 'CONFIRMADO',
        updatedAt: nowIso_(),
        updatedBy: user.email
      });
      saved = updateObject_('Contratos', 'id', contract.id, updated);
      financialApplied = true;
      try {
        const calendarEventId = updateCalendarEvent_(saved);
        if (calendarEventId && String(calendarEventId) !== String(saved.calendarEventId || '')) {
          saved = updateObject_('Contratos', 'id', contract.id, { calendarEventId });
        }
      } catch (calendarError) {
        try { audit_('CALENDARIO_PENDIENTE', 'Contrato', contract.id, { message: calendarError.message }); } catch (ignored) {}
      }
    }

    payment = updateObject_('Pagos', 'id', payment.id, {
      status: 'COMPLETADO',
      errorMessage: ''
    });
    try { audit_('REGISTRAR_PAGO', 'Pago', payment.id, { contractId: contract.id, amount: payment.amount }); }
    catch (ignored) {}
    return { contract: saved, payment };
  } catch (error) {
    if (payment && !financialApplied) {
      try {
        updateObject_('Pagos', 'id', payment.id, {
          status: 'ERROR',
          errorMessage: String(error.message || error).slice(0, 500)
        });
      } catch (ignored) {}
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function cancelContract(payload) {
  const user = requireOwner_();
  const data = payload || {};
  const reason = String(data.reason || '').trim();
  if (!reason) throw new Error('Indica el motivo de la cancelación.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const contract = findObject_('Contratos', 'id', data.id);
    if (!contract) throw new Error('No se encontró el contrato.');
    if (contract.status === 'CANCELADO') return contract;
    if (contract.status === 'GENERANDO') throw new Error('Espera a que termine la creación antes de cancelar.');
    if (data.expectedVersion !== undefined && Number(data.expectedVersion) !== Number(contract.version)) {
      throw new Error('El contrato cambió en otra sesión. Actualiza el panel antes de cancelar.');
    }
    const updated = Object.assign({}, contract, {
      status: 'CANCELADO',
      cancelReason: reason,
      updatedAt: nowIso_(),
      updatedBy: user.email
    });
    const saved = updateObject_('Contratos', 'id', contract.id, updated);
    let calendarPending = false;
    try {
      markCalendarEventCancelled_(saved);
    } catch (calendarError) {
      calendarPending = true;
      try { audit_('CALENDARIO_PENDIENTE', 'Contrato', contract.id, { message: calendarError.message }); } catch (ignored) {}
    }
    try { audit_('CANCELAR_CONTRATO', 'Contrato', contract.id, { reason, calendarPending }); }
    catch (ignored) {}
    return saved;
  } finally {
    lock.releaseLock();
  }
}

function getPrivateIneUrl(payload) {
  requireOwner_();
  const contract = findObject_('Contratos', 'id', payload && payload.id);
  if (!contract) throw new Error('No se encontró el contrato.');
  const client = findObject_('Clientes', 'id', contract.clientId);
  const ineFileId = contract.ineFileId || (client && client.ineFileId);
  if (!ineFileId) throw new Error('Este cliente no tiene una identificación guardada.');
  return DriveApp.getFileById(ineFileId).getUrl();
}

function upsertClientForContract_(data, contractNumber, timestamp) {
  const normalizedName = normalizeClientIdentity_(data.clientName);
  const normalizedPhone = normalizePhone_(data.phone);
  const existing = listObjects_('Clientes').find(client =>
    normalizeClientIdentity_(client.name) === normalizedName &&
    normalizeClientPhoneKey_(client.phone) === normalizedPhone
  );
  const contractIneFileId = data.ineDataUrl
    ? storeIne_(data.ineDataUrl, contractNumber, data.clientName)
    : (existing ? existing.ineFileId : '');
  const clientData = {
    name: String(data.clientName).trim(),
    address: String(data.address).trim(),
    phone: String(data.phone).trim(),
    updatedAt: timestamp
  };
  if (existing) {
    if (!existing.ineFileId && contractIneFileId) clientData.ineFileId = contractIneFileId;
    const saved = updateObject_('Clientes', 'id', existing.id, clientData);
    saved.contractIneFileId = contractIneFileId;
    return saved;
  }
  return appendObject_('Clientes', Object.assign({
    id: Utilities.getUuid(),
    ineFileId: contractIneFileId,
    createdAt: timestamp
  }, clientData));
}

function repairInitialPayment_(contract, folder) {
  const initialDeposit = roundMoney_(contract.initialDeposit || 0);
  if (initialDeposit <= 0) return null;
  const initialBalance = roundMoney_(roundMoney_(contract.total) - initialDeposit);
  const baseRequestId = String(contract.requestId || contract.id || '').trim();
  if (!baseRequestId) throw new Error('El contrato no tiene un identificador para reparar su abono inicial.');
  const requestId = `${baseRequestId}:initial`;
  let payment = findObject_('Pagos', 'requestId', requestId);
  if (!payment) {
    payment = listObjects_('Pagos').find(item => {
      if (String(item.contractId) !== String(contract.id) ||
          String(item.date || '') !== String(contract.elaborationDate || '') ||
          (item.requestId && !String(item.note || '').toLowerCase().includes('apartado inicial'))) return false;
      try { return roundMoney_(item.amount) === initialDeposit; }
      catch (ignored) { return false; }
    }) || null;
    if (payment && !payment.requestId) {
      payment = updateObject_('Pagos', 'id', payment.id, { requestId });
    }
  }
  if (!payment) {
    payment = {
      id: Utilities.getUuid(),
      requestId,
      status: 'GENERANDO',
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      date: contract.elaborationDate,
      amount: initialDeposit,
      method: 'No indicado',
      note: 'Apartado inicial',
      receiptFileId: '',
      createdBy: contract.createdBy,
      createdAt: contract.createdAt || nowIso_(),
      newPaid: initialDeposit,
      newBalance: initialBalance,
      errorMessage: ''
    };
    appendObject_('Pagos', payment);
  }
  if (String(payment.contractId) !== String(contract.id) || roundMoney_(payment.amount) !== initialDeposit) {
    throw new Error('El abono inicial pendiente no coincide con el contrato.');
  }
  if (String(payment.status) === 'COMPLETADO' && payment.receiptFileId) return payment;

  let paidAfterInitial = initialDeposit;
  let balanceAfterInitial = initialBalance;
  try {
    if (payment.newPaid !== '' && payment.newPaid !== undefined && payment.newPaid !== null) {
      paidAfterInitial = roundMoney_(payment.newPaid);
    }
    if (payment.newBalance !== '' && payment.newBalance !== undefined && payment.newBalance !== null) {
      balanceAfterInitial = roundMoney_(payment.newBalance);
    }
  } catch (ignored) {
    paidAfterInitial = initialDeposit;
    balanceAfterInitial = initialBalance;
  }

  try {
    let receiptFileId = payment.receiptFileId;
    if (!receiptFileId) {
      const receipt = generateReceiptPdf_(contract, Object.assign({}, payment, {
        newPaid: paidAfterInitial,
        newBalance: balanceAfterInitial
      }), folder);
      receiptFileId = receipt.pdfFileId;
    }
    return updateObject_('Pagos', 'id', payment.id, {
      status: 'COMPLETADO',
      receiptFileId,
      newPaid: paidAfterInitial,
      newBalance: balanceAfterInitial,
      errorMessage: ''
    });
  } catch (error) {
    try {
      updateObject_('Pagos', 'id', payment.id, {
        status: 'ERROR',
        errorMessage: String(error.message || error).slice(0, 500)
      });
    } catch (ignored) {}
    throw error;
  }
}

function normalizeClientIdentity_(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeClientPhoneKey_(value) {
  try { return normalizePhone_(value); } catch (error) { return ''; }
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
