function normalizeHistoricalContract_(record) {
  const source = record || {};
  const contractNumber = String(source.contractNumber || '').trim().toUpperCase();
  if (!/^C\.\d{4,}$/.test(contractNumber)) throw new Error('El número histórico debe usar el formato C.0000.');

  const paid = roundMoney_(source.paid);
  const total = roundMoney_(source.total);
  const expectedBalance = roundMoney_(total - paid);
  if (paid < 0 || paid > total) throw new Error(`${contractNumber}: el pago histórico no es válido.`);
  if (source.balance !== undefined && source.balance !== null && source.balance !== '' &&
      roundMoney_(source.balance) !== expectedBalance) {
    throw new Error(`${contractNumber}: pago y saldo no coinciden con el total.`);
  }

  return {
    contractNumber,
    elaborationDate: String(source.elaborationDate || '').trim(),
    eventDate: String(source.eventDate || '').trim(),
    startTime: String(source.startTime || '').trim(),
    endTime: String(source.endTime || '').trim(),
    eventType: String(source.eventType || '').trim(),
    clientName: String(source.clientName || '').trim(),
    address: String(source.address || '').trim(),
    phone: String(source.phone || '').trim(),
    total,
    initialDeposit: paid,
    paid,
    balance: expectedBalance,
    paymentMethod: String(source.paymentMethod || 'No indicado').trim(),
    overrideReason: String(source.overrideReason || '').trim(),
    reviewNotes: Array.isArray(source.reviewNotes) ? source.reviewNotes.map(String).join(' ') : String(source.reviewNotes || '')
  };
}

function listHistoricalContracts_() {
  try {
    return listObjects_('Historial').sort((a, b) =>
      String(a.eventDate || '').localeCompare(String(b.eventDate || ''))
    );
  } catch (error) {
    return [];
  }
}

/**
 * Crea únicamente un índice privado de contratos que ya existen en Drive y Calendar.
 * No genera PDFs, recibos, carpetas ni eventos, por lo que no duplica el historial.
 */
