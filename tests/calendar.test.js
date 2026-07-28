const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function event(id, title, date, startHour, endHour, description = '', location = '') {
  return {
    getId: () => id,
    getTitle: () => title,
    getDescription: () => description,
    getLocation: () => location,
    getStartTime: () => new Date(2026, date.month - 1, date.day, startHour, 0, 0, 0),
    getEndTime: () => new Date(2026, date.month - 1, date.day, endHour, 0, 0, 0)
  };
}

function calendar(id, name, events) {
  return {
    getId: () => id,
    getName: () => name,
    getEvents: () => events
  };
}

const official = calendar('oficial', 'Eventos Plaza Represo', [
  event('nuevo', 'C.2626 | Juana Prueba | Fiesta infantil', { month:8, day:21 }, 18, 23,
    'Cliente: Juana Prueba\nTipo: Fiesta infantil')
]);
const legacy = calendar('propietaria@example.com', 'Rene Gonzalez', [
  event('anterior-1', 'Plaza Represo - C.2624 - Fiesta Infantil', { month:8, day:1 }, 18, 23),
  event('anterior-2', 'C 2616 4 a9 abono 2500 Piñata', { month:8, day:8 }, 8, 9),
  event('personal', 'Cita dental', { month:8, day:10 }, 10, 11)
]);
const written = [];
let ownerChecks = 0;

const context = vm.createContext({
  console,
  APP_CONFIG: { TIME_ZONE:'America/Hermosillo', VENUE_ADDRESS:'Dirección ficticia', EVENT_HOURS:5, WEEKDAY_RATE:3500, WEEKEND_RATE:4500 },
  CalendarApp: {
    getCalendarById: id => ({ oficial:official, 'propietaria@example.com':legacy }[id] || null)
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: key => ({ CALENDAR_ID:'oficial', OWNER_EMAIL:'propietaria@example.com' }[key] || '')
    })
  },
  Utilities: {
    formatDate: (date, zone, pattern) => {
      assert.strictEqual(zone, 'America/Hermosillo');
      const pad = value => String(value).padStart(2, '0');
      if (pattern === 'yyyy-MM-dd') return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      if (pattern === 'HH:mm') return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
      throw new Error(`Patrón inesperado: ${pattern}`);
    }
  },
  parseLocalDate_: (dateText, timeText) => {
    const [year, month, day] = dateText.split('-').map(Number);
    const [hour, minute] = timeText.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute, 0, 0);
  },
  todayIso_: () => '2026-07-13',
  eventDayName_: dateText => `Día ${dateText}`,
  nowIso_: () => '2026-07-13T20:00:00',
  ensureSchema_: () => ({}),
  replaceObjects_: (sheetName, records) => {
    assert.strictEqual(sheetName, 'Agenda');
    written.splice(0, written.length, ...records);
    return records;
  },
  listObjects_: sheetName => {
    assert.strictEqual(sheetName, 'Agenda');
    return written;
  },
  requireOwner_: () => { ownerChecks += 1; return { email:'propietaria@example.com' }; },
  audit_: () => {},
  getSetting_: () => 0,
  money_: value => String(value)
});

vm.runInContext(fs.readFileSync('src/CalendarService.gs', 'utf8'), context);

