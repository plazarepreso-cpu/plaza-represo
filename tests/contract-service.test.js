const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function newState() {
  return {
    sheets: { Contratos: [], Pagos: [], Clientes: [] },
    lockWaits: [],
    lockReleases: 0,
    schemaChecks: 0,
    appends: [],
    updates: [],
    audits: [],
    receiptCalls: [],
    contractPdfCalls: [],
    calendarUpdates: [],
    calendarCancellations: [],
    folderReads: [],
    uuid: 0
  };
}

let state = newState();

function rows(sheetName) {
  if (!state.sheets[sheetName]) state.sheets[sheetName] = [];
  return state.sheets[sheetName];
}

const lock = {
  waitLock(milliseconds) {
    state.lockWaits.push(milliseconds);
  },
  releaseLock() {
    state.lockReleases += 1;
  }
};

const context = vm.createContext({
  console,
  APP_CONFIG: {
    TIME_ZONE: 'America/Hermosillo',
    START_CONTRACT_NUMBER: 9001,
    WEEKDAY_RATE: 3500,
    WEEKEND_RATE: 4500,
    EVENT_HOURS: 5
  },
  Utilities: {
    formatDate: () => '2026-07-13T12:00:00',
    getUuid: () => `uuid-ficticio-${++state.uuid}`
  },
  LockService: { getScriptLock: () => lock },
  DriveApp: {
    getFolderById(folderId) {
      state.folderReads.push(folderId);
      return { id: folderId, getId: () => folderId };
    }
  },
  requireOwner_: () => ({
    email: 'propietaria.ficticia@example.com',
    role: 'PROPIETARIO'
  }),
  ensureSchema_: () => {
    state.schemaChecks += 1;
    return {};
  },
  listObjects_: sheetName => rows(sheetName).map(clone),
  findObject_: (sheetName, column, value) => {
    const found = rows(sheetName).find(item => String(item[column]) === String(value));
    return found ? clone(found) : null;
  },
  appendObject_: (sheetName, object) => {
    const saved = clone(object);
    rows(sheetName).push(saved);
    state.appends.push({ sheetName, object: clone(saved) });
    return clone(saved);
  },
  updateObject_: (sheetName, idColumn, id, updates) => {
    const row = rows(sheetName).find(item => String(item[idColumn]) === String(id));
    if (!row) throw new Error(`No se encontró ${id} en ${sheetName}.`);
    Object.assign(row, clone(updates));
    state.updates.push({ sheetName, idColumn, id, updates: clone(updates) });
    return clone(row);
  },
  getSetting_: (key, fallback) => fallback,
  setSetting_: () => {},
  audit_: (action, entityType, entityId, details) => {
    state.audits.push({ action, entityType, entityId, details: clone(details) });
  },
  generateReceiptPdf_: (contract, payment, folder) => {
    state.receiptCalls.push({ contract: clone(contract), payment: clone(payment), folderId: folder.id });
    return { pdfFileId: `recibo-pdf-${payment.id}` };
  },
  generateContractPdf_: (contract, folder) => {
    state.contractPdfCalls.push({ contract: clone(contract), folderId: folder.id });
    return { pdfFileId: `contrato-pdf-${contract.id}` };
  },
  updateCalendarEvent_: contract => {
    state.calendarUpdates.push(clone(contract));
    return contract.calendarEventId || `evento-calendario-${contract.id}`;
  },
  markCalendarEventCancelled_: contract => {
    state.calendarCancellations.push(clone(contract));
  },
  createCalendarEvent_: contract => `evento-calendario-${contract.id}`,
  createContractFolder_: () => {
    throw new Error('No debe crearse una carpeta para una solicitud repetida incompleta.');
  },
  upsertClientForContract_: () => {
    throw new Error('No debe persistirse un cliente para una solicitud repetida incompleta.');
  }
});

vm.runInContext(fs.readFileSync('src/Domain.gs', 'utf8'), context);
vm.runInContext(fs.readFileSync('src/ContractService.gs', 'utf8'), context);

function reset() {
  state = newState();
}

function seedContract(overrides = {}) {
  const contract = {
    id: 'contrato-ficticio-001',
    requestId: 'solicitud-contrato-ficticia-001',
    contractNumber: 'C.9001',
    version: 3,
    status: 'CONFIRMADO',
    paid: 1000.1,
    balance: 2499.9,
    total: 3500,
    folderId: 'carpeta-ficticia-001',
    calendarEventId: 'evento-ficticio-001',
    clientId: 'cliente-ficticio-001',
    clientName: 'Cliente Ficticio',
    address: 'Domicilio ficticio 123',
    phone: '0000000000',
    elaborationDate: '2026-07-13',
    eventDate: '2026-08-03',
    startTime: '18:00',
    endTime: '23:00',
    eventType: 'Evento ficticio',
    overrideReason: ''
  };
  Object.assign(contract, overrides);
  state.sheets.Contratos.push(contract);
  return contract;
}

