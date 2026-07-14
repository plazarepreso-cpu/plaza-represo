const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const state = {
  contracts: [],
  history: [{
    contractNumber:'C.2623',
    clientName:'Cliente Histórica Ficticia',
    address:'Calle Privada Ficticia 23',
    phone:'0000002623'
  }],
  clients: [],
  stored: [],
  trashed: [],
  audits: [],
  ownerChecks: 0,
  uuid: 0,
  lockReleases: 0
};

function rows(sheetName) {
  return ({ Contratos:state.contracts, Historial:state.history, Clientes:state.clients })[sheetName] || [];
}

const context = vm.createContext({
  console,
  Utilities: { getUuid: () => `cliente-ficticio-${++state.uuid}` },
  LockService: {
    getScriptLock: () => ({
      waitLock: milliseconds => assert.strictEqual(milliseconds, 30000),
      releaseLock: () => { state.lockReleases += 1; }
    })
  },
  DriveApp: {
    getFileById: id => ({ setTrashed: value => state.trashed.push({ id, value }) })
  },
  requireOwner_: () => {
    state.ownerChecks += 1;
    return { email:'propietaria.ficticia@example.com', role:'PROPIETARIO' };
  },
  ensureSchema_: () => {},
  findObject_: (sheetName, column, value) => rows(sheetName).find(item => String(item[column]) === String(value)) || null,
  listObjects_: sheetName => rows(sheetName).map(item => ({ ...item })),
  appendObject_: (sheetName, object) => {
    rows(sheetName).push({ ...object });
    return { ...object };
  },
  updateObject_: (sheetName, column, value, updates) => {
    const item = rows(sheetName).find(candidate => String(candidate[column]) === String(value));
    if (!item) throw new Error(`No se encontró ${value}`);
    Object.assign(item, updates);
    return { ...item };
  },
  normalizeClientIdentity_: value => String(value || '').trim().toLowerCase(),
  normalizeClientPhoneKey_: value => String(value || '').replace(/\D/g, ''),
  storeIne_: (dataUrl, contractNumber, clientName) => {
    const fileId = `archivo-ine-privado-${state.stored.length + 1}`;
    state.stored.push({ dataUrl, contractNumber, clientName, fileId });
    return fileId;
  },
  nowIso_: () => '2026-07-13T12:00:00',
  audit_: (action, entityType, entityId, details) => state.audits.push({ action, entityType, entityId, details })
});

vm.runInContext(fs.readFileSync('src/HistoricalIneService.gs', 'utf8'), context);

const dataUrl = 'data:image/png;base64,SU1BR0VOX0ZJQ1RJQ0lB';
const imported = context.importHistoricalIne({ contractNumber:'2623', ineDataUrl:dataUrl });
assert.strictEqual(imported.status, 'RESGUARDADA');
assert.strictEqual(state.ownerChecks, 1, 'el endpoint exige al propietario');
assert.strictEqual(state.clients.length, 1);
assert.strictEqual(state.clients[0].name, 'Cliente Histórica Ficticia');
assert.strictEqual(state.clients[0].address, 'Calle Privada Ficticia 23');
assert.strictEqual(state.clients[0].phone, '0000002623');
assert.strictEqual(state.clients[0].ineFileId, 'archivo-ine-privado-1');
assert.strictEqual(state.stored.length, 1);
assert.strictEqual(state.audits.length, 1);
const auditJson = JSON.stringify(state.audits[0]);
assert.doesNotMatch(auditJson, /archivo-ine-privado|SU1BR0VO|ineFileId|data:image/, 'la auditoría no persiste el archivo privado ni la imagen');

const duplicate = context.importHistoricalIne({ contractNumber:'C.2623', ineDataUrl:dataUrl });
assert.strictEqual(duplicate.status, 'YA_RESGUARDADA');
assert.strictEqual(state.stored.length, 1, 'no duplica una INE ya resguardada');
assert.strictEqual(state.clients.length, 1, 'no duplica al cliente histórico');
assert.strictEqual(state.audits.length, 1, 'la detección de duplicado tampoco crea otra auditoría');

assert.throws(
  () => context.importHistoricalIne({ contractNumber:'C.9999', ineDataUrl:dataUrl }),
  /no existe un contrato indexado/i,
  'rechaza números sin historial ni contrato gestionado'
);
assert.strictEqual(state.stored.length, 1, 'el rechazo ocurre antes de guardar el archivo');
assert.strictEqual(state.lockReleases, 3, 'siempre libera el bloqueo');

console.log('Resguardo histórico de INE verificado: propietario, asociación, privacidad y duplicados.');
