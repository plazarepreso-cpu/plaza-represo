const TEAM_CALENDAR_PROPERTY_ = 'TEAM_CALENDAR_ID';
const TEAM_AGENDA_TAG_KEY_ = 'plaza_represo_team_source';
const TEAM_AGENDA_TITLE_ = 'Agenda de equipo — Plaza Represo';
const AGENDA_ONLY_MIGRATION_PROPERTY_ = 'AGENDA_ONLY_ACCESS_MIGRATION_V1';
const TEAM_AGENDA_CACHE_PREFIX_ = 'TEAM_AGENDA_CACHE_V1_';
const TEAM_AGENDA_CACHE_COUNT_PROPERTY_ = 'TEAM_AGENDA_CACHE_V1_COUNT';
const TEAM_AGENDA_CACHE_CHUNK_SIZE_ = 7500;

/**
 * Datos expresamente aprobados para el equipo. Esta caché no requiere que una
 * cuenta de consulta abra la base privada, Drive, Calendar oficial ni INE.
 */
function safeTeamAgendaRecord_(record) {
  if (!record || String(record.status || '').toUpperCase() === 'CANCELADO') return null;
  const eventDate = String(record.eventDate || '').trim();
  if (!eventDate || eventDate < todayIso_()) return null;
  const rawBalance = record.balance !== '' && record.balance !== null && record.balance !== undefined
    ? record.balance
    : (record.paymentStatus === 'PENDIENTE' ? record.pendingBalance : (record.paymentStatus === 'LIQUIDADO' ? 0 : ''));
  const hasBalance = rawBalance !== '' && rawBalance !== null && rawBalance !== undefined && Number.isFinite(Number(rawBalance));
  const balance = hasBalance ? roundMoney_(Number(rawBalance)) : null;
  const paymentStatus = balance === null ? '' : (balance <= 0 ? 'LIQUIDADO' : 'PENDIENTE');
  return {
    contractNumber: String(record.contractNumber || '').trim(),
    clientName: String(record.clientName || record.title || 'Evento reservado').trim(),
    eventDate,
    eventDay: String(record.eventDay || '').trim(),
    startTime: String(record.startTime || '').trim(),
    endTime: String(record.endTime || '').trim(),
    eventType: String(record.eventType || 'Evento').trim(),
    notes: String(record.notes || '').trim(),
    paymentStatus,
    pendingBalance: paymentStatus === 'PENDIENTE' ? balance : null
  };
}

function teamAgendaCacheKey_(record) {
  return [record.contractNumber, record.eventDate, record.startTime, record.clientName]
    .map(value => String(value || '').trim().toUpperCase()).join('|');
}

function writeTeamAgendaCache_(records) {
  const safe = (records || []).map(safeTeamAgendaRecord_).filter(Boolean)
    .sort((a, b) => `${a.eventDate} ${a.startTime}`.localeCompare(`${b.eventDate} ${b.startTime}`));
  const serialized = JSON.stringify(safe);
  const chunks = [];
  for (let offset = 0; offset < serialized.length; offset += TEAM_AGENDA_CACHE_CHUNK_SIZE_) {
    chunks.push(serialized.slice(offset, offset + TEAM_AGENDA_CACHE_CHUNK_SIZE_));
  }
  if (!chunks.length) chunks.push('[]');
  const props = PropertiesService.getScriptProperties();
  const previousCount = Math.max(0, Number(props.getProperty(TEAM_AGENDA_CACHE_COUNT_PROPERTY_) || 0));
  chunks.forEach((chunk, index) => props.setProperty(`${TEAM_AGENDA_CACHE_PREFIX_}${index}`, chunk));
  for (let index = chunks.length; index < previousCount; index += 1) props.setProperty(`${TEAM_AGENDA_CACHE_PREFIX_}${index}`, '');
  props.setProperty(TEAM_AGENDA_CACHE_COUNT_PROPERTY_, String(chunks.length));
  return safe;
}

function readTeamAgendaCache_() {
  const props = PropertiesService.getScriptProperties();
  const count = Math.min(70, Math.max(0, Number(props.getProperty(TEAM_AGENDA_CACHE_COUNT_PROPERTY_) || 0)));
  if (!count) return [];
  const serialized = Array.from({ length:count }, (_, index) => String(props.getProperty(`${TEAM_AGENDA_CACHE_PREFIX_}${index}`) || '')).join('');
  try {
    const records = JSON.parse(serialized);
    return Array.isArray(records) ? records.map(safeTeamAgendaRecord_).filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function refreshTeamAgendaCache_(agenda, history, contracts) {
  const combined = new Map();
  [agenda || [], history || [], contracts || []].forEach(group => group.forEach(record => {
    const safe = safeTeamAgendaRecord_(record);
    if (safe) combined.set(teamAgendaCacheKey_(safe), safe);
  }));
  return writeTeamAgendaCache_(Array.from(combined.values()));
}

function upsertTeamAgendaCacheRecord_(record) {
  const safe = safeTeamAgendaRecord_(record);
  const key = teamAgendaCacheKey_(safe || record || {});
  const next = readTeamAgendaCache_().filter(item => teamAgendaCacheKey_(item) !== key);
  if (safe) next.push(safe);
  return writeTeamAgendaCache_(next);
}

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
  const emails = setAgendaOnlyViewerEmails_(previousEmails.concat([email]));
  const props = PropertiesService.getScriptProperties();
  props.setProperty(AGENDA_ONLY_ACCESS_ENABLED_PROPERTY_, 'true');
  // Calendar puede imponer un límite temporal. Eso no debe impedir que la
  // cuenta autorizada abra el panel seguro.
  try {
    removeLegacyPrivateDataAccess_(email);
  } catch (error) {
    props.setProperty('TEAM_ACCESS_CLEANUP_WARNING', String(error.message || error).slice(0, 500));
  }
  return { emails };
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
  const viewers = listObjects_('Usuarios')
    .filter(user => String(user.role || APP_CONFIG.ROLE_VIEWER) === APP_CONFIG.ROLE_VIEWER)
    .filter(user => isActiveUserValue_(user.active))
    .map(user => String(user.email || '').trim().toLowerCase())
    .filter(Boolean);
  if (String(props.getProperty(AGENDA_ONLY_MIGRATION_PROPERTY_) || '') === 'true') {
    // Repara una alta que quedó a medias por un límite temporal de Calendar.
    // El panel seguro se guía por las cuentas activas, no por invitaciones.
    setAgendaOnlyViewerEmails_(viewers);
    props.setProperty(AGENDA_ONLY_ACCESS_ENABLED_PROPERTY_, 'true');
    return { migrated: false, viewers: viewers.length };
  }
  setAgendaOnlyViewerEmails_(viewers);
  props.setProperty(AGENDA_ONLY_ACCESS_ENABLED_PROPERTY_, 'true');
  props.setProperty(AGENDA_ONLY_MIGRATION_PROPERTY_, 'true');
  const cleanupErrors = [];
  viewers.forEach(email => {
    try { removeLegacyPrivateDataAccess_(email); }
    catch (error) { cleanupErrors.push(`${email}: ${String(error.message || error)}`); }
  });
  if (cleanupErrors.length) props.setProperty('TEAM_ACCESS_CLEANUP_WARNING', cleanupErrors.join(' | ').slice(0, 500));
  try { audit_('MIGRAR_ACCESO_SOLO_AGENDA', 'Sistema', 'equipo', { viewers: viewers.length }); }
  catch (ignored) {}
  return { migrated: true, viewers: viewers.length };
}
