const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const state = {
  contracts: [],
  payments: [],
  clients: [],
  history: [],
  audits: [],
  nextNumber: 2626,
  uuid: 0,
  lockWaits: [],
  lockReleases: 0
};

function rows(sheetName) {
  return ({ Contratos:state.contracts, Pagos:state.payments, Clientes:state.clients, Historial:state.history })[sheetName] || [];
}

const context = vm.createContext({
  console,
  APP_CONFIG: { START_CONTRACT_NUMBER:2626 },
  Utilities: { getUuid: () => `uuid-ficticio-${++state.uuid}` },
  LockService: {
    getScriptLock: () => ({
      waitLock: milliseconds => state.lockWaits.push(milliseconds),
      releaseLock: () => { state.lockReleases += 1; }
    })
  },
  requireOwner_: () => ({ email:'propietaria.ficticia@example.com', role:'PROPIETARIO' }),
  ensureSchema_: () => {},
  roundMoney_: value => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) throw new Error('Importe ficticio inválido');
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  },
  validateContractPayload_: data => {
    ['elaborationDate', 'eventDate', 'startTime', 'endTime', 'eventType', 'clientName', 'address', 'phone']
      .forEach(field => { if (!String(data[field] || '').trim()) throw new Error(`Falta el campo ${field}.`); });
    return { total:Number(data.total), initialDeposit:Number(data.initialDeposit) };
  },
  listObjects_: sheetName => rows(sheetName).map(item => ({ ...item })),
  findObject_: (sheetName, column, value) => rows(sheetName).find(item => String(item[column]) === String(value)) || null,
  appendObject_: (sheetName, object) => {
    rows(sheetName).push({ ...object });
    return object;
  },
  updateObject_: (sheetName, column, value, updates) => {
    const item = rows(sheetName).find(candidate => String(candidate[column]) === String(value));
    if (!item) throw new Error(`No se encontró ${value}`);
    Object.assign(item, updates);
    return { ...item };
  },
  createContractFolder_: contractNumber => ({ getId:() => `carpeta-${contractNumber}` }),
  upsertClientForContract_: data => {
    const client = { id:`cliente-${state.clients.length + 1}`, name:data.clientName, phone:data.phone };
    state.clients.push(client);
    return client;
  },
  eventDayName_: () => 'Sábado',
  generateContractPdf_: contract => ({ pdfFileId:`pdf-${contract.contractNumber}` }),
  generateReceiptPdf_: contract => ({ pdfFileId:`recibo-${contract.contractNumber}` }),
  createCalendarEvent_: contract => `evento-${contract.contractNumber}`,
  nowIso_: () => '2026-07-13T12:00:00',
  audit_: (action, entityType, entityId, details) => state.audits.push({ action, entityType, entityId, details }),
  getSetting_: () => state.nextNumber,
  setSetting_: (key, value) => {
    assert.strictEqual(key, 'NEXT_CONTRACT_NUMBER');
    state.nextNumber = value;
  }
});

vm.runInContext(fs.readFileSync('src/HistoricalImportService.gs', 'utf8'), context);

const valid = {
  contractNumber:'C.9001',
  elaborationDate:'2026-07-01',
  eventDate:'2026-08-01',
  startTime:'18:00',
  endTime:'23:00',
  eventType:'Evento histórico ficticio',
  clientName:'Cliente Histórico Ficticio',
  address:'Calle Histórica Ficticia 1',
  phone:'0000009001',
  total:4500,
  paid:2250,
  balance:2250,
  paymentMethod:'Efectivo'
};

let passed = 0;
function test(name, callback) {
  try {
    callback();
    passed += 1;
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

test('rechaza saldos históricos que no cuadran', () => {
  assert.throws(() => context.normalizeHistoricalContract_({ ...valid, balance:2000 }), /no coinciden/);
});

test('importa contrato, pago, PDF, recibo y evento sin cambiar su número', () => {
  const summary = context.importHistoricalContracts({ records:[valid] });
  assert.deepStrictEqual(JSON.parse(JSON.stringify({ imported:summary.imported, skipped:summary.skipped, errors:summary.errors })), {
    imported:1, skipped:0, errors:0
  });
  assert.strictEqual(state.contracts[0].contractNumber, 'C.9001');
  assert.strictEqual(state.contracts[0].status, 'CONFIRMADO');
  assert.strictEqual(state.contracts[0].currentPdfFileId, 'pdf-C.9001');
  assert.strictEqual(state.contracts[0].calendarEventId, 'evento-C.9001');
  assert.strictEqual(state.payments[0].status, 'COMPLETADO');
  assert.strictEqual(state.payments[0].receiptFileId, 'recibo-C.9001');
  assert.strictEqual(state.nextNumber, 9002);
});

test('repetir la importación omite el contrato existente', () => {
  const summary = context.importHistoricalContracts({ records:[valid] });
  assert.strictEqual(summary.imported, 0);
  assert.strictEqual(summary.skipped, 1);
  assert.strictEqual(state.contracts.length, 1);
  assert.strictEqual(state.payments.length, 1);
});

test('detecta números duplicados dentro del mismo archivo', () => {
  const second = { ...valid, contractNumber:'C.9002', phone:'0000009002', eventDate:'2026-08-08' };
  const summary = context.importHistoricalContracts({ records:[second, { ...second }] });
  assert.strictEqual(summary.imported, 1);
  assert.strictEqual(summary.errors, 1);
  assert.match(summary.results[1].message, /repetido/);
});

test('limita el tamaño del lote y siempre libera el bloqueo adquirido', () => {
  assert.throws(() => context.importHistoricalContracts({ records:[] }), /Selecciona/);
  assert.throws(() => context.importHistoricalContracts({ records:Array.from({ length:101 }, () => valid) }), /100 contratos/);
  assert.strictEqual(state.lockWaits.every(value => value === 30000), true);
  assert.strictEqual(state.lockWaits.length, state.lockReleases);
});

test('indexa contratos ya existentes sin duplicar PDF, pago, carpeta ni Calendar', () => {
  const before = { contracts:state.contracts.length, payments:state.payments.length, clients:state.clients.length };
  const first = context.indexHistoricalContracts({ records:[{ ...valid, contractNumber:'C.9010' }] });
  assert.deepStrictEqual(JSON.parse(JSON.stringify({ indexed:first.indexed, updated:first.updated, errors:first.errors })), {
    indexed:1, updated:0, errors:0
  });
  assert.strictEqual(state.history.length, 1);
  assert.strictEqual(state.history[0].clientName, valid.clientName);
  assert.deepStrictEqual({ contracts:state.contracts.length, payments:state.payments.length, clients:state.clients.length }, before);

  const second = context.indexHistoricalContracts({ records:[{ ...valid, contractNumber:'C.9010', paid:4500, balance:0 }] });
  assert.strictEqual(second.indexed, 0);
  assert.strictEqual(second.updated, 1);
  assert.strictEqual(state.history.length, 1);
  assert.strictEqual(state.history[0].status, 'PAGADO');
  assert.strictEqual(context.listHistoricalContracts_().length, 1);
});

console.log(`${passed} casos de importación histórica verificados correctamente.`);
