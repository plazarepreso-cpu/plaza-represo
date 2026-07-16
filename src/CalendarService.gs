function eventDates_(contract) {
  const start = parseLocalDate_(contract.eventDate, contract.startTime);
  const end = parseLocalDate_(contract.eventDate, contract.endTime);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

function calendarDescription_(contract) {
  const pdfUrl = contract.currentPdfFileId
    ? `https://drive.google.com/open?id=${contract.currentPdfFileId}`
    : 'PDF en proceso';
  return [
    `Contrato: ${contract.contractNumber}`,
    `Cliente: ${contract.clientName}`,
    `Teléfono: ${contract.phone}`,
    `Tipo: ${contract.eventType}`,
    `Notas: ${String(contract.notes || '').trim() || 'Sin indicaciones adicionales.'}`,
    `Pago total: ${money_(contract.total)}`,
    `Pagado: ${money_(contract.paid)}`,
    `Saldo: ${money_(contract.balance)}`,
    `Contrato: ${pdfUrl}`,
    '',
    'Acceso para decoración: 4 horas antes del evento.'
  ].join('\n');
}

function calendarTitle_(contract) {
  return `${contract.contractNumber} | ${contract.clientName} | ${contract.eventType}`;
}

function addDefaultReminders_(event) {
  event.removeAllReminders();
  const start = event.getStartTime();
  const minutesUntil = Math.floor((start.getTime() - Date.now()) / 60000);
  [
    Number(getSetting_('REMINDER_PAYMENT_MINUTES', 10080)),
    Number(getSetting_('REMINDER_DAY_MINUTES', 1440)),
    Number(getSetting_('REMINDER_PREP_MINUTES', 240))
  ].forEach(minutes => {
    if (minutesUntil > minutes && minutes >= 5 && minutes <= 40320) event.addPopupReminder(minutes);
  });
}

function getCalendar_() {
  const id = PropertiesService.getScriptProperties().getProperty('CALENDAR_ID');
  const calendar = id ? CalendarApp.getCalendarById(id) : null;
  if (!calendar) throw new Error('No se encontró el calendario de Plaza Represo.');
  return calendar;
}

function calendarTextField_(description, label) {
  const escaped = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stops = 'Título|Fecha|Hora\\s*inicio|Hora\\s*fin|Ubicación|Cliente|Teléfono|Domicilio|Contrato|Notas|Tipo(?:\\s+de\\s+evento)?|Saldo(?:\\s+pendiente)?';
  const match = String(description || '').match(new RegExp(`(?:^|\\s)${escaped}\\s*:\\s*(.+?)(?=\\s+(?:${stops})\\s*:|$)`, 'i'));
  return match ? match[1].trim() : '';
}

function calendarContractNumber_(text) {
  const match = String(text || '').match(/\bC(?:ONTRATO)?[\s.#:-]*(\d{3,5})\b/i);
  return match ? `C.${String(match[1]).padStart(4, '0')}` : '';
}

function formatClockMinutes_(minutes) {
  const normalized = ((Number(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function legacyHoursFromText_(text) {
  const source = String(text || '');
  const labeled = source.match(/Hora\s*inicio\s*:\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?[\s\S]*?Hora\s*fin\s*:\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?/i);
  if (labeled) {
    const toMinutes = (hourText, minuteText, meridiem) => {
      let hour = Number(hourText) % 12;
      if (String(meridiem).toLowerCase() === 'p') hour += 12;
      return hour * 60 + Number(minuteText || 0);
    };
    return {
      startTime:formatClockMinutes_(toMinutes(labeled[1], labeled[2], labeled[3])),
      endTime:formatClockMinutes_(toMinutes(labeled[4], labeled[5], labeled[6]))
    };
  }
  const match = source.match(/(?:^|\s)(\d{1,2})(?::(\d{2}))?\s*(?:a|-)\s*(\d{1,2})(?::(\d{2}))?(?:\s*(?:a\.?m\.?|p\.?m\.?))?/i)
    || source.match(/(?:^|\s)(\d{1,2}):(\d{2})\s+(\d{1,2}):(\d{2})(?:\s|$)/i);
  if (!match) return null;
  const startHour = Number(match[1]);
  const startMinute = Number(match[2] || 0);
  const endHour = Number(match[3]);
  const endMinute = Number(match[4] || 0);
  if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return null;

  const hourCandidates = hour => {
    if (hour === 0 || hour > 12) return [hour];
    if (hour === 12) return [12, 0];
    return [hour + 12, hour];
  };
  const expectedDuration = Number(APP_CONFIG.EVENT_HOURS || 5) * 60;
  const options = [];
  hourCandidates(startHour).forEach(candidateStartHour => {
    hourCandidates(endHour).forEach(candidateEndHour => {
      const start = candidateStartHour * 60 + startMinute;
      const end = candidateEndHour * 60 + endMinute;
      const duration = (end - start + 1440) % 1440;
      if (duration === expectedDuration) options.push({ start, end });
    });
  });
  if (!options.length) return null;
  options.sort((a, b) => {
    const aPreferred = a.start >= 12 * 60 ? 0 : 1;
    const bPreferred = b.start >= 12 * 60 ? 0 : 1;
    return aPreferred - bPreferred || a.start - b.start;
  });
  return { startTime:formatClockMinutes_(options[0].start), endTime:formatClockMinutes_(options[0].end) };
}

function legacyMoneyFromText_(text, eventDate) {
  const source = String(text || '').replace(/\$/g, ' ');
  const amount = pattern => {
    const match = source.match(pattern);
    if (!match) return null;
    const value = Number(String(match[1]).replace(/[,\s]/g, ''));
    return Number.isFinite(value) && value >= 0 && value <= 10000 ? value : null;
  };
  const amountPattern = '(\\d{1,4}(?:[,\\s]\\d{3})?(?:\\.\\d{1,2})?)';
  const paid = amount(new RegExp(`\\b(?:abono|abon[oó]|pag[oó])\\s*(?:de\\s*)?${amountPattern}`, 'i'));
  const statedBalance = amount(new RegExp(`\\b(?:restan?|restante|saldo)\\s*(?:de\\s*)?${amountPattern}`, 'i'));
  const fullyPaid = /\b(?:pago|pagado)\s+todo\b/i.test(source);
  const date = new Date(`${eventDate}T12:00:00`);
  const configuredTotal = Number(date.getDay() === 0 || date.getDay() === 6 ? APP_CONFIG.WEEKEND_RATE : APP_CONFIG.WEEKDAY_RATE);
  let total = paid !== null && statedBalance !== null
    ? paid + statedBalance
    : (fullyPaid && paid !== null ? paid : configuredTotal);
  let normalizedPaid = fullyPaid ? total : paid;
  if (normalizedPaid === null && statedBalance !== null) normalizedPaid = Math.max(0, total - statedBalance);
  if (normalizedPaid === null) normalizedPaid = 0;
  const balance = fullyPaid ? 0 : (statedBalance !== null ? statedBalance : Math.max(0, total - normalizedPaid));
  return { total, paid:normalizedPaid, balance };
}

function isLegacyPlazaEvent_(event) {
  const text = [event.getTitle(), event.getDescription(), event.getLocation()].join('\n');
  return /PLAZA\s*REPRESO/i.test(text)
    || Boolean(calendarContractNumber_(text))
    || /TECNOL[ÓO]GICO[\s\S]*CAHITAS|CAHITAS[\s\S]*TECNOL[ÓO]GICO/i.test(text);
}

function calendarEventToAgenda_(event, calendar, source) {
  const title = String(event.getTitle() || '').trim();
  const description = String(event.getDescription() || '');
  const combined = `${title}\n${description}`;
  const contractNumber = calendarContractNumber_(combined);
  const pipeParts = title.split('|').map(part => part.trim()).filter(Boolean);
  let clientName = calendarTextField_(combined, 'Cliente');
  let eventType = calendarTextField_(combined, 'Tipo') || calendarTextField_(combined, 'Tipo de evento') || calendarTextField_(combined, 'Título');
  const address = calendarTextField_(combined, 'Domicilio');
  const phone = calendarTextField_(combined, 'Teléfono');
  const notes = calendarTextField_(combined, 'Notas');
  if (!clientName && pipeParts.length >= 2 && calendarContractNumber_(pipeParts[0])) clientName = pipeParts[1];
  clientName = clientName.replace(/\s*\(\s*\d[\d\s-]{6,}\s*\)\.?\s*$/, '').trim();
  if (!eventType && pipeParts.length >= 3 && calendarContractNumber_(pipeParts[0])) eventType = pipeParts.slice(2).join(' | ');
  if (!eventType && contractNumber) {
    const titleContract = title.match(/\bC(?:ONTRATO)?[\s.#:-]*\d{3,5}\b/i);
    const suffix = titleContract
      ? title.slice(titleContract.index + titleContract[0].length).replace(/^[\s|—–-]+/, '').trim()
      : '';
    if (suffix && suffix !== clientName) eventType = suffix;
  }
  if (!eventType) eventType = 'Evento de Google Calendar';

  const start = event.getStartTime();
  const end = event.getEndTime();
  const eventDate = Utilities.formatDate(start, APP_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  const legacyHours = source === 'ANTERIOR' ? legacyHoursFromText_(combined) : null;
  const financial = source === 'ANTERIOR'
    ? legacyMoneyFromText_(combined, eventDate)
    : { total:'', paid:'', balance:'' };
  const status = /^\s*CANCELAD[OA]\b/i.test(title) ? 'CANCELADO' : 'CONFIRMADO';
  return {
    id: `${calendar.getId()}::${event.getId()}`,
    calendarId: calendar.getId(),
    calendarName: calendar.getName(),
    source,
    title,
    contractNumber,
    clientName,
    address,
    phone,
    eventType,
    notes,
    eventDate,
    eventDay: eventDayName_(eventDate),
    startTime: legacyHours ? legacyHours.startTime : Utilities.formatDate(start, APP_CONFIG.TIME_ZONE, 'HH:mm'),
    endTime: legacyHours ? legacyHours.endTime : Utilities.formatDate(end, APP_CONFIG.TIME_ZONE, 'HH:mm'),
    total: financial.total,
    paid: financial.paid,
    balance: financial.balance,
    status,
    location: String(event.getLocation() || '').trim(),
    updatedAt: nowIso_()
  };
}

function agendaCalendarCandidates_() {
  const properties = PropertiesService.getScriptProperties();
  const officialId = String(properties.getProperty('CALENDAR_ID') || '').trim();
  const ownerCalendarId = String(properties.getProperty('OWNER_EMAIL') || '').trim().toLowerCase();
  const candidates = [];
  if (officialId) candidates.push({ id: officialId, source: 'SISTEMA' });
  if (ownerCalendarId && ownerCalendarId !== officialId) candidates.push({ id: ownerCalendarId, source: 'ANTERIOR' });
  return candidates;
}

function syncAgendaFromCalendars_() {
  ensureSchema_();
  const start = parseLocalDate_(todayIso_(), '00:00');
  start.setDate(start.getDate() - 180);
  const end = parseLocalDate_(todayIso_(), '23:59');
  end.setDate(end.getDate() + 730);
  const records = [];
  const errors = [];
  let readableCalendars = 0;

  agendaCalendarCandidates_().forEach(candidate => {
    try {
      const calendar = CalendarApp.getCalendarById(candidate.id);
      if (!calendar) throw new Error('Calendario no disponible.');
      readableCalendars += 1;
      calendar.getEvents(start, end).forEach(event => {
        if (candidate.source === 'SISTEMA' || isLegacyPlazaEvent_(event)) {
          records.push(calendarEventToAgenda_(event, calendar, candidate.source));
        }
      });
    } catch (error) {
      errors.push(`${candidate.source}: ${error.message || error}`);
    }
  });

  if (!readableCalendars) throw new Error(`No se pudo leer ningún calendario: ${errors.join(' | ')}`);
  const unique = Array.from(new Map(records.map(record => [record.id, record])).values())
    .sort((a, b) => `${a.eventDate} ${a.startTime}`.localeCompare(`${b.eventDate} ${b.startTime}`));
  replaceObjects_('Agenda', unique);
  // La agenda de equipo se actualiza desde estos mismos registros, pero solo
  // recibe horarios genéricos. Si todavía no se creó, no se fuerza aquí.
  if (typeof getTeamAgendaCalendar_ === 'function' && getTeamAgendaCalendar_()) {
    syncTeamAgendaFromRecords_(unique);
  }
  return { synced: unique.length, calendars: readableCalendars, errors };
}

function syncTeamAgendaAfterCalendarChange_() {
  // La vista interna del equipo se actualiza por caché segura. Evitamos
  // sincronizar en lote Calendar después de cada cambio y alcanzar su límite.
  return null;
}

function syncAgendaNow() {
  requireOwner_();
  const summary = syncAgendaFromCalendars_();
  try { audit_('SINCRONIZAR_AGENDA', 'Sistema', 'Google Calendar', summary); }
  catch (ignored) {}
  return summary;
}

function listAgendaEvents_() {
  try { return listObjects_('Agenda'); }
  catch (error) { return []; }
}

function createCalendarEvent_(contract) {
  const dates = eventDates_(contract);
  const event = getCalendar_().createEvent(calendarTitle_(contract), dates.start, dates.end, {
    description: calendarDescription_(contract),
    location: APP_CONFIG.VENUE_ADDRESS
  });
  addDefaultReminders_(event);
  return event.getId();
}

function updateCalendarEvent_(contract) {
  if (!contract.calendarEventId) return createCalendarEvent_(contract);
  const event = getCalendar_().getEventById(contract.calendarEventId);
  if (!event) return createCalendarEvent_(contract);
  const dates = eventDates_(contract);
  event
    .setTitle(calendarTitle_(contract))
    .setTime(dates.start, dates.end)
    .setDescription(calendarDescription_(contract))
    .setLocation(APP_CONFIG.VENUE_ADDRESS);
  addDefaultReminders_(event);
  return event.getId();
}

function markCalendarEventCancelled_(contract) {
  if (!contract.calendarEventId) return;
  const event = getCalendar_().getEventById(contract.calendarEventId);
  if (!event) return;
  event
    .setTitle(`CANCELADO | ${calendarTitle_(contract)}`)
    .setDescription(`${calendarDescription_(contract)}\n\nCANCELADO: ${contract.cancelReason || 'Sin motivo indicado'}`)
    .removeAllReminders();
}
