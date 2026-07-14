const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const settings = {
  WEEKDAY_RATE: 3500,
  WEEKEND_RATE: 4500,
  EVENT_HOURS: 5,
  NEXT_CONTRACT_NUMBER: 2625
};
let contracts = [];

const context = vm.createContext({
  console,
  APP_CONFIG: {
    TIME_ZONE: 'America/Hermosillo',
    START_CONTRACT_NUMBER: 2625,
    WEEKDAY_RATE: 3500,
    WEEKEND_RATE: 4500,
    EVENT_HOURS: 5
  },
  getSetting_: (key, fallback) => settings[key] ?? fallback,
  setSetting_: (key, value) => { settings[key] = value; },
  listObjects_: sheet => sheet === 'Contratos' ? contracts : [],
  Utilities: {
    formatDate: date => date.toISOString(),
  }
});

vm.runInContext(fs.readFileSync('src/Domain.gs', 'utf8'), context);

let passed = 0;
function test(name, callback) {
  try {
    callback();
    passed += 1;
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const valid = {
  elaborationDate: '2026-07-13', eventDate: '2026-08-03', startTime: '18:00', endTime: '23:00',
  eventType: 'Evento ficticio', clientName: 'Cliente Ejemplo', address: 'Domicilio ficticio', phone: '0000000000',
  total: 3500, initialDeposit: 1750, overrideReason: ''
};

function validateContract(overrides = {}, excludingId = '') {
  contracts = [];
  return context.validateContractPayload_({ ...valid, ...overrides }, excludingId);
}

test('lunes usa tarifa entre semana', () => {
  assert.strictEqual(context.defaultRateForDate_('2026-08-03'), 3500);
});
test('sábado usa tarifa de fin de semana', () => {
  assert.strictEqual(context.defaultRateForDate_('2026-08-01'), 4500);
});
test('domingo usa tarifa de fin de semana', () => {
  assert.strictEqual(context.defaultRateForDate_('2026-08-02'), 4500);
});
test('evento vespertino dura 5 horas', () => {
  assert.strictEqual(context.eventDurationMinutes_('18:00', '23:00'), 300);
});
test('evento que cruza medianoche dura 5 horas', () => {
  assert.strictEqual(context.eventDurationMinutes_('19:00', '00:00'), 300);
});

test('fecha ISO bisiesta válida conserva ida y vuelta', () => {
  assert.strictEqual(context.isValidIsoDate_('2028-02-29'), true);
});
test('fecha ISO no acepta día inexistente de febrero', () => {
  assert.strictEqual(context.isValidIsoDate_('2026-02-29'), false);
});
test('fecha ISO no acepta desbordamiento de mes', () => {
  assert.strictEqual(context.isValidIsoDate_('2026-04-31'), false);
});
test('fecha ISO exige ceros a la izquierda', () => {
  assert.strictEqual(context.isValidIsoDate_('2026-8-03'), false);
});
test('hora acepta el inicio del día', () => {
  assert.strictEqual(context.isValidTime_('00:00'), true);
});
test('hora acepta el último minuto del día', () => {
  assert.strictEqual(context.isValidTime_('23:59'), true);
});
test('hora rechaza 24:00', () => {
  assert.strictEqual(context.isValidTime_('24:00'), false);
});
test('hora exige dos dígitos', () => {
  assert.strictEqual(context.isValidTime_('7:00'), false);
});
test('hora rechaza minutos fuera de rango', () => {
  assert.strictEqual(context.isValidTime_('12:60'), false);
});
test('duración rechaza horarios inválidos', () => {
  assert.throws(() => context.eventDurationMinutes_('18:00', '24:00'), /horas válidas/);
});

test('dinero elimina residuos binarios', () => {
  assert.strictEqual(context.roundMoney_(0.1 + 0.2), 0.3);
});
test('dinero redondea a centavos', () => {
  assert.strictEqual(context.roundMoney_(1.005), 1.01);
});
test('dinero redondea correctamente importes con representación binaria baja', () => {
  assert.strictEqual(context.roundMoney_(10.075), 10.08);
});
test('dinero rechaza valores no finitos', () => {
  assert.throws(() => context.roundMoney_(Infinity), /finito/);
});
test('teléfono se normaliza a signo y dígitos', () => {
  assert.strictEqual(context.normalizePhone_('+52 (631) 000-0000'), '+526310000000');
});
test('teléfono rechaza menos de siete dígitos', () => {
  assert.throws(() => context.normalizePhone_('000-000'), /entre 7 y 15/);
});
test('teléfono rechaza caracteres alfabéticos', () => {
  assert.throws(() => context.normalizePhone_('631-000-ABCD'), /no permitidos/);
});
test('teléfono rechaza más de quince dígitos', () => {
  assert.throws(() => context.normalizePhone_('0'.repeat(16)), /entre 7 y 15/);
});

test('contrato válido conserva importes', () => {
  assert.deepStrictEqual(plain(validateContract()), {
    total: 3500, initialDeposit: 1750, calculatedRate: 3500
  });
});
test('total ausente usa tarifa automática', () => {
  const withoutTotal = { ...valid };
  delete withoutTotal.total;
  contracts = [];
  assert.strictEqual(context.validateContractPayload_(withoutTotal, '').total, 3500);
});
test('total explícito en cero no usa tarifa automática', () => {
  assert.throws(() => validateContract({ total: 0 }), /pago total debe ser mayor que cero/);
});
test('total NaN es rechazado', () => {
  assert.throws(() => validateContract({ total: NaN }), /número finito/);
});
test('total infinito es rechazado', () => {
  assert.throws(() => validateContract({ total: Infinity }), /número finito/);
});
test('abono NaN es rechazado', () => {
  assert.throws(() => validateContract({ initialDeposit: NaN }), /número finito/);
});
test('abono infinito es rechazado', () => {
  assert.throws(() => validateContract({ initialDeposit: Infinity }), /número finito/);
});
test('abono negativo menor a un centavo no se convierte en cero', () => {
  assert.throws(() => validateContract({ initialDeposit: -0.004 }), /entre cero/);
});
test('total se normaliza antes de comparar la tarifa', () => {
  assert.strictEqual(validateContract({ total: 3500.004 }).total, 3500);
});
test('abono inicial se normaliza a centavos', () => {
  assert.strictEqual(validateContract({ initialDeposit: 1750.005 }).initialDeposit, 1750.01);
});
test('no se impone un anticipo mínimo de 50 por ciento', () => {
  assert.strictEqual(validateContract({ initialDeposit: 1 }).initialDeposit, 1);
});
test('se permite un anticipo superior al 50 por ciento', () => {
  assert.strictEqual(validateContract({ initialDeposit: 3499.99 }).initialDeposit, 3499.99);
});
test('horario debe cubrir exactamente 5 horas', () => {
  assert.throws(() => validateContract({ endTime: '22:00' }), /exactamente 5 horas/);
});
test('tarifa distinta requiere explicación', () => {
  assert.throws(() => validateContract({ total: 3000 }), /Explica por qué/);
});
test('abono inicial no puede superar el total', () => {
  assert.throws(() => validateContract({ initialDeposit: 4000 }), /abono inicial/);
});
test('fecha de elaboración debe ser real', () => {
  assert.throws(() => validateContract({ elaborationDate: '2026-02-30' }), /fecha de elaboración/);
});
test('fecha del evento debe ser real', () => {
  assert.throws(() => validateContract({ eventDate: '2026-02-30' }), /fecha del evento/);
});
test('evento no puede ser anterior a la elaboración', () => {
  assert.throws(() => validateContract({ eventDate: '2026-07-12' }), /anterior a la elaboración/);
});
test('hora de inicio debe ser válida', () => {
  assert.throws(() => validateContract({ startTime: '24:00' }), /horario.*válidas/);
});
test('hora de término debe ser válida', () => {
  assert.throws(() => validateContract({ endTime: '23:60' }), /horario.*válidas/);
});
test('nombre de cliente respeta límite', () => {
  assert.throws(() => validateContract({ clientName: 'N'.repeat(121) }), /nombre.*120/);
});
test('tipo de evento respeta límite', () => {
  assert.throws(() => validateContract({ eventType: 'E'.repeat(121) }), /tipo de evento.*120/);
});
test('domicilio respeta límite', () => {
  assert.throws(() => validateContract({ address: 'D'.repeat(301) }), /domicilio.*300/);
});
test('motivo de tarifa especial respeta límite', () => {
  assert.throws(() => validateContract({ overrideReason: 'M'.repeat(301) }), /motivo.*300/);
});

test('fecha ocupada por contrato activo se conserva bloqueada', () => {
  contracts = [{ id: 'existing', eventDate: '2026-08-03', status: 'CONFIRMADO' }];
  assert.throws(() => context.validateContractPayload_(valid, ''), /fecha seleccionada ya está ocupada/);
});
test('edición excluye el propio contrato de la ocupación', () => {
  contracts = [{ id: 'existing', eventDate: '2026-08-03', status: 'CONFIRMADO' }];
  assert.doesNotThrow(() => context.validateContractPayload_(valid, 'existing'));
});
test('contrato cancelado libera la fecha', () => {
  contracts = [{ id: 'cancelled', eventDate: '2026-08-03', status: 'CANCELADO' }];
  assert.doesNotThrow(() => context.validateContractPayload_(valid, ''));
});

const confirmedContract = { id: 'contrato-ficticio', status: 'CONFIRMADO', balance: 100 };
test('pago confirmado devuelve fecha e importe normalizados', () => {
  assert.deepStrictEqual(plain(context.validatePaymentPayload_(
    { date: '2026-07-13', amount: 0.1 + 0.2 }, confirmedContract
  )), { date: '2026-07-13', amount: 0.3 });
});
test('estado PAGADO pertenece a los estados permitidos', () => {
  assert.doesNotThrow(() => context.validatePaymentPayload_(
    { date: '2026-07-13', amount: 1 }, { status: 'PAGADO', balance: 1 }
  ));
});
test('estado CANCELADO no acepta pagos', () => {
  assert.throws(() => context.validatePaymentPayload_(
    { date: '2026-07-13', amount: 1 }, { status: 'CANCELADO', balance: 100 }
  ), /estado actual/);
});
test('estado ERROR no acepta pagos', () => {
  assert.throws(() => context.validatePaymentPayload_(
    { date: '2026-07-13', amount: 1 }, { status: 'ERROR', balance: 100 }
  ), /estado actual/);
});
test('estado GENERANDO no acepta pagos', () => {
  assert.throws(() => context.validatePaymentPayload_(
    { date: '2026-07-13', amount: 1 }, { status: 'GENERANDO', balance: 100 }
  ), /estado actual/);
});
test('pago exige fecha', () => {
  assert.throws(() => context.validatePaymentPayload_({ amount: 1 }, confirmedContract), /fecha del pago/);
});
test('pago rechaza fecha inexistente', () => {
  assert.throws(() => context.validatePaymentPayload_(
    { date: '2026-02-30', amount: 1 }, confirmedContract
  ), /fecha del pago/);
});
test('pago rechaza monto cero', () => {
  assert.throws(() => context.validatePaymentPayload_(
    { date: '2026-07-13', amount: 0 }, confirmedContract
  ), /mayor que cero/);
});
test('pago rechaza monto negativo', () => {
  assert.throws(() => context.validatePaymentPayload_(
    { date: '2026-07-13', amount: -1 }, confirmedContract
  ), /mayor que cero/);
});
test('pago rechaza monto NaN', () => {
  assert.throws(() => context.validatePaymentPayload_(
    { date: '2026-07-13', amount: NaN }, confirmedContract
  ), /número finito/);
});
test('pago rechaza monto infinito', () => {
  assert.throws(() => context.validatePaymentPayload_(
    { date: '2026-07-13', amount: Infinity }, confirmedContract
  ), /número finito/);
});
test('pago no puede superar el saldo', () => {
  assert.throws(() => context.validatePaymentPayload_(
    { date: '2026-07-13', amount: 100.01 }, confirmedContract
  ), /exceder el saldo/);
});
test('pago compara monto y saldo ya normalizados', () => {
  assert.strictEqual(context.validatePaymentPayload_(
    { date: '2026-07-13', amount: 100.004 }, confirmedContract
  ).amount, 100);
});
test('pago rechaza saldo no finito', () => {
  assert.throws(() => context.validatePaymentPayload_(
    { date: '2026-07-13', amount: 1 }, { status: 'CONFIRMADO', balance: Infinity }
  ), /saldo.*no es válido/);
});
test('pago rechaza saldo negativo menor a un centavo', () => {
  assert.throws(() => context.validatePaymentPayload_(
    { date: '2026-07-13', amount: 0.01 }, { status: 'CONFIRMADO', balance: -0.004 }
  ), /saldo.*no es válido/);
});

let generatedContractNumber;
test('siguiente número de contrato usa el consecutivo', () => {
  generatedContractNumber = context.nextContractNumber_();
  assert.strictEqual(generatedContractNumber, 'C.2625');
});
test('siguiente número incrementa la configuración', () => {
  assert.strictEqual(settings.NEXT_CONTRACT_NUMBER, 2626);
});

console.log(`${passed} casos de dominio verificados correctamente.`);
