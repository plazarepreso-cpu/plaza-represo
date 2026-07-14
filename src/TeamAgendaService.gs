const TEAM_CALENDAR_PROPERTY_ = 'TEAM_CALENDAR_ID';
const TEAM_AGENDA_TAG_KEY_ = 'plaza_represo_team_source';
const TEAM_AGENDA_TITLE_ = 'Agenda de equipo — Plaza Represo';
const AGENDA_ONLY_MIGRATION_PROPERTY_ = 'AGENDA_ONLY_ACCESS_MIGRATION_V1';

/**
 * Este calendario es distinto al calendario oficial y permanece privado. Sus
 * eventos genéricos se invitan al equipo, sin cliente, contrato, pagos,
 * teléfono, domicilio ni enlaces a Drive.
 */
function getTeamAgendaCalendar_() {
  const id = String(
    PropertiesService.getScriptProperties().getProperty(TEAM_CALENDAR_PROPERTY_) || ''
  ).trim();
  return id ? CalendarApp.getCalendarById(id) : null;
}

function getOrCreateTeamAgendaCalendar_() {
  const existing = getTeamAgendaCalendar_();
  if (existing) return existing;

  const calendar = CalendarApp.createCalendar(TEAM_AGENDA_TITLE_, {
    description: 'Agenda de horarios reservados para el equipo. No contiene datos de clientes, contratos ni pagos.',
    timeZone: APP_CONFIG.TIME_ZONE
  });
  PropertiesService.getScriptProperties().setProperty(TEAM_CALENDAR_PROPERTY_, calendar.getId());
  return calendar;
}

function teamAgendaUrl_() {
  // Cada integrante recibe los eventos como invitado en su propio calendario;
  // nunca se le comparte el calendario interno de Plaza Represo.
  return 'https://calendar.google.com/calendar/u/0/r';
}

function teamAgendaSourceKey_(record) {
  const id = String(record && record.id || '').trim();
  if (id) return id;
  return [
    record && record.source,
    record && record.calendarId,
    record && record.eventDate,
    record && record.startTime,
    record && record.endTime
  ].map(value => String(value || '').trim()).join('::');
}