let passed = 0;
function test(name, callback) {
  reset();
  try {
    callback();
    passed += 1;
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

test('addPayment bloquea, redondea, persiste requestId y no duplica un reintento', () => {
  seedContract();
  const payload = {
    requestId: 'solicitud-pago-ficticia-001',
    contractId: 'contrato-ficticio-001',
    date: '2026-07-13',
    amount: 0.1 + 0.2,
    method: 'Efectivo ficticio',
    note: 'Abono de prueba ficticio'
  };

  const first = clone(context.addPayment(payload));
  assert.strictEqual(first.payment.requestId, 'solicitud-pago-ficticia-001');
  assert.strictEqual(first.payment.amount, 0.3);
  assert.strictEqual(first.payment.status, 'COMPLETADO');
  assert.strictEqual(first.contract.paid, 1000.4);
  assert.strictEqual(first.contract.balance, 2499.6);
  assert.strictEqual(first.contract.status, 'CONFIRMADO');
  assert.strictEqual(state.sheets.Pagos.length, 1);
  assert.strictEqual(state.sheets.Pagos[0].requestId, 'solicitud-pago-ficticia-001');
  assert.strictEqual(state.receiptCalls.length, 1);
  assert.strictEqual(state.calendarUpdates.length, 1);
  assert.deepStrictEqual(state.lockWaits, [30000]);
  assert.strictEqual(state.lockReleases, 1);

  const updateCount = state.updates.length;
  const auditCount = state.audits.length;
  const second = clone(context.addPayment(payload));
  assert.strictEqual(second.contract.paid, 1000.4);
  assert.strictEqual(second.contract.balance, 2499.6);
  assert.strictEqual(second.payment.id, first.payment.id);
  assert.strictEqual(state.sheets.Pagos.length, 1);
  assert.strictEqual(state.receiptCalls.length, 1);
  assert.strictEqual(state.calendarUpdates.length, 1);
  assert.strictEqual(state.updates.length, updateCount);
  assert.strictEqual(state.audits.length, auditCount);
  assert.deepStrictEqual(state.lockWaits, [30000, 30000]);
  assert.strictEqual(state.lockReleases, 2);
});

test('addPayment rechaza un monto superior al saldo y libera el bloqueo', () => {
  seedContract({ paid: 3490, balance: 10 });

  assert.throws(() => context.addPayment({
    requestId: 'solicitud-pago-ficticia-saldo',
    contractId: 'contrato-ficticio-001',
    date: '2026-07-13',
    amount: 10.01
  }), /exceder el saldo/);

  assert.strictEqual(state.sheets.Pagos.length, 0);
  assert.deepStrictEqual(state.lockWaits, [30000]);
  assert.strictEqual(state.lockReleases, 1);
});

test('addPayment rechaza contratos que no aceptan pagos y libera el bloqueo', () => {
  seedContract({ status: 'CANCELADO' });

  assert.throws(() => context.addPayment({
    requestId: 'solicitud-pago-ficticia-estado',
    contractId: 'contrato-ficticio-001',
    date: '2026-07-13',
    amount: 100
  }), /estado actual/);

  assert.strictEqual(state.sheets.Pagos.length, 0);
  assert.deepStrictEqual(state.lockWaits, [30000]);
  assert.strictEqual(state.lockReleases, 1);
});

test('updateContract rechaza expectedVersion obsoleta y siempre libera el bloqueo', () => {
  seedContract({ version: 7 });

  assert.throws(() => context.updateContract({
    id: 'contrato-ficticio-001',
    expectedVersion: 6
  }), /cambió en otra sesión/);

  assert.deepStrictEqual(state.lockWaits, [30000]);
  assert.strictEqual(state.lockReleases, 1);
  assert.strictEqual(state.updates.length, 0);
  assert.strictEqual(state.contractPdfCalls.length, 0);
  assert.strictEqual(state.calendarUpdates.length, 0);
});

test('cancelContract es idempotente y libera el bloqueo sin repetir efectos', () => {
  seedContract({
    version: 4,
    status: 'CANCELADO',
    cancelReason: 'Motivo ficticio ya registrado'
  });

  const saved = clone(context.cancelContract({
    id: 'contrato-ficticio-001',
    expectedVersion: 3,
    reason: 'Reintento ficticio'
  }));

  assert.strictEqual(saved.status, 'CANCELADO');
  assert.strictEqual(saved.cancelReason, 'Motivo ficticio ya registrado');
  assert.deepStrictEqual(state.lockWaits, [30000]);
  assert.strictEqual(state.lockReleases, 1);
  assert.strictEqual(state.updates.length, 0);
  assert.strictEqual(state.calendarCancellations.length, 0);
  assert.strictEqual(state.audits.length, 0);
});

test('createContract no presenta solicitudes ERROR o GENERANDO como éxitos idempotentes', () => {
  ['ERROR', 'GENERANDO'].forEach((status, index) => {
    state.sheets.Contratos = [{
      id: `contrato-ficticio-incompleto-${index}`,
      requestId: `solicitud-contrato-incompleta-${index}`,
      contractNumber: `C.90${index + 10}`,
      status
    }];

    assert.throws(() => context.createContract({
      requestId: `solicitud-contrato-incompleta-${index}`
    }), /quedó incompleto/);
  });

  assert.deepStrictEqual(state.lockWaits, [30000, 30000]);
  assert.strictEqual(state.lockReleases, 2);
  assert.strictEqual(state.appends.length, 0);
  assert.strictEqual(state.updates.length, 0);
  assert.strictEqual(state.contractPdfCalls.length, 0);
  assert.strictEqual(state.calendarUpdates.length, 0);
});

console.log(`${passed} casos de ContractService verificados correctamente.`);
