const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const state = {
  files: [
    {
      id:'archivo:C.2617',
      contractNumber:'C.2617',
      contractFileId:'archivo-anterior-2617',
      contractFileName:'C.2617 contrato original.pdf',
      updatedAt:'2026-07-01T12:00:00'
    }
  ],
  history: [
    { contractNumber:'C.2615' },
    { contractNumber:'C.2616' },
    { contractNumber:'C.2617' },
    { contractNumber:'C.2618' }
  ],
  contracts: [{ contractNumber:'C.9999' }],
  agenda: [{ contractNumber:'C.8888' }],
  searches: [],
  writes: [],
  audits: [],
  ownerChecks: 0,
  lockReleases: 0
};

function file(id, name, mimeType = 'application/pdf') {
  return {
    getId: () => id,
    getName: () => name,
    getMimeType: () => mimeType
  };
}

const driveResults = {
  2615: [
    file('ine-2615', 'C.2615 INE.png', 'image/png'),
    file('pago-2615', 'C.2615 pago.pdf'),
    file('comprobante-2615', 'C.2615 comprobante.pdf')
  ],
  2616: [
    file('contrato-a-2616', 'C.2616 contrato firmado.pdf'),
    file('contrato-b-2616', 'Contrato C.2616 original.pdf')
  ],
  2617: [],
  2618: [file('contrato-2618', 'C.2618 contrato original.pdf')]
};

function iterator(items) {
  let index = 0;
  return {
    hasNext: () => index < items.length,
    next: () => items[index++]
  };
}

const context = vm.createContext({
  console,
  DriveApp: {
    searchFiles: query => {
      state.searches.push(query);
      const digits = Number((query.match(/contains '(\d+)'/) || [])[1]);
      return iterator(driveResults[digits] || []);
    }
  },
  LockService: {
    getScriptLock: () => ({
      waitLock: milliseconds => assert.strictEqual(milliseconds, 30000),
      releaseLock: () => { state.lockReleases += 1; }
    })
  },
  requireOwner_: () => {
    state.ownerChecks += 1;
    return { email:'propietaria.ficticia@example.com' };
  },
  ensureSchema_: () => {},
  listObjects_: sheetName => ({
    Archivos:state.files,
    Historial:state.history,
    Contratos:state.contracts,
    Agenda:state.agenda
  }[sheetName] || []).map(item => ({ ...item })),
  replaceObjects_: (sheetName, records) => {
    assert.strictEqual(sheetName, 'Archivos');
    state.files = records.map(item => ({ ...item }));
    state.writes.push(state.files);
    return records;
  },
  nowIso_: () => '2026-07-13T12:00:00',
  audit_: (action, type, id, details) => state.audits.push({ action, type, id, details })
});

vm.runInContext(fs.readFileSync('src/FileIndexService.gs', 'utf8'), context);

assert.strictEqual(context.isExcludedContractFileName_('C.2615 INE.png'), true);
assert.strictEqual(context.isExcludedContractFileName_('C.2615 pago.pdf'), true);
assert.strictEqual(context.isExcludedContractFileName_('C.2615 comprobante.pdf'), true);
assert.strictEqual(context.scoreContractFile_(file('ine', 'C.2615 INE.png', 'image/png'), 'C.2615'), -1);
assert.strictEqual(context.scoreContractFile_(file('pago', 'C.2615 pago.pdf'), 'C.2615'), -1);
assert.strictEqual(context.scoreContractFile_(file('comprobante', 'C.2615 comprobante.pdf'), 'C.2615'), -1);

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.indexedContractNumbers_())),
  ['C.2615', 'C.2616', 'C.2617', 'C.2618'],
  'solo Historial aporta números al buscador de archivos'
);

const ambiguous = context.findExistingContractFile_('C.2616');
assert.strictEqual(ambiguous.ambiguous, true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(ambiguous, 'id'), false, 'una ambigüedad nunca adivina un archivo');

const summary = context.syncExistingContractFiles();
assert.strictEqual(state.ownerChecks, 1, 'la sincronización exige al propietario');
assert.strictEqual(summary.linked, 1);
assert.strictEqual(summary.ambiguous, 1);
assert.strictEqual(summary.missing, 3);
assert.strictEqual(summary.errors, 0);
assert.strictEqual(state.searches.some(query => query.includes("'9999'")), false, 'no busca contratos gestionados');
assert.strictEqual(state.searches.some(query => query.includes("'8888'")), false, 'no busca eventos de Calendar');
assert.strictEqual(state.files.some(item => item.contractNumber === 'C.2616'), false, 'no guarda una coincidencia ambigua');
assert.strictEqual(
  state.files.find(item => item.contractNumber === 'C.2617').contractFileId,
  'archivo-anterior-2617',
  'un fallo temporal de búsqueda conserva el enlace comprobado'
);
assert.strictEqual(
  state.files.find(item => item.contractNumber === 'C.2618').contractFileId,
  'contrato-2618',
  'una coincidencia inequívoca queda vinculada'
);
assert.strictEqual(state.lockReleases, 1);

console.log('Índice de archivos verificado: privacidad, historial, ambigüedad y enlaces existentes.');