assert.strictEqual(context.calendarContractNumber_('Plaza Represo - C 2616'), 'C.2616');
assert.strictEqual(context.calendarContractNumber_('Contrato C.2624'), 'C.2624');
assert.strictEqual(context.isLegacyPlazaEvent_(legacy.getEvents()[2]), false, 'los eventos personales se excluyen');
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.legacyHoursFromText_('C 2616 4 a 9 abono 2500'))), {
  startTime:'16:00', endTime:'21:00'
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.legacyHoursFromText_('C 2601 8 a 1 cumpleaños'))), {
  startTime:'20:00', endTime:'01:00'
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.legacyHoursFromText_('Hora inicio: 5:00 p.m. Hora fin: 10:00 p.m.'))), {
  startTime:'17:00', endTime:'22:00'
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.legacyHoursFromText_('C 2618 4:30 9:30 piñata'))), {
  startTime:'16:30', endTime:'21:30'
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.legacyMoneyFromText_('Piñata 5 a 10 abono 2 250', '2026-05-02'))), {
  total:4500, paid:2250, balance:2250
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.legacyMoneyFromText_('Piñata 12 a 5 p.m abono 2,2509', '2026-04-05'))), {
  total:4500, paid:2250, balance:2250
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.legacyMoneyFromText_('Abono 2,300, restan 2,200 pago todo', '2026-06-13'))), {
  total:4500, paid:4500, balance:0
});
assert.strictEqual(
  context.calendarTextField_('Cliente: Edna Prueba (6310000000). Tipo de evento: Piñata. Saldo pendiente: $1,000.', 'Cliente'),
  'Edna Prueba (6310000000).'
);
const detailed = context.calendarEventToAgenda_(event(
  'anterior-detallado',
  'Título: Piñata infantil Fecha: 22 de mayo de 2026 Hora inicio: 5:00 p.m. Hora fin: 10:00 p.m. Ubicación: Plaza Represo Cliente: Edna Prueba Teléfono: 6310000000 Domicilio: Calle Ficticia 28 Contrato: C.2612 Notas: Abono $3,500, resta $1,000',
  { month:5, day:22 }, 22, 23
), legacy, 'ANTERIOR');
assert.strictEqual(detailed.clientName, 'Edna Prueba');
assert.strictEqual(detailed.phone, '6310000000');
assert.strictEqual(detailed.address, 'Calle Ficticia 28');
assert.strictEqual(detailed.startTime, '17:00');
assert.strictEqual(detailed.endTime, '22:00');

const summary = context.syncAgendaFromCalendars_();
assert.deepStrictEqual(JSON.parse(JSON.stringify(summary)), { synced:3, calendars:2, errors:[] });
assert.deepStrictEqual(written.map(item => item.contractNumber), ['C.2624', 'C.2616', 'C.2626']);
assert.strictEqual(written.find(item => item.contractNumber === 'C.2626').clientName, 'Juana Prueba');
assert.strictEqual(written.find(item => item.contractNumber === 'C.2624').eventType, 'Fiesta Infantil');
assert.strictEqual(written.find(item => item.contractNumber === 'C.2616').startTime, '16:00', 'el horario escrito corrige eventos antiguos guardados con hora genérica');
assert.strictEqual(written.find(item => item.contractNumber === 'C.2616').endTime, '21:00');
assert.strictEqual(written.find(item => item.contractNumber === 'C.2616').paid, 2500);
assert.strictEqual(written.find(item => item.contractNumber === 'C.2616').balance, 2000);
assert.strictEqual(written.some(item => item.title === 'Cita dental'), false);

context.syncAgendaNow();
assert.strictEqual(ownerChecks, 1, 'la sincronización manual exige cuenta propietaria');
assert.strictEqual(context.listAgendaEvents_().length, 3);

const reusedCalls = [];
const existingManagedEvent = {
  getId:() => 'evento-2627-existente',
  getTitle:() => 'C.2627 | Cliente anterior | Fiesta',
  getDescription:() => 'Contrato: C.2627',
  getStartTime:() => new Date(2026, 7, 15, 18, 30),
  setTitle(value) { reusedCalls.push(['title', value]); return this; },
  setTime(start, end) { reusedCalls.push(['time', start, end]); return this; },
  setDescription(value) { reusedCalls.push(['description', value]); return this; },
  setLocation(value) { reusedCalls.push(['location', value]); return this; },
  removeAllReminders() { reusedCalls.push(['reminders']); return this; },
  addPopupReminder(minutes) { reusedCalls.push(['popup', minutes]); return this; }
};
let createCalls = 0;
context.getCalendar_ = () => ({
  getEvents:() => [existingManagedEvent],
  createEvent:() => { createCalls += 1; throw new Error('No debe duplicar el evento.'); }
});
const reusedId = context.createCalendarEvent_({
  contractNumber:'C.2627', clientName:'Yesenia Prueba', phone:'6310000000', eventType:'Fiesta', notes:'',
  eventDate:'2026-08-15', startTime:'18:30', endTime:'23:30', total:4500, paid:2000, balance:2500,
  currentPdfFileId:'pdf-2627'
});
assert.strictEqual(reusedId, 'evento-2627-existente');
assert.strictEqual(createCalls, 0, 'un reintento reutiliza el evento existente y no crea duplicados');
assert.ok(reusedCalls.some(call => call[0] === 'title'), 'el evento existente se actualiza con los datos vigentes');

console.log('Agenda verificada: Calendar existente, contratos nuevos, filtros y sincronización compartida.');
