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
    folderCreations: 0,
    clientUpserts: 0,
    throwOnAudit: false,
    throwOnContractPdf: false,
    throwOnReceipt: false,
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
    if (state.throwOnAudit) throw new Error('Fallo ficticio de auditoría');
    state.audits.push({ action, entityType, entityId, details: clone(details) });
  },
  generateReceiptPdf_: (contract, payment, folder) => {
    state.receiptCalls.push({ contract: clone(contract), payment: clone(payment), folderId: folder.id });
    if (state.throwOnReceipt) throw new Error('Fallo ficticio al generar recibo');
    return { pdfFileId: `recibo-pdf-${payment.id}` };
  },
  generateContractPdf_: (contract, folder) => {
    state.contractPdfCalls.push({ contract: clone(contract), folderId: folder.id });
    if (state.throwOnContractPdf) throw new Error('Fallo ficticio al generar contrato PDF');
    return { pdfFileId: `contrato-pdf-${contract.id}` };
  },
  updateCalendarEvent_: contract => {
    state.calendarUpdates.push(clone(contract));
    return contract.calendarEventId || `evento-calendario-${contract.id}`;
  },
  markCalendarEventCancelled_: contract => {
    state.calendarCancellations.push(clone(contract));
  },
  createCalendarEvent_: contract => `evento-calendario-${contract.id}`
});

vm.runInContext(fs.readFileSync('src/Domain.gs', 'utf8'), context);
vm.runInContext(fs.readFileSync('src/ContractService.gs', 'utf8'), context);
const productionUpsertClientForContract = context.upsertClientForContract_;
context.createContractFolder_ = () => {
  state.folderCreations += 1;
  return { id:'carpeta-contrato-ficticia', getId:() => 'carpeta-contrato-ficticia' };
};
context.upsertClientForContract_ = () => {
  state.clientUpserts += 1;
  return { id:'cliente-ficticio-001', ineFileId:'archivo-ine-ficticio-001' };
};

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

function validContractPayload(overrides = {}) {
  return Object.assign({
    requestId: 'solicitud-contrato-ficticia-nueva',
    elaborationDate: '2026-07-13',
    eventDate: '2026-08-03',
    startTime: '18:00',
    endTime: '23:00',
    eventType: 'Evento ficticio',
    clientName: 'Cliente Ficticio',
    address: 'Domicilio ficticio 123',
    phone: '0000000000',
    total: 3500,
    initialDeposit: 1000,
    paymentMethod: 'Efectivo ficticio',
    overrideReason: ''
  }, overrides);
}

