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

assert.strictEqual(context.defaultRateForDate_('2026-08-03'), 3500, 'lunes usa tarifa entre semana');
assert.strictEqual(context.defaultRateForDate_('2026-08-01'), 4500, 'sábado usa tarifa de fin de semana');
assert.strictEqual(context.defaultRateForDate_('2026-08-02'), 4500, 'domingo usa tarifa de fin de semana');
assert.strictEqual(context.eventDurationMinutes_('18:00', '23:00'), 300, 'evento vespertino dura 5 horas');
assert.strictEqual(context.eventDurationMinutes_('19:00', '00:00'), 300, 'evento que cruza medianoche dura 5 horas');

const valid = {
  elaborationDate: '2026-07-13', eventDate: '2026-08-03', startTime: '18:00', endTime: '23:00',
  eventType: 'Evento ficticio', clientName: 'Cliente Ejemplo', address: 'Domicilio ficticio', phone: '0000000000',
  total: 3500, initialDeposit: 1750, overrideReason: ''
};
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.validateContractPayload_(valid, ''))), {
  total: 3500, initialDeposit: 1750, calculatedRate: 3500
});

assert.throws(() => context.validateContractPayload_({ ...valid, endTime: '22:00' }, ''), /exactamente 5 horas/);
assert.throws(() => context.validateContractPayload_({ ...valid, total: 3000 }, ''), /Explica por qué/);
assert.throws(() => context.validateContractPayload_({ ...valid, initialDeposit: 4000 }, ''), /abono inicial/);

contracts = [{ id: 'existing', eventDate: '2026-08-03', status: 'CONFIRMADO' }];
assert.throws(() => context.validateContractPayload_(valid, ''), /fecha seleccionada ya está ocupada/);
assert.doesNotThrow(() => context.validateContractPayload_(valid, 'existing'));

contracts = [{ id: 'cancelled', eventDate: '2026-08-03', status: 'CANCELADO' }];
assert.doesNotThrow(() => context.validateContractPayload_(valid, ''));

assert.strictEqual(context.nextContractNumber_(), 'C.2625');
assert.strictEqual(settings.NEXT_CONTRACT_NUMBER, 2626);

console.log('10 reglas del negocio verificadas correctamente.');

