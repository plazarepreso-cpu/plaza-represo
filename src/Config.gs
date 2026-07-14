const APP_CONFIG = Object.freeze({
  APP_NAME: 'Plaza Represo',
  TIME_ZONE: 'America/Hermosillo',
  START_CONTRACT_NUMBER: 2626,
  WEEKDAY_RATE: 3500,
  WEEKEND_RATE: 4500,
  EVENT_HOURS: 5,
  VENUE_ADDRESS: 'Ave. Tecnológico y Calle Cahitas No. 250, Col. Luis Donaldo Colosio, Nogales, Sonora.',
  MAX_CAPACITY: 100,
  ROLE_OWNER: 'PROPIETARIO',
  ROLE_VIEWER: 'CONSULTA'
});

const SHEET_HEADERS = Object.freeze({
  Contratos: [
    'id', 'requestId', 'contractNumber', 'version', 'status', 'createdAt', 'updatedAt',
    'elaborationDate', 'eventDate', 'eventDay', 'startTime', 'endTime', 'eventType',
    'clientId', 'ineFileId', 'clientName', 'address', 'phone', 'total', 'initialDeposit', 'paid',
    'balance', 'overrideReason', 'folderId', 'currentPdfFileId', 'calendarEventId',
    'createdBy', 'updatedBy', 'cancelReason'
  ],
  Clientes: ['id', 'name', 'address', 'phone', 'ineFileId', 'createdAt', 'updatedAt'],
  Pagos: [
    'id', 'requestId', 'status', 'contractId', 'contractNumber', 'date', 'amount', 'method', 'note',
    'receiptFileId', 'createdBy', 'createdAt', 'newPaid', 'newBalance', 'errorMessage'
  ],
  Auditoria: ['timestamp', 'user', 'action', 'entityType', 'entityId', 'detailsJson'],
  Usuarios: ['email', 'role', 'active'],
  Configuracion: ['key', 'value']
});

const CONTRACT_CLAUSES = Object.freeze([
  'El salón cuenta con capacidad máxima para 100 personas, ubicado en Ave. Tecnológico y calle Cahitas núm. 250 de la colonia Luis D. Colosio.',
  'El evento tendrá una duración de 5 horas de evento y 4 horas antes para su decoración. Al finalizar el evento, el arrendatario contará con 20 minutos máximo para desocupar el salón; de lo contrario se cobrará como hora extra.',
  'El arrendatario asume plena responsabilidad de las instalaciones, incluida la responsabilidad de cualquier daño a la construcción, accesorio y mobiliario durante el evento.',
  'Si se excede la capacidad permitida, el evento se cancelará de inmediato.',
  'El anticipo que corresponde al 50% total del servicio NO es reembolsable en caso de que el arrendatario cancele este contrato; tampoco podrá ser canjeable por alguna otra fecha sin excepción.',
  'El arrendatario tendrá que liquidar en su totalidad el monto total de este contrato siete días antes del evento; de lo contrario se dará por cancelado este contrato.',
  'El salón se entregará cuatro horas antes del evento para su preparación o decoración, de acuerdo con las características y especificaciones para lo que ha sido destinado, y se entregará limpio para el día del evento.',
  'Queda prohibido pegar silicón o cualquier tipo de pegamento a la madera o mobiliario, así como hacer decoraciones que dañen nuestras instalaciones.',
  'El pago del servicio de limpieza ya está incluido en este contrato, por lo que no es necesario realizar un pago extra.'
]);

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Plaza Represo')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Crea todos los recursos Google. Debe ejecutarse una sola vez desde la cuenta del propietario.
 */
function setupSystem_(ownerEmail, employeeEmail) {
  const owner = String(ownerEmail || '').trim().toLowerCase();
  const employee = String(employeeEmail || '').trim().toLowerCase();
  if (!owner || !owner.includes('@')) throw new Error('Se requiere el correo válido del propietario.');
  if (employee && !employee.includes('@')) throw new Error('El correo del empleado no es válido.');

  const executor = String(
    Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || ''
  ).trim().toLowerCase();
  if (!executor || executor !== owner) {
    throw new Error('La instalación debe ejecutarse desde la misma cuenta indicada como propietario.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('SPREADSHEET_ID')) {
      throw new Error('El sistema ya fue configurado. Usa getSystemInfo() para consultar los recursos.');
    }

    const spreadsheet = SpreadsheetApp.create('Plaza Represo - Base de datos');
    const sheetNames = Object.keys(SHEET_HEADERS);
    const first = spreadsheet.getSheets()[0];
    first.setName(sheetNames[0]);
    initializeSheet_(first, SHEET_HEADERS[sheetNames[0]]);
    sheetNames.slice(1).forEach(name => initializeSheet_(spreadsheet.insertSheet(name), SHEET_HEADERS[name]));

    const contractsFolder = DriveApp.createFolder('Plaza Represo - Contratos');
    const privateIneFolder = DriveApp.createFolder('Plaza Represo - Identificaciones privadas');
    const calendar = CalendarApp.createCalendar('Eventos Plaza Represo', {
      summary: 'Agenda oficial de contratos y eventos de Plaza Represo',
      timeZone: APP_CONFIG.TIME_ZONE
    });

    props.setProperties({
      SPREADSHEET_ID: spreadsheet.getId(),
      CONTRACTS_FOLDER_ID: contractsFolder.getId(),
      PRIVATE_INE_FOLDER_ID: privateIneFolder.getId(),
      CALENDAR_ID: calendar.getId(),
      OWNER_EMAIL: owner,
      TIME_ZONE: APP_CONFIG.TIME_ZONE
    });

    appendObject_('Usuarios', { email: owner, role: APP_CONFIG.ROLE_OWNER, active: true });
    if (employee) {
      appendObject_('Usuarios', { email: employee, role: APP_CONFIG.ROLE_VIEWER, active: true });
      spreadsheet.addViewer(employee);
      contractsFolder.addViewer(employee);
    }

    const settings = {
      NEXT_CONTRACT_NUMBER: APP_CONFIG.START_CONTRACT_NUMBER,
      WEEKDAY_RATE: APP_CONFIG.WEEKDAY_RATE,
      WEEKEND_RATE: APP_CONFIG.WEEKEND_RATE,
      EVENT_HOURS: APP_CONFIG.EVENT_HOURS,
      REMINDER_PAYMENT_MINUTES: 10080,
      REMINDER_DAY_MINUTES: 1440,
      REMINDER_PREP_MINUTES: 240
    };
    Object.keys(settings).forEach(key => appendObject_('Configuracion', { key, value: settings[key] }));

    try { audit_('CONFIGURAR_SISTEMA', 'Sistema', spreadsheet.getId(), { owner, employee }); }
    catch (ignored) {}
    return getSystemInfo_();
  } finally {
    lock.releaseLock();
  }
}

function getSystemInfo() {
  currentUser_();
  return getSystemInfo_();
}

function getSystemInfo_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  return {
    configured: Boolean(props.SPREADSHEET_ID),
    spreadsheetUrl: props.SPREADSHEET_ID ? `https://docs.google.com/spreadsheets/d/${props.SPREADSHEET_ID}` : '',
    contractsFolderUrl: props.CONTRACTS_FOLDER_ID ? `https://drive.google.com/drive/folders/${props.CONTRACTS_FOLDER_ID}` : '',
    calendarId: props.CALENDAR_ID || '',
    timeZone: props.TIME_ZONE || APP_CONFIG.TIME_ZONE
  };
}

function initializeSheet_(sheet, headers) {
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#171717')
    .setFontColor('#ffffff');
  sheet.autoResizeColumns(1, headers.length);
}
