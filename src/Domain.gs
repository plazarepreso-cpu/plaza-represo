function nowIso_() {
  return Utilities.formatDate(new Date(), APP_CONFIG.TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

function todayIso_() {
  return Utilities.formatDate(new Date(), APP_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
}

const DOMAIN_LIMITS_ = Object.freeze({
  CLIENT_NAME: 120,
  EVENT_TYPE: 120,
  NOTES: 300,
  ADDRESS: 300,
  OVERRIDE_REASON: 300,
  PHONE_DISPLAY: 25,
  PHONE_DIGITS_MIN: 7,
  PHONE_DIGITS_MAX: 15
});

/**
 * Valida una fecha civil escrita exactamente como YYYY-MM-DD.
 * La comparación de ida y vuelta evita aceptar fechas desbordadas como 2026-02-30.
 */
function isValidIsoDate_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split('-').map(Number);
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
  return parsed.getUTCFullYear() === parts[0]
    && parsed.getUTCMonth() === parts[1] - 1
    && parsed.getUTCDate() === parts[2];
}

/** Valida una hora de 24 horas escrita exactamente como HH:mm. */
function isValidTime_(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Normaliza un importe finito a centavos y elimina el valor especial -0. */
function roundMoney_(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error('El importe debe ser un número finito.');
  const sign = amount < 0 ? -1 : 1;
  const scaled = Math.abs(amount) * 100;
  const rounded = sign * Math.round(scaled + Number.EPSILON * scaled) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Valida un teléfono legible y devuelve su forma canónica: signo + opcional y dígitos.
 */
function normalizePhone_(value) {
  const phone = String(value === undefined || value === null ? '' : value).trim();
  if (!phone) throw new Error('Falta el campo phone.');
  if (phone.length > DOMAIN_LIMITS_.PHONE_DISPLAY) {
    throw new Error(`El teléfono no puede exceder ${DOMAIN_LIMITS_.PHONE_DISPLAY} caracteres.`);
  }
  if (!/^\+?[0-9().\s-]+$/.test(phone)) {
    throw new Error('El teléfono contiene caracteres no permitidos.');
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length < DOMAIN_LIMITS_.PHONE_DIGITS_MIN || digits.length > DOMAIN_LIMITS_.PHONE_DIGITS_MAX) {
    throw new Error(`El teléfono debe contener entre ${DOMAIN_LIMITS_.PHONE_DIGITS_MIN} y ${DOMAIN_LIMITS_.PHONE_DIGITS_MAX} dígitos.`);
  }
  return `${phone.startsWith('+') ? '+' : ''}${digits}`;
}

function parseLocalDate_(dateText, timeText) {
  const date = String(dateText);
  const localTime = timeText === undefined || timeText === null || timeText === '' ? '00:00' : String(timeText);
  if (!isValidIsoDate_(date)) throw new Error('La fecha debe usar el formato YYYY-MM-DD y ser válida.');
  if (!isValidTime_(localTime)) throw new Error('La hora debe usar el formato HH:mm y ser válida.');
  const parts = date.split('-').map(Number);
  const time = localTime.split(':').map(Number);
  const parsed = new Date(0);
  parsed.setFullYear(parts[0], parts[1] - 1, parts[2]);
  parsed.setHours(time[0], time[1], 0, 0);
  return parsed;
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
  const startText = String(startTime);
  const endText = String(endTime);
  if (!isValidTime_(startText) || !isValidTime_(endText)) {
    throw new Error('El horario debe usar horas válidas en formato HH:mm.');
  }
  const start = startText.split(':').map(Number);
  const end = endText.split(':').map(Number);
  let startMinutes = start[0] * 60 + start[1];
  let endMinutes = end[0] * 60 + end[1];
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return endMinutes - startMinutes;
}

function validateContractPayload_(payload, excludingId) {
  const data = payload || {};
  const required = ['elaborationDate', 'eventDate', 'startTime', 'endTime', 'eventType', 'clientName', 'address', 'phone'];
  required.forEach(field => {
    if (!String(data[field] || '').trim()) throw new Error(`Falta el campo ${field}.`);
  });

  const textLimits = [
    ['clientName', 'El nombre del cliente', DOMAIN_LIMITS_.CLIENT_NAME],
    ['eventType', 'El tipo de evento', DOMAIN_LIMITS_.EVENT_TYPE],
    ['notes', 'La nota', DOMAIN_LIMITS_.NOTES],
    ['address', 'El domicilio', DOMAIN_LIMITS_.ADDRESS]
  ];
  textLimits.forEach(item => {
    if (String(data[item[0]]).trim().length > item[2]) {
      throw new Error(`${item[1]} no puede exceder ${item[2]} caracteres.`);
    }
  });
  normalizePhone_(data.phone);

  const overrideReason = String(data.overrideReason || '').trim();
  if (overrideReason.length > DOMAIN_LIMITS_.OVERRIDE_REASON) {
    throw new Error(`El motivo de tarifa especial no puede exceder ${DOMAIN_LIMITS_.OVERRIDE_REASON} caracteres.`);
  }
  if (!isValidIsoDate_(String(data.elaborationDate))) {
    throw new Error('La fecha de elaboración debe usar el formato YYYY-MM-DD y ser válida.');
  }
  if (!isValidIsoDate_(String(data.eventDate))) {
    throw new Error('La fecha del evento debe usar el formato YYYY-MM-DD y ser válida.');
  }
  if (!isValidTime_(String(data.startTime)) || !isValidTime_(String(data.endTime))) {
    throw new Error('El horario debe usar horas válidas en formato HH:mm.');
  }
  if (data.eventDate < data.elaborationDate) throw new Error('La fecha del evento no puede ser anterior a la elaboración.');

  const expectedMinutes = Number(getSetting_('EVENT_HOURS', APP_CONFIG.EVENT_HOURS)) * 60;
  if (!Number.isFinite(expectedMinutes) || expectedMinutes <= 0) {
    throw new Error('La duración configurada para los eventos no es válida.');
  }
  if (eventDurationMinutes_(data.startTime, data.endTime) !== expectedMinutes) {
    throw new Error(`El horario debe cubrir exactamente ${expectedMinutes / 60} horas.`);
  }

  const rawCalculatedRate = defaultRateForDate_(data.eventDate);
  if (!Number.isFinite(rawCalculatedRate) || rawCalculatedRate <= 0) {
    throw new Error('La tarifa automática configurada no es válida.');
  }
  const calculatedRate = roundMoney_(rawCalculatedRate);
  const hasTotal = Object.prototype.hasOwnProperty.call(data, 'total')
    && data.total !== undefined
    && data.total !== null
    && !(typeof data.total === 'string' && data.total.trim() === '');
  const rawTotal = hasTotal ? data.total : calculatedRate;
  if (!['number', 'string'].includes(typeof rawTotal) || !Number.isFinite(Number(rawTotal))) {
    throw new Error('El pago total debe ser un número finito mayor que cero.');
  }
  const total = roundMoney_(rawTotal);
  if (total <= 0) throw new Error('El pago total debe ser mayor que cero.');

  const depositIsAbsent = data.initialDeposit === undefined
    || data.initialDeposit === null
    || (typeof data.initialDeposit === 'string' && data.initialDeposit.trim() === '');
  const rawInitialDeposit = depositIsAbsent ? 0 : data.initialDeposit;
  if (!['number', 'string'].includes(typeof rawInitialDeposit) || !Number.isFinite(Number(rawInitialDeposit))) {
    throw new Error('El abono inicial debe ser un número finito.');
  }
  if (Number(rawInitialDeposit) < 0) {
    throw new Error('El abono inicial debe estar entre cero y el pago total.');
  }
  const initialDeposit = roundMoney_(rawInitialDeposit);
  if (initialDeposit < 0 || initialDeposit > total) {
    throw new Error('El abono inicial debe estar entre cero y el pago total.');
  }
  if (total !== calculatedRate && !overrideReason) {
    throw new Error('Explica por qué el total es diferente de la tarifa automática.');
  }
  const occupied = listObjects_('Contratos').some(contract =>
    contract.id !== excludingId && contract.eventDate === data.eventDate && contract.status !== 'CANCELADO'
  );
  if (occupied) throw new Error('La fecha seleccionada ya está ocupada por otro contrato.');
  return { total, initialDeposit, calculatedRate };
}

/**
 * Valida y normaliza los datos monetarios mínimos para registrar un pago.
 * Devuelve fecha e importe listos para persistirse, ambos sin valores implícitos.
 */
function validatePaymentPayload_(payload, contract) {
  const data = payload || {};
  const currentContract = contract || {};
  if (!['CONFIRMADO', 'PAGADO'].includes(currentContract.status)) {
    throw new Error('Este contrato no acepta pagos en su estado actual.');
  }
  if (!isValidIsoDate_(data.date)) {
    throw new Error('La fecha del pago debe usar el formato YYYY-MM-DD y ser válida.');
  }
  if (!['number', 'string'].includes(typeof data.amount) || !Number.isFinite(Number(data.amount))) {
    throw new Error('El abono debe ser un número finito mayor que cero.');
  }
  if (!['number', 'string'].includes(typeof currentContract.balance) || !Number.isFinite(Number(currentContract.balance))) {
    throw new Error('El saldo del contrato no es válido.');
  }
  if (Number(currentContract.balance) < 0) throw new Error('El saldo del contrato no es válido.');
  const amount = roundMoney_(data.amount);
  const balance = roundMoney_(currentContract.balance);
  if (amount <= 0) throw new Error('El abono debe ser mayor que cero.');
  if (amount > balance) throw new Error('El abono no puede exceder el saldo restante.');
  return { date: data.date, amount };
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