function seedInitialPaymentRepair(overrides = {}) {
  const contract = seedContract({
    requestId: 'solicitud-contrato-ficticia-reparacion',
    status: 'ERROR',
    initialDeposit: 1000,
    paid: 1000,
    balance: 2500,
    total: 3500,
    createdBy: 'propietaria.ficticia@example.com',
    createdAt: '2026-07-13T09:00:00'
  });
  state.sheets.Clientes.push({
    id: contract.clientId,
    name: contract.clientName,
    address: contract.address,
    phone: contract.phone
  });
  const payment = Object.assign({
    id: 'pago-inicial-ficticio-001',
    requestId: `${contract.requestId}:initial`,
    status: 'GENERANDO',
    contractId: contract.id,
    contractNumber: contract.contractNumber,
    date: contract.elaborationDate,
    amount: contract.initialDeposit,
    method: 'Efectivo ficticio',
    note: 'Apartado inicial',
    receiptFileId: '',
    createdBy: contract.createdBy,
    createdAt: contract.createdAt,
    newPaid: contract.paid,
    newBalance: contract.balance,
    errorMessage: ''
  }, overrides);
  state.sheets.Pagos.push(payment);
  return { contract, payment };
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

test('addPayment conserva el éxito financiero si la auditoría falla', () => {
  seedContract();
  state.throwOnAudit = true;

  const result = clone(context.addPayment({
    requestId: 'solicitud-pago-ficticia-auditoria',
    contractId: 'contrato-ficticio-001',
    date: '2026-07-13',
    amount: 500
  }));

  assert.strictEqual(result.payment.status, 'COMPLETADO');
  assert.strictEqual(result.contract.paid, 1500.1);
  assert.strictEqual(result.contract.balance, 1999.9);
  assert.strictEqual(state.sheets.Pagos.length, 1);
  assert.strictEqual(state.lockReleases, 1);
});

test('createContract deja el abono inicial en ERROR si falla el PDF contractual', () => {
  state.throwOnContractPdf = true;

  assert.throws(() => context.createContract(validContractPayload()), /Fallo ficticio al generar contrato PDF/);

  assert.strictEqual(state.sheets.Contratos.length, 1);
  assert.strictEqual(state.sheets.Contratos[0].status, 'ERROR');
  assert.strictEqual(state.sheets.Pagos.length, 1);
  assert.strictEqual(state.sheets.Pagos[0].status, 'ERROR');
  assert.match(state.sheets.Pagos[0].errorMessage, /Fallo ficticio al generar contrato PDF/);
  assert.strictEqual(state.receiptCalls.length, 0);
  assert.strictEqual(state.lockReleases, 1);
});

test('updateContract repara una sola vez el recibo inicial pendiente de un contrato ERROR', () => {
  seedInitialPaymentRepair();

  const first = clone(context.updateContract({
    id: 'contrato-ficticio-001',
    expectedVersion: 3
  }));
  const second = clone(context.updateContract({
    id: 'contrato-ficticio-001',
    expectedVersion: first.version
  }));

  assert.strictEqual(first.status, 'CONFIRMADO');
  assert.strictEqual(second.status, 'CONFIRMADO');
  assert.strictEqual(first.paid, 1000);
  assert.strictEqual(second.balance, 2500);
  assert.strictEqual(state.sheets.Pagos.length, 1);
  assert.strictEqual(state.sheets.Pagos[0].status, 'COMPLETADO');
  assert.strictEqual(state.receiptCalls.length, 1);
  assert.strictEqual(state.lockReleases, 2);
});

test('la reparación reutiliza un recibo inicial existente', () => {
  seedInitialPaymentRepair({ receiptFileId:'recibo-inicial-ficticio-existente' });

  const saved = clone(context.updateContract({
    id: 'contrato-ficticio-001',
    expectedVersion: 3
  }));

  assert.strictEqual(saved.status, 'CONFIRMADO');
  assert.strictEqual(state.receiptCalls.length, 0);
  assert.strictEqual(state.sheets.Pagos[0].status, 'COMPLETADO');
  assert.strictEqual(state.sheets.Pagos[0].receiptFileId, 'recibo-inicial-ficticio-existente');
});

test('la reparación conserva el saldo histórico del abono inicial', () => {
  seedInitialPaymentRepair({ status:'ERROR' });
  state.sheets.Contratos[0].paid = 1500;
  state.sheets.Contratos[0].balance = 2000;

  context.updateContract({
    id: 'contrato-ficticio-001',
    expectedVersion: 3
  });

  assert.strictEqual(state.receiptCalls.length, 1);
  assert.strictEqual(state.receiptCalls[0].payment.newPaid, 1000);
  assert.strictEqual(state.receiptCalls[0].payment.newBalance, 2500);
  assert.strictEqual(state.sheets.Pagos[0].newPaid, 1000);
  assert.strictEqual(state.sheets.Pagos[0].newBalance, 2500);
});

test('un fallo al reparar el recibo no revierte el contrato reparado', () => {
  seedInitialPaymentRepair();
  state.throwOnReceipt = true;

  const saved = clone(context.updateContract({
    id: 'contrato-ficticio-001',
    expectedVersion: 3
  }));

  assert.strictEqual(saved.status, 'CONFIRMADO');
  assert.strictEqual(state.sheets.Contratos[0].status, 'CONFIRMADO');
  assert.strictEqual(state.sheets.Pagos[0].status, 'ERROR');
  assert.match(state.sheets.Pagos[0].errorMessage, /Fallo ficticio al generar recibo/);
  assert.strictEqual(state.lockReleases, 1);

  state.throwOnReceipt = false;
  const retried = clone(context.updateContract({
    id: 'contrato-ficticio-001',
    expectedVersion: saved.version
  }));
  assert.strictEqual(retried.status, 'CONFIRMADO');
  assert.strictEqual(state.sheets.Pagos[0].status, 'COMPLETADO');
  assert.strictEqual(state.receiptCalls.length, 2);
  assert.strictEqual(state.lockReleases, 2);
});

test('una identificación nueva no reemplaza la referencia histórica del cliente', () => {
  state.sheets.Clientes.push({
    id: 'cliente-ficticio-001',
    name: 'Cliente Ficticio',
    address: 'Domicilio ficticio anterior',
    phone: '0000000000',
    ineFileId: 'ine-ficticia-historica',
    createdAt: '2026-07-01T09:00:00',
    updatedAt: '2026-07-01T09:00:00'
  });
  const originalStoreIne = context.storeIne_;
  context.storeIne_ = () => 'ine-ficticia-nueva-del-contrato';
  try {
    const saved = clone(productionUpsertClientForContract({
      clientName: 'Cliente Ficticio',
      address: 'Domicilio ficticio actualizado',
      phone: '0000000000',
      ineDataUrl: 'data:image/png;base64,RklDVElDSUE='
    }, 'C.9002', '2026-07-13T12:00:00'));

    assert.strictEqual(saved.contractIneFileId, 'ine-ficticia-nueva-del-contrato');
    assert.strictEqual(state.sheets.Clientes.length, 1);
    assert.strictEqual(state.sheets.Clientes[0].ineFileId, 'ine-ficticia-historica');
    assert.strictEqual(state.sheets.Clientes[0].address, 'Domicilio ficticio actualizado');
  } finally {
    context.storeIne_ = originalStoreIne;
  }
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
  assert.strictEqual(state.folderCreations, 0);
  assert.strictEqual(state.clientUpserts, 0);
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
