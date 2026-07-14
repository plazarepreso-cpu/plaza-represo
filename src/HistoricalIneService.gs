function normalizeHistoricalIneContractNumber_(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^\d{4,}$/.test(digits)) throw new Error('El número debe usar el formato C.0000.');
  return `C.${digits}`;
}

/**
 * Resguarda una INE histórica que el propietario selecciona desde su equipo.
 * La imagen nunca se agrega al repositorio ni se comparte con cuentas de consulta.
 */
function importHistoricalIne(payload) {
  const owner = requireOwner_();
  const data = payload || {};
  const contractNumber = normalizeHistoricalIneContractNumber_(data.contractNumber);
  const imageDataUrl = String(data.ineDataUrl || '');
  if (!imageDataUrl) throw new Error(`${contractNumber}: falta la imagen de la INE.`);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let storedFileId = '';
  try {
    ensureSchema_();
    const managed = findObject_('Contratos', 'contractNumber', contractNumber);
    const historical = findObject_('Historial', 'contractNumber', contractNumber);
    const source = managed || historical;
    if (!source) throw new Error(`${contractNumber}: no existe un contrato indexado para asociar la INE.`);

    const clientName = String(source.clientName || '').trim();
    const address = String(source.address || '').trim();
    const phone = String(source.phone || '').trim();
    if (!clientName) throw new Error(`${contractNumber}: el contrato no tiene nombre de cliente.`);

    const nameKey = normalizeClientIdentity_(clientName);
    const phoneKey = normalizeClientPhoneKey_(phone);
    const existing = listObjects_('Clientes').find(client =>
      normalizeClientIdentity_(client.name) === nameKey &&
      (!phoneKey || normalizeClientPhoneKey_(client.phone) === phoneKey)
    );
    if (existing && existing.ineFileId) {
      return { contractNumber, status:'YA_RESGUARDADA', clientId:existing.id, hasIne:true };
    }

    storedFileId = storeIne_(imageDataUrl, contractNumber, clientName);
    const timestamp = nowIso_();
    let client;
    if (existing) {
      client = updateObject_('Clientes', 'id', existing.id, {
        name:clientName,
        address:address || existing.address,
        phone:phone || existing.phone,
        ineFileId:storedFileId,
        updatedAt:timestamp
      });
    } else {
      client = appendObject_('Clientes', {
        id:Utilities.getUuid(),
        name:clientName,
        address,
        phone,
        ineFileId:storedFileId,
        createdAt:timestamp,
        updatedAt:timestamp
      });
    }
    if (managed && !managed.ineFileId) {
      updateObject_('Contratos', 'id', managed.id, {
        clientId:client.id,
        ineFileId:storedFileId,
        updatedAt:timestamp,
        updatedBy:owner.email
      });
    }
    try {
      audit_('RESGUARDAR_INE_HISTORICA', 'Contrato', contractNumber, {
        clientId:client.id,
        source:managed ? 'CONTRATO' : 'HISTORIAL'
      });
    } catch (ignored) {}
    return { contractNumber, status:'RESGUARDADA', clientId:client.id, hasIne:true };
  } catch (error) {
    if (storedFileId) {
      try { DriveApp.getFileById(storedFileId).setTrashed(true); }
      catch (ignored) {}
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function normalizeHistoricalIneFileName_(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function findHistoricalIneFile_(contractNumber) {
  const number = normalizeHistoricalIneContractNumber_(contractNumber);
  const digits = number.replace(/\D/g, '');
  const files = DriveApp.searchFiles(`title contains '${digits}' and trashed = false`);
  const candidates = [];
  const pattern = new RegExp(`(^|[^a-z0-9])c[\\s._-]*${digits}[\\s._-]+ine([^a-z0-9]|$)`);
  while (files.hasNext()) {
    const file = files.next();
    let name = '';
    let mimeType = '';
    try {
      name = String(file.getName() || '');
      mimeType = String(file.getMimeType() || '').toLowerCase();
    } catch (error) {
      continue;
    }
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(mimeType)) continue;
    if (!pattern.test(normalizeHistoricalIneFileName_(name))) continue;
    candidates.push({ file, name });
  }
  if (!candidates.length) return null;
  if (candidates.length > 1) {
    return { ambiguous:true, candidateNames:candidates.map(item => item.name).sort() };
  }
  return candidates[0];
}

function attachHistoricalIneFile_(contractNumber, file, owner) {
  const managed = findObject_('Contratos', 'contractNumber', contractNumber);
  const historical = findObject_('Historial', 'contractNumber', contractNumber);
  const source = managed || historical;
  if (!source) throw new Error(`${contractNumber}: no existe un contrato indexado para asociar la INE.`);

  const clientName = String(source.clientName || '').trim();
  const address = String(source.address || '').trim();
  const phone = String(source.phone || '').trim();
  if (!clientName) throw new Error(`${contractNumber}: el contrato no tiene nombre de cliente.`);
  const nameKey = normalizeClientIdentity_(clientName);
  const phoneKey = normalizeClientPhoneKey_(phone);
  const existing = listObjects_('Clientes').find(client =>
    normalizeClientIdentity_(client.name) === nameKey &&
    (!phoneKey || normalizeClientPhoneKey_(client.phone) === phoneKey)
  );
  if (existing && existing.ineFileId) {
    return { contractNumber, status:'YA_RESGUARDADA', clientId:existing.id, hasIne:true };
  }

  const privateFolderId = String(
    PropertiesService.getScriptProperties().getProperty('PRIVATE_INE_FOLDER_ID') || ''
  ).trim();
  if (!privateFolderId) throw new Error('La carpeta privada de identificaciones no está configurada.');
  if (!isFileInsideFolder_(file, privateFolderId)) {
    file.moveTo(DriveApp.getFolderById(privateFolderId));
  }
  const fileId = file.getId();
  const timestamp = nowIso_();
  let client;
  if (existing) {
    client = updateObject_('Clientes', 'id', existing.id, {
      name:clientName,
      address:address || existing.address,
      phone:phone || existing.phone,
      ineFileId:fileId,
      updatedAt:timestamp
    });
  } else {
    client = appendObject_('Clientes', {
      id:Utilities.getUuid(),
      name:clientName,
      address,
      phone,
      ineFileId:fileId,
      createdAt:timestamp,
      updatedAt:timestamp
    });
  }
  if (managed && !managed.ineFileId) {
    updateObject_('Contratos', 'id', managed.id, {
      clientId:client.id,
      ineFileId:fileId,
      updatedAt:timestamp,
      updatedBy:owner.email
    });
  }
  try {
    audit_('VINCULAR_INE_HISTORICA', 'Contrato', contractNumber, {
      clientId:client.id,
      source:managed ? 'CONTRATO' : 'HISTORIAL'
    });
  } catch (ignored) {}
  return { contractNumber, status:'RESGUARDADA', clientId:client.id, hasIne:true };
}

/**
 * Localiza las INE históricas que ya están en Drive, las mueve al resguardo
 * privado y las asocia con sus clientes. Nunca procesa números solo de Calendar.
 */
function syncHistoricalIneFiles() {
  const owner = requireOwner_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSchema_();
    const numbers = listObjects_('Historial')
      .map(item => normalizeHistoricalIneContractNumber_(item.contractNumber))
      .filter((number, index, all) => all.indexOf(number) === index);
    const results = numbers.map(contractNumber => {
      try {
        const match = findHistoricalIneFile_(contractNumber);
        if (!match) return { contractNumber, status:'NO_ENCONTRADA' };
        if (match.ambiguous) return { contractNumber, status:'AMBIGUA', candidateNames:match.candidateNames };
        return attachHistoricalIneFile_(contractNumber, match.file, owner);
      } catch (error) {
        return { contractNumber, status:'ERROR', message:String(error.message || error) };
      }
    });
    const summary = {
      secured:results.filter(item => item.status === 'RESGUARDADA').length,
      existing:results.filter(item => item.status === 'YA_RESGUARDADA').length,
      missing:results.filter(item => item.status === 'NO_ENCONTRADA').length,
      ambiguous:results.filter(item => item.status === 'AMBIGUA').length,
      errors:results.filter(item => item.status === 'ERROR').length,
      results
    };
    try { audit_('PROTEGER_INE_HISTORICAS', 'Sistema', owner.email, summary); }
    catch (ignored) {}
    return summary;
  } finally {
    lock.releaseLock();
  }
}
