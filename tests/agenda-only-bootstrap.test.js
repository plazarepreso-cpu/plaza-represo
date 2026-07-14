const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const TEAM_AGENDA_URL = 'https://calendar.google.com/calendar/u/0/r';
const properties = {
  OWNER_EMAIL: 'propietaria.ficticia@example.com',
  CALENDAR_ID: 'calendario-oficial-privado',
  TEAM_CALENDAR_ID: 'agenda-equipo-ficticia',
  SPREADSHEET_ID: 'base-de-datos-privada',
  CONTRACTS_FOLDER_ID: 'carpeta-de-contratos-privada'
};
const privateReads = [];

function privateRead(name) {
  privateReads.push(name);
  throw new Error(`La vista de agenda no debe leer ${name}.`);
}

const context = vm.createContext({
  APP_CONFIG: {
    ROLE_OWNER: 'PROPIETARIO',
    ROLE_VIEWER: 'CONSULTA',
    TIME_ZONE: 'America/Hermosillo',
    WEEKDAY_RATE: 3500,
    WEEKEND_RATE: 4500,
    EVENT_HOURS: 5,
    START_CONTRACT_NUMBER: 9001
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: key => properties[key] || '',
      getProperties: () => ({ ...properties })
    })
  },
  CalendarApp: {
    getCalendarById: () => null
  },
  currentUser_: () => ({ email: 'empleada.ficticia@example.com', role: 'CONSULTA' }),
  listObjects_: sheetName => privateRead(`la hoja ${sheetName}`),
  getSetting_: key => privateRead(`la configuración ${key}`),
  listAccessUsers_: () => privateRead('la lista de accesos'),
  listAgendaEvents_: () => privateRead('la agenda privada'),
  listHistoricalContracts_: () => privateRead('el historial de contratos'),
  listContractFileLinks_: () => privateRead('los archivos de Drive'),
  getSystemInfo_: () => privateRead('las URLs internas del sistema'),
  getAutomationStatus_: () => privateRead('las automatizaciones'),
  privateIneUrlForOwner_: () => privateRead('las identificaciones'),
  stripPrivateContractFields_: contract => ({ ...contract }),
  stripPrivateClientFields_: client => ({ ...client }),
  getPlazaRepresoBrandDataUrl_: () => privateRead('la imagen guardada en Drive'),
  // Se ofrecen los nombres de ayuda usados por las variantes del servicio;
  // el objetivo de esta prueba es la frontera pública de getBootstrapData.
  teamAgendaUrl_: () => TEAM_AGENDA_URL,
  getTeamAgendaUrl_: () => TEAM_AGENDA_URL,
  getAgendaOnlyUrl_: () => TEAM_AGENDA_URL,
  console
});

// Carga los servicios que pueden alojar utilidades de Agenda de equipo.  No se
// carga Config.gs porque define APP_CONFIG dentro del mismo contexto de prueba.
const helperFiles = fs.readdirSync('src')
  .filter(file => /(?:access|agenda|calendar|security).*\.gs$/i.test(file))
  .sort();
helperFiles.forEach(file => vm.runInContext(fs.readFileSync(path.join('src', file), 'utf8'), context));

// Security.gs define currentUser_; la prueba representa el acceso que ya fue
// autorizado por ScriptProperties, sin tocar la hoja privada.
context.currentUser_ = () => ({ email: 'empleada.ficticia@example.com', role: 'CONSULTA' });
context.teamAgendaUrl_ = () => TEAM_AGENDA_URL;
context.getTeamAgendaUrl_ = () => TEAM_AGENDA_URL;
context.getAgendaOnlyUrl_ = () => TEAM_AGENDA_URL;

vm.runInContext(fs.readFileSync('src/ContractService.gs', 'utf8'), context);

// ContractService puede declarar una utilidad con el mismo nombre; fijamos el
// enlace público de prueba una vez cargado todo el código.
context.teamAgendaUrl_ = () => TEAM_AGENDA_URL;
context.getTeamAgendaUrl_ = () => TEAM_AGENDA_URL;
context.getAgendaOnlyUrl_ = () => TEAM_AGENDA_URL;

const data = JSON.parse(JSON.stringify(context.getBootstrapData()));

assert.strictEqual(data.agendaOnly, true, 'la cuenta CONSULTA debe recibir el modo exclusivo de agenda');
assert.strictEqual(data.agendaUrl, TEAM_AGENDA_URL, 'debe abrir el calendario propio donde llegan las invitaciones');
assert.deepStrictEqual(data.user, {
  email: 'empleada.ficticia@example.com',
  role: 'CONSULTA'
});
assert.deepStrictEqual(data.contracts || [], [], 'no se entregan contratos al empleado');
assert.deepStrictEqual(data.payments || [], [], 'no se entregan pagos al empleado');
assert.deepStrictEqual(data.clients || [], [], 'no se entregan clientes al empleado');
assert.deepStrictEqual(data.history || [], [], 'no se entrega historial al empleado');
assert.deepStrictEqual(data.files || [], [], 'no se entregan archivos de Drive al empleado');
assert.deepStrictEqual(data.users || [], [], 'no se entregan cuentas de acceso al empleado');
assert.strictEqual(privateReads.length, 0, `no debe consultar recursos privados: ${privateReads.join(', ')}`);

const serialized = JSON.stringify(data);
[
  'C.9001',
  'Cliente Ficticio',
  'Domicilio',
  '6310000000',
  '3500',
  'base-de-datos-privada',
  'carpeta-de-contratos-privada',
  'calendario-oficial-privado',
  'spreadsheetUrl',
  'contractsFolderUrl',
  'weekdayRate',
  'weekendRate',
  'nextContractNumber'
].forEach(secret => assert.strictEqual(serialized.includes(secret), false, `se filtró información privada: ${secret}`));

console.log('Agenda exclusiva verificada: el empleado no recibe datos privados ni lee la base interna.');
