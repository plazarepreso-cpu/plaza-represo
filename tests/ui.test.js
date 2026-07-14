const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync('src/index.html', 'utf8');
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
assert.strictEqual(inlineScripts.length, 1, 'el panel mantiene un único script interno');
new vm.Script(inlineScripts[0], { filename: 'src/index.html:inline' });

[
  'view-dashboard', 'view-new-contract', 'view-agenda', 'view-contracts',
  'view-payments', 'view-clients', 'view-automations'
].forEach(id => assert.match(html, new RegExp(`id=["']${id}["']`), `existe ${id}`));
assert.match(html, /tesseract\.js@5\.1\.1\//, 'Tesseract usa una versión exacta');
assert.doesNotMatch(html, /tesseract\.js@5\//, 'Tesseract no usa una versión flotante');
assert.match(html, /id="reviewConfirmed"[^>]*required/, 'la revisión humana es obligatoria');
assert.match(html, /id="cancelReason"/, 'la cancelación solicita un motivo dentro del panel');
assert.doesNotMatch(html, /window\.prompt\(/, 'el panel no depende de diálogos nativos para cancelar');
assert.match(html, /SIMULADA · NO PERSISTIDA/, 'el demo no afirma que resguarda la imagen');
assert.match(html, /delete contract\.ineDataUrl/, 'la imagen no entra al almacenamiento del demo');
assert.match(html, /payment\.status \|\| 'COMPLETADO'/, 'el historial distingue pagos incompletos o fallidos');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `existe la función ${name}`);
  const nextFunction = source.indexOf('\n    function ', start + 1);
  assert.notStrictEqual(nextFunction, -1, `se encontró el límite de ${name}`);
  return source.slice(start, nextFunction).trim();
}

const script = inlineScripts[0];
const functionNames = [
  'isValidIsoDate', 'isValidTime', 'dayName', 'dateRate', 'eventDurationMinutes',
  'validateMockContract', 'normalizeOcrLabel', 'extractLabeledLines', 'extractIneFields',
  'pendingRequestFingerprint', 'readPendingRequests', 'writePendingRequests',
  'getOrCreatePendingRequestId', 'clearPendingRequestId'
];
const sessionValues = new Map();
let generatedRequestIds = 0;
const context = vm.createContext({
  console,
  roundMoney: value => Math.round((Number(value) + Number.EPSILON) * 100) / 100,
  PENDING_REQUESTS_KEY: 'solicitudes-pendientes-ficticias',
  state: { pendingRequests: {} },
  uuid: () => `solicitud-ficticia-${++generatedRequestIds}`,
  window: {
    sessionStorage: {
      getItem: key => sessionValues.get(key) || null,
      setItem: (key, value) => sessionValues.set(key, value)
    }
  }
});
vm.runInContext(functionNames.map(name => extractFunction(script, name)).join('\n'), context);

const ocrText = [
  'IDENTIFICACIÓN FICTICIA - SIN VALIDEZ',
  'NOMBRE',
  'MARINA EJEMPLO PRUEBA',
  'DOMICILIO',
  'CALLE DEMOSTRACIÓN 123 COLONIA MODELO',
  'CLAVE DE ELECTOR FICTICIA'
].join('\n');
const ocr = context.extractIneFields(ocrText);
assert.strictEqual(ocr.name, 'MARINA EJEMPLO PRUEBA');
assert.strictEqual(ocr.address, 'CALLE DEMOSTRACIÓN 123 COLONIA MODELO');

const retryPayload = { contractId:'contrato-ficticio-001', date:'2026-07-13', amount:250, method:'Efectivo', note:'Prueba ficticia' };
const retryFingerprint = context.pendingRequestFingerprint(retryPayload, ['contractId', 'date', 'amount', 'method', 'note']);
const firstRequestId = context.getOrCreatePendingRequestId('payment', retryFingerprint);
context.state.pendingRequests = {};
const requestIdAfterReload = context.getOrCreatePendingRequestId('payment', retryFingerprint);
assert.strictEqual(requestIdAfterReload, firstRequestId, 'una recarga conserva el requestId del mismo pago');
assert.doesNotMatch(sessionValues.get('solicitudes-pendientes-ficticias'), /Prueba ficticia|contrato-ficticio/, 'el navegador solo persiste el hash, no el payload');
context.clearPendingRequestId('payment');
assert.notStrictEqual(context.getOrCreatePendingRequestId('payment', retryFingerprint), firstRequestId, 'un éxito permite crear una solicitud posterior');

const database = {
  config: { weekdayRate: 3500, weekendRate: 4500, eventHours: 5 },
  contracts: []
};
const valid = {
  elaborationDate: '2026-07-13', eventDate: '2026-08-03', startTime: '18:00', endTime: '23:00',
  eventType: 'Evento ficticio', clientName: 'Cliente Ficticio', address: 'Calle Demostración 1',
  phone: '000 000 0000', total: 3500, initialDeposit: 1750, overrideReason: ''
};
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.validateMockContract(valid, database))), {
  total: 3500,
  initialDeposit: 1750
});
assert.throws(() => context.validateMockContract({ ...valid, eventDate:'2026-02-30' }, database), /fecha del evento/i);
assert.throws(() => context.validateMockContract({ ...valid, startTime:'25:00', endTime:'30:00' }, database), /horario/i);
assert.throws(() => context.validateMockContract({ ...valid, total:0 }, database), /mayor que cero/i);
assert.throws(() => context.validateMockContract({ ...valid, total:3000 }, database), /Explica por qué/i);
assert.throws(() => context.validateMockContract({ ...valid, initialDeposit:4000 }, database), /abono inicial/i);

console.log('Panel verificado: estructura, demo, OCR y validaciones ficticias.');
