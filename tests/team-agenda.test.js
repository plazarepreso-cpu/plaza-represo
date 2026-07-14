const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const state = {
  properties: {
    TEAM_CALENDAR_ID: 'agenda-equipo-ficticia',
    TEAM_VIEWER_EMAILS: '[]',
    SPREADSHEET_ID: 'hoja-privada-ficticia',
    CONTRACTS_FOLDER_ID: 'contratos-privados-ficticios',
    PRIVATE_INE_FOLDER_ID: 'ines-privadas-ficticias'
  },
  legacyViewers: {
    spreadsheet: new Set(),
    contracts: new Set(),
    ines: new Set()
  },
  teamEvents: [],
  agendaRecords: [],
  auditEntries: [],
  sourceCalendarSyncs: 0
};

function makeTeamEvent(title, start, end) {
  const tags = {};
  return {
    title,
    start: new Date(start),
    end: new Date(end),
    description: 'texto heredado que nunca debe conservarse',
    location: 'ubicación heredada que nunca debe conservarse',
    guests: new Set(),
    deleted: false,
    getTag(key) { return tags[key] || ''; },
    setTag(key, value) { tags[key] = String(value); return this; },
    getTitle() { return this.title; },
    setTitle(value) { this.title = String(value); return this; },
    getStartTime() { return new Date(this.start); },
    getEndTime() { return new Date(this.end); },
    setTime(nextStart, nextEnd) {
      this.start = new Date(nextStart);
      this.end = new Date(nextEnd);
      return this;
    },
    getDescription() { return this.description; },
    setDescription(value) { this.description = String(value); return this; },
    getLocation() { return this.location; },
    setLocation(value) { this.location = String(value); return this; },
    getGuestList() {
      return Array.from(this.guests).map(email => ({ getEmail: () => email }));
    },
    addGuest(email) { this.guests.add(String(email).toLowerCase()); return this; },
    removeGuest(email) { this.guests.delete(String(email).toLowerCase()); return this; },
    deleteEvent() { this.deleted = true; }
  };
}

const teamCalendar = {
  getId: () => 'agenda-equipo-ficticia',
  getEvents: () => state.teamEvents.filter(event => !event.deleted),
  createEvent(title, start, end) {
    const event = makeTeamEvent(title, start, end);
    state.teamEvents.push(event);
    return event;
  }
};

function privateResource(viewers) {
  return { removeViewer: email => viewers.delete(String(email).toLowerCase()) };
}

const properties = {
  getProperty: key => state.properties[key] || '',
  setProperty: (key, value) => { state.properties[key] = String(value); }
};

const context = vm.createContext({
  APP_CONFIG: {
    ROLE_OWNER: 'PROPIETARIO',
    ROLE_VIEWER: 'CONSULTA',
    TIME_ZONE: 'America/Hermosillo'
  },
  PropertiesService: { getScriptProperties: () => properties },
  CalendarApp: {
    getCalendarById: id => id === 'agenda-equipo-ficticia' ? teamCalendar : null,
    createCalendar: () => teamCalendar
  },
  SpreadsheetApp: {
    openById: id => {
      assert.strictEqual(id, 'hoja-privada-ficticia');
      return privateResource(state.legacyViewers.spreadsheet);
    }
  },
  DriveApp: {
    getFolderById: id => {
      if (id === 'contratos-privados-ficticios') return privateResource(state.legacyViewers.contracts);
      if (id === 'ines-privadas-ficticias') return privateResource(state.legacyViewers.ines);
      throw new Error(`Carpeta inesperada: ${id}`);
    }
  },
  Session: { getActiveUser: () => ({ getEmail: () => '' }) },
  parseLocalDate_: (dateText, timeText) => {
    const [year, month, day] = String(dateText).split('-').map(Number);
    const [hour, minute] = String(timeText).split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute || 0, 0, 0);
  },
  todayIso_: () => '2026-07-13',
  listObjects_: sheetName => {
    assert.strictEqual(sheetName, 'Usuarios');
    return [
      { email: 'empleada.ficticia@example.com', role: 'CONSULTA', active: true },
      { email: 'propietaria.ficticia@example.com', role: 'PROPIETARIO', active: true },
      { email: 'inactiva.ficticia@example.com', role: 'CONSULTA', active: false }
    ];
  },
  listAgendaEvents_: () => state.agendaRecords.map(record => ({ ...record })),
  isActiveUserValue_: value => value === true || String(value).toLowerCase() === 'true',
  syncAgendaFromCalendars_: () => { state.sourceCalendarSyncs += 1; return { synced: 1 }; },
  audit_: (action, type, id, details) => state.auditEntries.push({ action, type, id, details })
});

