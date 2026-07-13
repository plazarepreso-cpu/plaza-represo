function nowIso_() {
  return Utilities.formatDate(new Date(), APP_CONFIG.TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

function todayIso_() {
  return Utilities.formatDate(new Date(), APP_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
}

function parseLocalDate_(dateText, timeText) {
  const parts = String(dateText).split('-').map(Number);
  const time = String(timeText || '00:00').split(':').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], time[0], time[1] || 0, 0, 0);
}

function eventDayName_(dateText) {
  const names = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return names[parseLocalDate_(dateText, '12:00').getDay()];
}

function defaultRateForDate_(dateText) {
  const day = parseLocalDate_(dateText, '12:00').getDay();
  return day === 0 || day === 6
    ? Number(getSetting_('WEEKEND_RATE', APP_CONFIG.WEEKEND_RATE))
    : Number(getSetting_('WEEKDAY_RATE', APP_CONFIG.WEEKDAY_RATE));
}

function eventDurationMinutes_(startTime, endTime) {
  const start = String(startTime).split(':').map(Number);
  const end = String(endTime).split(':').map(Number);
  let startMinutes = start[0] * 60 + start[1];
  let endMinutes = end[0] * 60 + end[1];
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return endMinutes - startMinutes;
}

function validateContractPayload_(payload, excludingId) {
  const required = ['elaborationDate', 'eventDate', 'startTime', 'endTime', 'eventType', 'clientName', 'address', 'phone'];
  required.forEach(field => {
    if (!String(payload[field] || '').trim()) throw new Error(`Falta el campo ${field}.`);
  });
  if (payload.eventDate < payload.elaborationDate) throw new Error('La fecha del evento no puede ser anterior a la elaboración.');
  const expectedMinutes = Number(getSetting_('EVENT_HOURS', APP_CONFIG.EVENT_HOURS)) * 60;
  if (eventDurationMinutes_(payload.startTime, payload.endTime) !== expectedMinutes) {
    throw new Error(`El horario debe cubrir exactamente ${expectedMinutes / 60} horas.`);
  }
  const calculatedRate = defaultRateForDate_(payload.eventDate);
  const total = Number(payload.total || calculatedRate);
  const initialDeposit = Number(payload.initialDeposit || 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('El pago total debe ser mayor que cero.');
  if (!Number.isFinite(initialDeposit) || initialDeposit < 0 || initialDeposit > total) {
    throw new Error('El abono inicial debe estar entre cero y el pago total.');
  }
  if (total !== calculatedRate && !String(payload.overrideReason || '').trim()) {
    throw new Error('Explica por qué el total es diferente de la tarifa automática.');
  }
  const occupied = listObjects_('Contratos').some(contract =>
    contract.id !== excludingId && contract.eventDate === payload.eventDate && contract.status !== 'CANCELADO'
  );
  if (occupied) throw new Error('La fecha seleccionada ya está ocupada por otro contrato.');
  return { total, initialDeposit, calculatedRate };
}

function nextContractNumber_() {
  const next = Number(getSetting_('NEXT_CONTRACT_NUMBER', APP_CONFIG.START_CONTRACT_NUMBER));
  setSetting_('NEXT_CONTRACT_NUMBER', next + 1);
  return `C.${String(next).padStart(4, '0')}`;
}

function money_(value) {
  return `$${Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeFileName_(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _.-]/g, '')
    .trim().replace(/\s+/g, ' ')
    .slice(0, 80);
}