function indexHistoricalContracts(payload) {
  const owner = requireOwner_();
  const records = Array.isArray(payload) ? payload : (payload && payload.records);
  if (!Array.isArray(records) || !records.length) throw new Error('No hay contratos anteriores para indexar.');
  if (records.length > 100) throw new Error('Solo se permiten 100 contratos por indexación.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSchema_();
    const existing = listObjects_('Historial');
    const byNumber = new Map(existing.map(item => [String(item.contractNumber || '').toUpperCase(), item]));
    // Una reindexación sirve para corregir datos extraídos de los archivos
    // anteriores, pero nunca debe borrar un abono que ya se registró desde el
    // sistema ni abrir otra vez un saldo ya liquidado.
    const contractsWithRegisteredPayments = new Set(
      listObjects_('Pagos')
        .filter(payment => String(payment.status || '').toUpperCase() === 'COMPLETADO')
        .map(payment => String(payment.contractId || '').trim())
        .filter(Boolean)
    );
    let indexed = 0;
    let updated = 0;
    const results = [];

    records.forEach(record => {
      try {
        const data = normalizeHistoricalContract_(record);
        const timestamp = nowIso_();
        const item = {
          id: `historial:${data.contractNumber}`,
          contractNumber: data.contractNumber,
          status: data.balance === 0 ? 'PAGADO' : 'CONFIRMADO',
          elaborationDate: data.elaborationDate,
          eventDate: data.eventDate,
          eventDay: eventDayName_(data.eventDate),
          startTime: data.startTime,
          endTime: data.endTime,
          eventType: data.eventType,
          clientName: data.clientName,
          address: data.address,
          phone: data.phone,
          total: data.total,
          paid: data.paid,
          balance: data.balance,
          source: 'ARCHIVO_ANTERIOR',
          updatedAt: timestamp
        };
        const previous = byNumber.get(data.contractNumber);
        if (previous) {
          const preserveFinancials = contractsWithRegisteredPayments.has(String(previous.id || '').trim());
          if (preserveFinancials) {
            item.total = roundMoney_(previous.total);
            item.paid = roundMoney_(previous.paid);
            item.balance = roundMoney_(previous.balance);
            item.status = String(previous.status || (item.balance === 0 ? 'PAGADO' : 'CONFIRMADO')).toUpperCase();
          }
          updateObject_('Historial', 'id', previous.id, item);
          updated += 1;
          results.push({
            contractNumber:data.contractNumber,
            status:preserveFinancials ? 'ACTUALIZADO_CON_SALDO_PROTEGIDO' : 'ACTUALIZADO'
          });
        } else {
          appendObject_('Historial', item);
          byNumber.set(data.contractNumber, item);
          indexed += 1;
          results.push({ contractNumber:data.contractNumber, status:'INDEXADO' });
        }
      } catch (error) {
        results.push({
          contractNumber:String(record && record.contractNumber || 'SIN NÚMERO'),
          status:'ERROR',
          message:String(error.message || error)
        });
      }
    });

    const summary = {
      indexed,
      updated,
      errors:results.filter(result => result.status === 'ERROR').length,
      results
    };
    try { audit_('INDEXAR_HISTORIAL_EXISTENTE', 'Sistema', owner.email, summary); }
    catch (ignored) {}
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function importHistoricalContract_(record, owner) {
  const data = normalizeHistoricalContract_(record);
  const existing = findObject_('Contratos', 'contractNumber', data.contractNumber);
  if (existing) return { contractNumber:data.contractNumber, status:'OMITIDO', message:'Ya existe.' };

  const validation = validateContractPayload_(data, '');
  const contractId = Utilities.getUuid();
  const requestId = `historico:${data.contractNumber}`;
  const timestamp = `${data.elaborationDate}T12:00:00`;
  const folder = createContractFolder_(data.contractNumber, data.clientName, data.eventDate);
  const client = upsertClientForContract_(data, data.contractNumber, timestamp);
  let payment = null;
  let contract = {
    id: contractId,
    requestId,
    contractNumber: data.contractNumber,
    version: 1,
    status: 'GENERANDO',
    createdAt: timestamp,
    updatedAt: timestamp,
    elaborationDate: data.elaborationDate,
    eventDate: data.eventDate,
    eventDay: eventDayName_(data.eventDate),
    startTime: data.startTime,
    endTime: data.endTime,
    eventType: data.eventType,
    clientId: client.id,
    ineFileId: '',
    clientName: data.clientName,
    address: data.address,
    phone: data.phone,
    total: validation.total,
    initialDeposit: data.paid,
    paid: data.paid,
    balance: data.balance,
    overrideReason: data.overrideReason,
    folderId: folder.getId(),
    currentPdfFileId: '',
    calendarEventId: '',
    createdBy: owner.email,
    updatedBy: owner.email,
    cancelReason: ''
  };
  appendObject_('Contratos', contract);

  try {
    if (data.paid > 0) {
      payment = {
        id: Utilities.getUuid(),
        requestId: `${requestId}:payment`,
        status: 'GENERANDO',
        contractId,
        contractNumber: data.contractNumber,
        date: data.elaborationDate,
        amount: data.paid,
        method: data.paymentMethod,
        note: 'Pago registrado en contrato anterior',
        receiptFileId: '',
        createdBy: owner.email,
        createdAt: timestamp,
        newPaid: data.paid,
        newBalance: data.balance,
        errorMessage: ''
      };
      appendObject_('Pagos', payment);
    }

    contract.currentPdfFileId = generateContractPdf_(contract, folder).pdfFileId;
    contract.status = data.balance === 0 ? 'PAGADO' : 'CONFIRMADO';
    if (payment) {
      const receipt = generateReceiptPdf_(contract, payment, folder);
      updateObject_('Pagos', 'id', payment.id, {
        receiptFileId: receipt.pdfFileId,
        status: 'COMPLETADO',
        errorMessage: ''
      });
    }
    try { contract.calendarEventId = createCalendarEvent_(contract); }
    catch (calendarError) {
      try { audit_('CALENDARIO_PENDIENTE', 'Contrato', contractId, { message:calendarError.message }); }
      catch (ignored) {}
    }
    contract.updatedAt = nowIso_();
    contract = updateObject_('Contratos', 'id', contractId, contract);
    try { audit_('IMPORTAR_CONTRATO_HISTORICO', 'Contrato', contractId, { contractNumber:data.contractNumber }); }
    catch (ignored) {}
    return { contractNumber:data.contractNumber, status:'IMPORTADO', id:contractId };
  } catch (error) {
    try { updateObject_('Contratos', 'id', contractId, { status:'ERROR', updatedAt:nowIso_() }); }
    catch (ignored) {}
    if (payment) {
      try { updateObject_('Pagos', 'id', payment.id, { status:'ERROR', errorMessage:String(error.message || error).slice(0, 500) }); }
      catch (ignored) {}
    }
    throw error;
  }
}

function importHistoricalContracts(payload) {
  const owner = requireOwner_();
  const records = Array.isArray(payload) ? payload : (payload && payload.records);
  if (!Array.isArray(records) || !records.length) throw new Error('Selecciona un archivo con contratos históricos.');
  if (records.length > 100) throw new Error('Solo se permiten 100 contratos por importación.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSchema_();
    const seen = new Set();
    const results = records.map(record => {
      const number = String(record && record.contractNumber || '').trim().toUpperCase();
      if (seen.has(number)) return { contractNumber:number, status:'ERROR', message:'Número repetido en el archivo.' };
      seen.add(number);
      try { return importHistoricalContract_(record, owner); }
      catch (error) { return { contractNumber:number || 'SIN NÚMERO', status:'ERROR', message:String(error.message || error) }; }
    });

    const knownNumbers = listObjects_('Contratos')
      .map(contract => Number(String(contract.contractNumber || '').replace(/\D/g, '')))
      .filter(Number.isFinite);
    if (knownNumbers.length) {
      const nextImported = Math.max(...knownNumbers) + 1;
      const configured = Number(getSetting_('NEXT_CONTRACT_NUMBER', APP_CONFIG.START_CONTRACT_NUMBER));
      if (!Number.isFinite(configured) || configured < nextImported) setSetting_('NEXT_CONTRACT_NUMBER', nextImported);
    }

    const summary = {
      imported: results.filter(result => result.status === 'IMPORTADO').length,
      skipped: results.filter(result => result.status === 'OMITIDO').length,
      errors: results.filter(result => result.status === 'ERROR').length,
      results
    };
    try { audit_('IMPORTAR_HISTORICOS', 'Sistema', 'historicos', summary); }
    catch (ignored) {}
    return summary;
  } finally {
    lock.releaseLock();
  }
}