vm.runInContext(fs.readFileSync('src/Security.gs', 'utf8'), context);
vm.runInContext(fs.readFileSync('src/TeamAgendaService.gs', 'utf8'), context);

function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function test(name, callback) {
  try {
    callback();
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

test('la agenda de equipo crea un evento genérico sin datos del cliente ni dinero', () => {
  const record = {
    id: 'fuente-privada-001',
    eventDate: '2026-08-21',
    startTime: '18:00',
    endTime: '23:00',
    status: 'ACTIVO',
    contractNumber: 'C.2626',
    clientName: 'Juana Información Privada',
    phone: '6310000000',
    address: 'Calle Secreta 99',
    total: 4500,
    paid: 2250,
    balance: 2250,
    notes: 'Abonó $2,250 y debe $2,250'
  };
  state.agendaRecords = [record];
  const result = snapshot(context.syncTeamAgendaFromRecords_([record], ['empleada.ficticia@example.com']));
  assert.deepStrictEqual(result, { synced: 1, created: 1, updated: 0, removed: 0 });
  const event = state.teamEvents.find(item => !item.deleted);
  assert.strictEqual(event.getTitle(), 'Evento reservado');
  assert.strictEqual(event.getDescription(), '');
  assert.strictEqual(event.getLocation(), '');
  assert.strictEqual(event.getTag('plaza_represo_team_source'), 'fuente-privada-001');
  assert.strictEqual(event.getStartTime().getHours(), 18);
  assert.strictEqual(event.getEndTime().getHours(), 23);
  assert.strictEqual(event.guests.has('empleada.ficticia@example.com'), true, 'se invita a la cuenta de consulta');
  assert.strictEqual(typeof teamCalendar.addViewer, 'undefined', 'el calendario interno no se comparte como carpeta');

  const visibleToEmployee = JSON.stringify({
    title: event.getTitle(),
    start: event.getStartTime(),
    end: event.getEndTime(),
    description: event.getDescription(),
    location: event.getLocation()
  });
  ['Juana', 'C.2626', '6310000000', 'Calle Secreta', '4500', '2250', 'Abonó'].forEach(secret => {
    assert.strictEqual(visibleToEmployee.includes(secret), false, `se filtró ${secret}`);
  });
});

test('actualizar un horario conserva el título y los campos genéricos', () => {
  const updatedRecord = {
    id: 'fuente-privada-001',
    eventDate: '2026-08-21',
    startTime: '19:30',
    endTime: '00:30',
    status: 'ACTIVO',
    clientName: 'Otro nombre que no debe verse',
    total: 9999
  };
  state.agendaRecords = [updatedRecord];
  const result = snapshot(context.syncTeamAgendaFromRecords_([updatedRecord], ['empleada.ficticia@example.com']));
  assert.deepStrictEqual(result, { synced: 1, created: 0, updated: 1, removed: 0 });
  const event = state.teamEvents.find(item => !item.deleted && item.getTag('plaza_represo_team_source') === 'fuente-privada-001');
  assert.strictEqual(event.getTitle(), 'Evento reservado');
  assert.strictEqual(event.getDescription(), '');
  assert.strictEqual(event.getLocation(), '');
  assert.strictEqual(event.getStartTime().getHours(), 19);
  assert.strictEqual(event.getStartTime().getMinutes(), 30);
  assert.strictEqual(event.getEndTime().getHours(), 0);
  assert.strictEqual(event.getEndTime().getMinutes(), 30);
  assert.strictEqual(event.guests.has('empleada.ficticia@example.com'), true, 'la invitación se conserva al actualizar');
});

test('elimina eventos automáticos que ya no existen, sin tocar otros eventos', () => {
  const stale = makeTeamEvent('Evento reservado', new Date(2026, 7, 22, 18), new Date(2026, 7, 22, 23));
  stale.setTag('plaza_represo_team_source', 'origen-ya-eliminado');
  const personal = makeTeamEvent('Reunión privada del equipo', new Date(2026, 7, 23, 9), new Date(2026, 7, 23, 10));
  state.teamEvents.push(stale, personal);

  const currentRecord = {
    id: 'fuente-privada-001',
    eventDate: '2026-08-21',
    startTime: '19:30',
    endTime: '00:30',
    status: 'ACTIVO'
  };
  state.agendaRecords = [currentRecord];
  const result = snapshot(context.syncTeamAgendaFromRecords_([currentRecord], ['empleada.ficticia@example.com']));
  assert.deepStrictEqual(result, { synced: 1, created: 0, updated: 1, removed: 1 });
  assert.strictEqual(stale.deleted, true, 'solo se elimina el evento automático obsoleto');
  assert.strictEqual(personal.deleted, false, 'las citas manuales nunca se modifican');
});

test('la migración invita a los horarios genéricos y revoca recursos privados heredados', () => {
  const email = 'empleada.ficticia@example.com';
  Object.values(state.legacyViewers).forEach(viewers => viewers.add(email));
  state.properties.TEAM_VIEWER_EMAILS = '[]';
  const result = snapshot(context.migrateExistingViewerAccessToAgendaOnly_());

  assert.deepStrictEqual(result, { migrated: true, viewers: 1 });
  const agendaEvent = state.teamEvents.find(event =>
    !event.deleted && event.getTag('plaza_represo_team_source') === 'fuente-privada-001'
  );
  assert.strictEqual(agendaEvent.guests.has(email), true, 'la empleada recibe cada horario genérico como invitación');
  Object.entries(state.legacyViewers).forEach(([name, viewers]) => {
    assert.strictEqual(viewers.has(email), false, `se conservó acceso heredado a ${name}`);
  });
  assert.deepStrictEqual(JSON.parse(state.properties.TEAM_VIEWER_EMAILS), [email]);
  assert.strictEqual(state.properties.AGENDA_ONLY_ACCESS_ENABLED, 'true');
  assert.strictEqual(state.properties.AGENDA_ONLY_ACCESS_MIGRATION_V1, 'true');
  assert.strictEqual(state.sourceCalendarSyncs, 1, 'primero se sincroniza la agenda segura');
  assert.strictEqual(state.auditEntries.at(-1).action, 'MIGRAR_ACCESO_SOLO_AGENDA');
});

test('retirar consulta quita las invitaciones futuras sin dar acceso al calendario interno', () => {
  const email = 'empleada.ficticia@example.com';
  const result = snapshot(context.revokeAgendaOnlyAccess_(email));
  assert.deepStrictEqual(result, { emails: [] });
  state.teamEvents.filter(event => !event.deleted && event.getTag('plaza_represo_team_source')).forEach(event => {
    assert.strictEqual(event.guests.has(email), false, 'la cuenta retirada ya no queda como invitada');
  });
  assert.strictEqual(typeof teamCalendar.addViewer, 'undefined');
});

console.log('Agenda de equipo verificada: horarios genéricos, limpieza de eventos y acceso exclusivo.');
