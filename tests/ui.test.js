const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync('src/index.html', 'utf8');
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
assert.strictEqual(inlineScripts.length, 1, 'el panel mantiene un único script interno');
new vm.Script(inlineScripts[0], { filename: 'src/index.html:inline' });

[
  'view-dashboard', 'view-new-contract', 'view-agenda', 'view-contracts',
  'view-payments', 'view-clients', 'view-access', 'view-automations'
].forEach(id => assert.match(html, new RegExp(`id=["']${id}["']`), `existe ${id}`));
assert.match(html, /tesseract\.js@5\.1\.1\//, 'Tesseract usa una versión exacta');
assert.doesNotMatch(html, /tesseract\.js@5\//, 'Tesseract no usa una versión flotante');
assert.match(html, /id="reviewConfirmed"[^>]*required/, 'la revisión humana es obligatoria');
assert.match(html, /cliente autorizó el resguardo privado/, 'la producción exige autorización para resguardar la INE');
assert.match(html, /nunca se muestra al empleado/, 'el panel explica la separación de la INE privada');
assert.match(html, /await runIneOcr\(\)/, 'la selección de la INE inicia automáticamente el OCR');
assert.match(html, /id="syncAgendaButton"/, 'la agenda puede sincronizar los eventos existentes sin importarlos');
assert.match(html, /normalized\.agenda = \(Array\.isArray/, 'el panel recibe la agenda compartida de Calendar');
assert.match(html, /normalized\.history = \(Array\.isArray/, 'el panel recibe el índice privado de contratos anteriores');
assert.match(html, /function contractItems\(/, 'la tabla de contratos combina contratos nuevos, historial y Calendar');
assert.match(html, /function clientItems\(/, 'la tabla de clientes combina clientes nuevos e históricos');
assert.match(html, /normalizeTimeValue/, 'el panel elimina las fechas técnicas de las horas de Sheets');
assert.match(html, /id="cancelReason"/, 'la cancelación solicita un motivo dentro del panel');
assert.doesNotMatch(html, /window\.prompt\(/, 'el panel no depende de diálogos nativos para cancelar');
assert.match(html, /SIMULADA · NO PERSISTIDA/, 'el demo no afirma que resguarda la imagen');
assert.match(html, /delete contract\.ineDataUrl/, 'la imagen no entra al almacenamiento del demo');
assert.match(html, /payment\.status \|\| 'COMPLETADO'/, 'el historial distingue pagos incompletos o fallidos');
assert.match(html, /id="accessEmail"[^>]*type="email"[^>]*required/, 'el propietario puede agregar correos desde el panel');
assert.match(html, /data-access-action/, 'el propietario puede retirar o restaurar accesos');
assert.match(html, /id="historicalImportFile"[^>]*accept="application\/json,.json"/, 'el propietario puede seleccionar el historial privado');
assert.match(html, /callServer\('importHistoricalContracts'/, 'el panel envía únicamente contratos aprobados al importador');
assert.match(html, /id="indexHistoricalButton"/, 'el propietario puede indexar contratos existentes sin duplicarlos');
assert.match(html, /callServer\('indexHistoricalContracts'/, 'el índice histórico usa la operación segura sin crear archivos ni eventos');
assert.match(html, /solo guarda el índice y no crea copias/, 'el panel explica cómo evitar duplicar el historial existente');
assert.match(html, /const detailLabel = managed \? 'Editar contrato' : 'Ver datos'/, 'los contratos administrados muestran una acción clara para editar');
assert.match(html, /client\.hasIne && state\.data\.user\.role === 'PROPIETARIO'/, 'el propietario puede abrir la INE desde clientes');
assert.match(html, /Abrir INE privada/, 'el propietario puede abrir la INE desde el detalle del contrato');
assert.match(html, /callServer\('getPrivateIneUrl', payload\)/, 'la INE se solicita al endpoint privado al abrirla');
assert.match(html, /id="syncFilesButton"/, 'el panel incluye la vinculación de contratos de Drive');
assert.match(html, /Buscar número, cliente o teléfono/, 'el buscador de contratos anuncia que también acepta teléfono');
assert.match(html, /function digitsOnly\(value\)/, 'el panel normaliza teléfonos con espacios o guiones');
assert.match(html, /function matchesSearch\(query, values, phone\)/, 'el filtro reutiliza una búsqueda segura por nombre, número y teléfono');
assert.match(html, /matchesSearch\(query, \[contract\.contractNumber, contract\.clientName\], contract\.phone\)/, 'la tabla de contratos consulta el teléfono');
assert.match(html, /callServer\('syncExistingContractFiles'\)/, 'el botón de archivos llama a la sincronización segura');
assert.match(html, /id="historicalIneFiles"[^>]*accept="application\/zip,\.zip/, 'el propietario puede seleccionar un ZIP de INE históricas');
assert.match(html, /window\.JSZip\.loadAsync\(file\)/, 'el ZIP se procesa localmente antes de importar');
assert.match(html, /callServer\('importHistoricalIne'/, 'cada INE aprobada se envía al resguardo privado');
assert.match(html, /id="syncHistoricalIneButton"/, 'las INE que ya existen en Drive pueden protegerse sin volver a subirlas');
assert.match(html, /id="agendaUpcomingGrid"/, 'la agenda separa los próximos eventos');
assert.match(html, /id="agendaHistoryGrid"/, 'la agenda conserva un histórico separado');
assert.match(html, /id="viewerAgendaGrid"/, 'el empleado visualiza sus próximos eventos dentro del panel');
assert.match(html, /function renderViewerAgendaCard/, 'la agenda de empleado usa tarjetas operativas propias');
assert.match(html, /function openViewerEvent/, 'el empleado puede abrir detalles del evento sin abrir el contrato');
assert.match(html, /id="viewerEventDialog"/, 'los detalles del empleado se muestran en un diálogo separado');
assert.match(html, /SALDO PENDIENTE/, 'el empleado puede saber el saldo pendiente sin ver el módulo de pagos');
assert.match(html, /LIQUIDADO[\s\S]*Todo pagado/, 'el empleado identifica los eventos ya pagados');
assert.doesNotMatch(html, /id="agendaOnlyLink"/, 'el empleado ya no recibe un enlace externo a Google Calendar');
assert.match(html, /return historical \? 'HISTORICO' : 'PROXIMO'/, 'la agenda etiqueta por fecha y no por la antigüedad del archivo');
assert.match(html, /data-agenda-contract-id/, 'cada evento con contrato puede abrir sus detalles desde la agenda');
assert.match(html, /function openExternal\(/, 'los archivos se abren desde un gesto de clic');
assert.match(html, /window\.open\(safeUrl, '_blank'/, 'los archivos de Drive se abren en otra pestaña');
assert.match(html, /fallback\.target = '_blank'/, 'el respaldo también conserva el panel abierto');
assert.doesNotMatch(html, /fallback\.target = '_top'/, 'ningún respaldo reemplaza el panel actual');
assert.match(html, /callServer\(payload\.paymentSource === 'ARCHIVO_ANTERIOR' \? 'addHistoricalPayment' : 'addPayment', payload\)/, 'los contratos históricos aceptan pagos desde el panel');
assert.match(html, /data-register-payment-id/, 'cada contrato con saldo puede iniciar el registro de pago desde su propia fila');
assert.match(html, /data-partial-payment-id/, 'cada contrato con saldo permite preparar un abono parcial');
assert.match(html, /data-regenerate-contract-id/, 'cada contrato administrado permite regenerar su PDF vigente');
assert.match(html, /callServer\('regenerateContractPdf'/, 'el panel regenera el PDF sin crear otro contrato');
assert.match(html, /Guarda primero los cambios del contrato antes de regenerar el PDF/, 'el panel evita regenerar con datos sin guardar');
assert.match(html, /function preparePartialPayment\(/, 'el panel prepara abonos sin precargar la liquidación');
assert.match(html, /Registrar abono \/ mover saldo/, 'la sección de pagos explica el movimiento parcial del saldo');
assert.match(html, /id="fillPaymentBalance"/, 'el formulario permite llenar el saldo completo solo cuando se elige esa opción');
assert.match(html, /Saldo tras este pago:/, 'cada movimiento muestra el saldo que dejó en el contrato');
assert.match(html, /function paymentItems\(/, 'los movimientos recientes se normalizan antes de mostrarse');
assert.match(html, /const completed = new Map\(\)/, 'los duplicados técnicos de un mismo pago se muestran una sola vez');
assert.doesNotMatch(html, /roundMoney\(payment\.newBalance\).*String\(payment\.note/s, 'el detector no confunde un saldo posterior distinto con un pago distinto');
assert.match(html, /data-void-payment-id/, 'un duplicado detectado puede corregirse sin editar el saldo a mano');
assert.match(html, /callServer\('voidPayment'/, 'la corrección de duplicados usa una operación auditada');
assert.match(html, /Corregir \/ anular movimiento/, 'el propietario puede corregir un movimiento específico cuando identifica el error');
assert.match(html, /function prepareLiquidationPayment\(/, 'el panel prepara la liquidación desde un contrato existente');
assert.match(html, /Liquidación del contrato/, 'la liquidación se identifica correctamente en el recibo y el historial');
assert.match(html, /data-payment-balance/, 'el pago no puede rebasar el saldo pendiente del contrato seleccionado');
assert.match(html, /LIQUIDADO/, 'un contrato pagado se presenta como liquidado para el equipo');

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
  'normalizeDateValue', 'normalizeTimeValue', 'normalizeEventRecord',
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
assert.strictEqual(context.normalizeDateValue('2026-02-21T00:00:00'), '2026-02-21');
assert.strictEqual(context.normalizeTimeValue('1899-12-30T20:00:00'), '20:00');
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.normalizeEventRecord({
  eventDate:'2026-08-01T00:00:00', startTime:'1899-12-30T18:00:00', endTime:'1899-12-30T23:00:00'
}))), { eventDate:'2026-08-01', startTime:'18:00', endTime:'23:00', elaborationDate:'' });

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
