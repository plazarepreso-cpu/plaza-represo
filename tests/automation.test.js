const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const state = {
  ownerChecks: 0,
  triggers: [],
  deletedTriggers: [],
  createdSchedules: [],
  audits: [],
  contracts: [],
  calendarUpdates: [],
  cancellations: [],
  savedUpdates: [],
  agendaSyncs: 0,
  lockWaits: [],
  lockReleases: 0,
  throwOnList: false
};

function fakeTrigger(handler, schedule) {
  return {
    handler,
    schedule: schedule || {},
    getHandlerFunction() { return this.handler; }
  };
}

const ScriptApp = {
  getProjectTriggers: () => state.triggers.slice(),
  deleteTrigger: trigger => {
    state.deletedTriggers.push(trigger);
    state.triggers = state.triggers.filter(candidate => candidate !== trigger);
  },
  newTrigger: handler => {
    const schedule = { handler };
    const builder = {
      timeBased() { schedule.type = 'timeBased'; return this; },
      atHour(hour) { schedule.hour = hour; return this; },
      everyDays(days) { schedule.everyDays = days; return this; },
      inTimezone(timeZone) { schedule.timeZone = timeZone; return this; },
      create() {
        state.createdSchedules.push({ ...schedule });
        const trigger = fakeTrigger(handler, { ...schedule });
        state.triggers.push(trigger);
        return trigger;
      }
    };
    return builder;
  }
};

const lock = {
  waitLock: milliseconds => state.lockWaits.push(milliseconds),
  releaseLock: () => { state.lockReleases += 1; }
};

const context = vm.createContext({
  console,
  APP_CONFIG: { TIME_ZONE: 'America/Hermosillo' },
  ScriptApp,
  LockService: { getScriptLock: () => lock },
  requireOwner_: () => {
    state.ownerChecks += 1;
    return { email: 'propietaria.ficticia@example.com', role: 'PROPIETARIO' };
  },
  audit_: (action, entityType, entityId, details) => {
    state.audits.push({ action, entityType, entityId, details: { ...details } });
  },
  todayIso_: () => '2026-08-10',
  parseLocalDate_: (dateText, timeText) => {
    const [year, month, day] = String(dateText).split('-').map(Number);
    const [hour, minute] = String(timeText || '00:00').split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute || 0, 0, 0);
  },
  listObjects_: sheetName => {
    assert.strictEqual(sheetName, 'Contratos');
    if (state.throwOnList) throw new Error('Fallo ficticio al leer contratos');
    return state.contracts;
  },
  updateCalendarEvent_: contract => {
    state.calendarUpdates.push(contract.id);
    if (contract.id === 'contrato-ficticio-error-calendario') {
      throw new Error('Fallo ficticio de calendario');
    }
    if (contract.id === 'contrato-ficticio-evento-nuevo') return 'evento-ficticio-nuevo';
    return contract.calendarEventId;
  },
  markCalendarEventCancelled_: contract => {
    state.cancellations.push(contract.id);
    if (contract.id === 'contrato-ficticio-error-cancelacion') {
      throw new Error('Fallo ficticio al cancelar evento');
    }
  },
  syncAgendaFromCalendars_: () => {
    state.agendaSyncs += 1;
    return { synced: 2, calendars: 2, errors: [] };
  },
  updateObject_: (sheetName, idColumn, id, updates) => {
    state.savedUpdates.push({ sheetName, idColumn, id, updates: { ...updates } });
    return { id, ...updates };
  }
});

vm.runInContext(fs.readFileSync('src/AutomationService.gs', 'utf8'), context);

state.triggers = [
  fakeTrigger('runDailyAutomation_'),
  fakeTrigger('runDailyAutomation_'),
  fakeTrigger('otroProcesoFicticio_')
];

const internalStatus = context.getAutomationStatus_();
assert.strictEqual(state.ownerChecks, 0, 'el helper interno no exige autorización');
assert.strictEqual(internalStatus.installed, false, 'los duplicados no representan una instalación sana');
assert.strictEqual(internalStatus.triggerCount, 2);

context.getAutomationStatus();
assert.strictEqual(state.ownerChecks, 1, 'el estado público exige propietario');

const firstInstall = context.installAutomations();
assert.strictEqual(firstInstall.installed, true);
assert.strictEqual(firstInstall.triggerCount, 1);
assert.strictEqual(state.triggers.filter(trigger => trigger.handler === 'runDailyAutomation_').length, 1);
assert.strictEqual(state.triggers.filter(trigger => trigger.handler === 'otroProcesoFicticio_').length, 1);
assert.deepStrictEqual(state.createdSchedules[0], {
  handler: 'runDailyAutomation_',
  type: 'timeBased',
  hour: 8,
  everyDays: 1,
  timeZone: 'America/Hermosillo'
});

const secondInstall = context.installAutomations();
assert.strictEqual(secondInstall.installed, true);
assert.strictEqual(secondInstall.triggerCount, 1);
assert.strictEqual(state.triggers.filter(trigger => trigger.handler === 'runDailyAutomation_').length, 1,
  'reinstalar conserva exactamente un disparador');