function teamAgendaEventDates_(record) {
  const start = parseLocalDate_(record.eventDate, record.startTime);
  const end = parseLocalDate_(record.eventDate, record.endTime);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

function teamAgendaEventTitle_(record) {
  return String(record && record.status || '').toUpperCase() === 'CANCELADO'
    ? 'Cancelado — evento reservado'
    : 'Evento reservado';
}

function normalizeTeamAgendaViewerEmails_(emails) {
  return Array.from(new Set((emails || [])
    .map(value => String(value || '').trim().toLowerCase())
    .filter(email => email && email.includes('@'))));
}

function teamAgendaWindow_() {
  const start = parseLocalDate_(todayIso_(), '00:00');
  start.setDate(start.getDate() - 1);
  const end = parseLocalDate_(todayIso_(), '23:59');
  end.setDate(end.getDate() + 730);
  return { start, end };
}

function syncTeamAgendaGuests_(event, emails) {
  const wanted = normalizeTeamAgendaViewerEmails_(emails);
  const existing = {};
  event.getGuestList().forEach(guest => {
    const email = String(guest.getEmail() || '').trim().toLowerCase();
    if (email) existing[email] = true;
  });
  wanted.forEach(email => {
    if (!existing[email]) event.addGuest(email);
  });
  // Los únicos invitados de los eventos sanitarios son integrantes de equipo.
  // Si se retira una cuenta, se elimina también de cada horario futuro.
  Object.keys(existing).forEach(email => {
    if (!wanted.includes(email)) event.removeGuest(email);
  });
}

function applyTeamAgendaEvent_(event, record, dates, sourceKey, viewerEmails) {
  event
    .setTitle(teamAgendaEventTitle_(record))
    .setTime(dates.start, dates.end)
    .setDescription('')
    .setLocation('')
    .setTag(TEAM_AGENDA_TAG_KEY_, sourceKey);
  syncTeamAgendaGuests_(event, viewerEmails);
  return event;
}

/**
 * Replica solo los horarios próximos. Las etiquetas permiten actualizar o
 * eliminar exclusivamente los eventos creados por el sistema, sin tocar citas
 * personales que alguien añada al calendario de equipo.
 */
function syncTeamAgendaFromRecords_(records, explicitViewerEmails) {
  const calendar = getOrCreateTeamAgendaCalendar_();
  const window = teamAgendaWindow_();
  const viewerEmails = normalizeTeamAgendaViewerEmails_(
    explicitViewerEmails === undefined ? listAgendaOnlyViewerEmails_() : explicitViewerEmails
  );
  const existingBySource = {};
  calendar.getEvents(window.start, window.end).forEach(event => {
    const sourceKey = String(event.getTag(TEAM_AGENDA_TAG_KEY_) || '').trim();
    if (sourceKey) existingBySource[sourceKey] = event;
  });

  const seen = {};
  let created = 0;
  let updated = 0;
  (records || []).forEach(record => {
    if (!record || String(record.eventDate || '') < todayIso_()) return;
    const sourceKey = teamAgendaSourceKey_(record);
    if (!sourceKey || seen[sourceKey]) return;
    let dates;
    try { dates = teamAgendaEventDates_(record); }
    catch (error) { return; }
    seen[sourceKey] = true;
    const existing = existingBySource[sourceKey];
    if (existing) {
      applyTeamAgendaEvent_(existing, record, dates, sourceKey, viewerEmails);
      updated += 1;
      return;
    }
    const createdEvent = calendar.createEvent(teamAgendaEventTitle_(record), dates.start, dates.end, {
      description: '',
      location: '',
      guests: viewerEmails.join(','),
      sendInvites: true
    });
    applyTeamAgendaEvent_(createdEvent, record, dates, sourceKey, viewerEmails);
    created += 1;
  });

  let removed = 0;
  Object.keys(existingBySource).forEach(sourceKey => {
    if (seen[sourceKey]) return;
    existingBySource[sourceKey].deleteEvent();
    removed += 1;
  });
  return { synced: created + updated, created, updated, removed };
}

function removeAgendaOnlyGuestFromTeamEvents_(email) {
  const calendar = getTeamAgendaCalendar_();
  if (!calendar) return;
  const window = teamAgendaWindow_();
  calendar.getEvents(window.start, window.end).forEach(event => {
    if (String(event.getTag(TEAM_AGENDA_TAG_KEY_) || '').trim()) {
      event.removeGuest(email);
    }
  });
}

function removeLegacyOfficialCalendarGuest_(email) {
  const id = String(
    PropertiesService.getScriptProperties().getProperty('CALENDAR_ID') || ''
  ).trim();
  if (!id) return;
  const calendar = CalendarApp.getCalendarById(id);
  if (!calendar) return;
  const start = parseLocalDate_(todayIso_(), '00:00');
  start.setDate(start.getDate() - 365);
  const end = parseLocalDate_(todayIso_(), '23:59');
  end.setDate(end.getDate() + 730);
  calendar.getEvents(start, end).forEach(event => {
    if (event.getGuestByEmail(email)) event.removeGuest(email);
  });
}

function removePrivateResourceAccess_(resource, email) {
  const failures = [];
  let removed = false;
  ['removeViewer', 'removeEditor'].forEach(method => {
    if (!resource || typeof resource[method] !== 'function') return;
    try {
      resource[method](email);
      removed = true;
    } catch (error) {
      failures.push(String(error.message || error));
    }
  });
  if (!removed && failures.length) throw new Error(failures.join(' | '));
}

function removeLegacyPrivateDataAccess_(email) {
  const props = PropertiesService.getScriptProperties();
  const resources = [
    [props.getProperty('SPREADSHEET_ID'), id => SpreadsheetApp.openById(id)],
    [props.getProperty('CONTRACTS_FOLDER_ID'), id => DriveApp.getFolderById(id)],
    [props.getProperty('PRIVATE_INE_FOLDER_ID'), id => DriveApp.getFolderById(id)]
  ];
  const failures = [];
  resources.forEach(item => {
    const id = String(item[0] || '').trim();
    if (!id) return;
    try {
      const resource = item[1](id);
      if (resource) removePrivateResourceAccess_(resource, email);
    } catch (error) {
      failures.push(String(error.message || error));
    }
  });
  try { removeLegacyOfficialCalendarGuest_(email); }
  catch (error) { failures.push(String(error.message || error)); }
  if (failures.length) throw new Error(failures.join(' | '));
}

function grantAgendaOnlyAccess_(email) {
  const previousEmails = listAgendaOnlyViewerEmails_();
  try {
    getOrCreateTeamAgendaCalendar_();
    removeLegacyPrivateDataAccess_(email);
    const emails = setAgendaOnlyViewerEmails_(previousEmails.concat([email]));
    syncTeamAgendaFromRecords_(listAgendaEvents_(), emails);
    PropertiesService.getScriptProperties().setProperty(AGENDA_ONLY_ACCESS_ENABLED_PROPERTY_, 'true');
    return { emails };
  } catch (error) {
    try { setAgendaOnlyViewerEmails_(previousEmails); } catch (ignored) {}
    try { removeAgendaOnlyGuestFromTeamEvents_(email); } catch (ignored) {}
    throw new Error(`No se pudo compartir la Agenda de equipo con ${email}: ${error.message || error}`);
  }
}

function revokeAgendaOnlyAccess_(email) {
  removeAgendaOnlyGuestFromTeamEvents_(email);
  removeLegacyPrivateDataAccess_(email);
  const emails = setAgendaOnlyViewerEmails_(
    listAgendaOnlyViewerEmails_().filter(value => value !== email)
  );
  return { emails };
}

/**
 * Convierte las cuentas de consulta existentes sin dejarles acceso a la hoja,
 * Drive, las identificaciones o el calendario oficial. Se ejecuta desde una
 * sesión propietaria y se repite si una revocación no terminó correctamente.
 */
function migrateExistingViewerAccessToAgendaOnly_() {
  const props = PropertiesService.getScriptProperties();
  if (String(props.getProperty(AGENDA_ONLY_MIGRATION_PROPERTY_) || '') === 'true') {
    return { migrated: false, viewers: listAgendaOnlyViewerEmails_().length };
  }

  const viewers = listObjects_('Usuarios')
    .filter(user => String(user.role || APP_CONFIG.ROLE_VIEWER) === APP_CONFIG.ROLE_VIEWER)
    .filter(user => isActiveUserValue_(user.active))
    .map(user => String(user.email || '').trim().toLowerCase())
    .filter(Boolean);
  getOrCreateTeamAgendaCalendar_();

  // Primero se prepara la agenda segura; no se revoca nada si no se puede
  // garantizar que el equipo tenga a dónde consultar sus horarios.
  syncAgendaFromCalendars_();
  syncTeamAgendaFromRecords_(listAgendaEvents_(), viewers);
  try {
    viewers.forEach(email => removeLegacyPrivateDataAccess_(email));
  } catch (error) {
    viewers.forEach(email => {
      try { removeAgendaOnlyGuestFromTeamEvents_(email); } catch (ignored) {}
    });
    throw new Error(`No se pudo terminar la migración de permisos: ${error.message || error}`);
  }

  setAgendaOnlyViewerEmails_(viewers);
  props.setProperty(AGENDA_ONLY_ACCESS_ENABLED_PROPERTY_, 'true');
  props.setProperty(AGENDA_ONLY_MIGRATION_PROPERTY_, 'true');
  try { audit_('MIGRAR_ACCESO_SOLO_AGENDA', 'Sistema', 'equipo', { viewers: viewers.length }); }
  catch (ignored) {}
  return { migrated: true, viewers: viewers.length };
}
