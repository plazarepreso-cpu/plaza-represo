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