assert.strictEqual(state.createdSchedules.length, 2, 'cada instalación deja una programación diaria válida');
assert.strictEqual(state.audits.filter(item => item.action === 'INSTALAR_AUTOMATIZACIONES').length, 2);

state.contracts = [
  {
    id: 'contrato-ficticio-evento-nuevo', status: 'CONFIRMADO', eventDate: '2026-08-17',
    balance: 1750, calendarEventId: 'evento-ficticio-anterior'
  },
  {
    id: 'contrato-ficticio-pagado', status: 'PAGADO', eventDate: '2026-08-12',
    balance: 0, calendarEventId: 'evento-ficticio-pagado'
  },
  {
    id: 'contrato-ficticio-error-calendario', status: 'CONFIRMADO', eventDate: '2026-08-09',
    balance: 900, calendarEventId: 'evento-ficticio-error'
  },
  {
    id: 'contrato-ficticio-futuro', status: 'CONFIRMADO', eventDate: '2026-08-18',
    balance: 1200, calendarEventId: 'evento-ficticio-futuro'
  },
  {
    id: 'contrato-ficticio-cancelado', status: 'CANCELADO', eventDate: '2026-08-15',
    balance: 1000, calendarEventId: 'evento-ficticio-cancelado'
  },
  {
    id: 'contrato-ficticio-error-cancelacion', status: 'CANCELADO', eventDate: '2026-08-16',
    balance: 500, calendarEventId: 'evento-ficticio-cancelacion-error'
  },
  { id: 'contrato-ficticio-generando', status: 'GENERANDO', eventDate: '2026-08-11', balance: 3500 },
  { id: 'contrato-ficticio-error-previo', status: 'ERROR', eventDate: '2026-08-11', balance: 3500 }
];

const summary = context.runDailyAutomation_();
assert.deepStrictEqual(JSON.parse(JSON.stringify(summary)), {
  processed: 6,
  reconciled: 3,
  cancelled: 1,
  paymentDue: 1,
  agendaSynced: 2,
  agendaErrors: 0,
  errors: 2
});
assert.strictEqual(state.agendaSyncs, 1, 'la ejecución diaria sincroniza la agenda compartida');
assert.deepStrictEqual(state.savedUpdates, [
  {
    sheetName:'Contratos', idColumn:'id', id:'contrato-ficticio-evento-nuevo',
    updates:{ calendarEventId:'evento-ficticio-nuevo', calendarSyncStatus:'SINCRONIZADO', calendarError:'' }
  },
  {
    sheetName:'Contratos', idColumn:'id', id:'contrato-ficticio-pagado',
    updates:{ calendarEventId:'evento-ficticio-pagado', calendarSyncStatus:'SINCRONIZADO', calendarError:'' }
  },
  {
    sheetName:'Contratos', idColumn:'id', id:'contrato-ficticio-error-calendario',
    updates:{ calendarSyncStatus:'PENDIENTE', calendarError:'Fallo ficticio de calendario' }
  },
  {
    sheetName:'Contratos', idColumn:'id', id:'contrato-ficticio-futuro',
    updates:{ calendarEventId:'evento-ficticio-futuro', calendarSyncStatus:'SINCRONIZADO', calendarError:'' }
  }
], 'la automatización deja explícito si cada contrato quedó sincronizado o pendiente');
assert.deepStrictEqual(state.calendarUpdates, [
  'contrato-ficticio-evento-nuevo',
  'contrato-ficticio-pagado',
  'contrato-ficticio-error-calendario',
  'contrato-ficticio-futuro'
]);
assert.deepStrictEqual(state.cancellations, [
  'contrato-ficticio-cancelado',
  'contrato-ficticio-error-cancelacion'
]);
assert.deepStrictEqual(state.lockWaits, [30000]);
assert.strictEqual(state.lockReleases, 1, 'el bloqueo se libera después de una ejecución con errores aislados');
assert.deepStrictEqual(
  state.audits.find(item => item.action === 'EJECUTAR_AUTOMATIZACION').details,
  JSON.parse(JSON.stringify(summary))
);

state.throwOnList = true;
assert.throws(() => context.runDailyAutomation_(), /Fallo ficticio al leer contratos/);
assert.deepStrictEqual(state.lockWaits, [30000, 30000]);
assert.strictEqual(state.lockReleases, 2, 'el bloqueo también se libera si falla la lectura general');
state.throwOnList = false;

const originalRunner = context.runDailyAutomation_;
let manualRuns = 0;
context.runDailyAutomation_ = () => {
  manualRuns += 1;
  return { processed: 0, reconciled: 0, cancelled: 0, paymentDue: 0, errors: 0 };
};
const manualResult = context.runAutomationNow();
assert.strictEqual(manualRuns, 1, 'la ejecución manual delega al proceso diario');
assert.strictEqual(manualResult.processed, 0);
assert.strictEqual(state.ownerChecks, 4, 'estado, dos instalaciones y ejecución manual exigen propietario');
context.runDailyAutomation_ = originalRunner;

console.log('Automatizaciones verificadas: acceso, instalación, agenda, pagos, errores y bloqueo.');
