const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const state = {
  users: [{ email:'propietaria.ficticia@example.com', role:'PROPIETARIO', active:true }],
  eventGuests: new Set(),
  guestAddCalls: 0,
  guestRemoveCalls: 0,
  privateResourceCalls: 0,
  audits: [],
  lockWaits: [],
  lockReleases: 0,
  schemaChecks: 0,
  failGuestAdd: false,
  properties: {
    OWNER_EMAIL: 'propietaria.ficticia@example.com',
    TEAM_VIEWER_EMAILS: '[]',
    AGENDA_ONLY_ACCESS_ENABLED: 'true'
  }
};

function genericTeamEvent() {
  return {
    addGuest(email) {
      if (state.failGuestAdd) throw new Error('Fallo ficticio al invitar a la agenda');
      state.guestAddCalls += 1;
      state.eventGuests.add(email);
    },
    removeGuest(email) {
      state.guestRemoveCalls += 1;
      state.eventGuests.delete(email);
    }
  };
}

const teamEvents = [genericTeamEvent(), genericTeamEvent()];

const context = vm.createContext({
  APP_CONFIG: { ROLE_OWNER:'PROPIETARIO', ROLE_VIEWER:'CONSULTA' },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: key => state.properties[key] || '',
      setProperty: (key, value) => { state.properties[key] = String(value); }
    })
  },
  // AccessService no debe abrir ni compartir estos recursos. Si en el futuro
  // volviera a intentarlo, la prueba falla antes de exponer datos privados.
  SpreadsheetApp: {
    openById: () => {
      state.privateResourceCalls += 1;
      throw new Error('No se debe abrir la hoja privada para una cuenta de agenda.');
    }
  },
  DriveApp: {
    getFolderById: () => {
      state.privateResourceCalls += 1;
      throw new Error('No se debe abrir Drive para una cuenta de agenda.');
    }
  },
  CalendarApp: {
    getCalendarById: () => {
      state.privateResourceCalls += 1;
      throw new Error('No se debe compartir ningún calendario completo.');
    }
  },
  LockService: {
    getScriptLock: () => ({
      waitLock: milliseconds => state.lockWaits.push(milliseconds),
      releaseLock: () => { state.lockReleases += 1; }
    })
  },
  ensureSchema_: () => { state.schemaChecks += 1; },
  listObjects_: sheetName => {
    assert.strictEqual(sheetName, 'Usuarios');
    return state.users.map(user => ({ ...user }));
  },
  appendObject_: (sheetName, user) => {
    assert.strictEqual(sheetName, 'Usuarios');
    state.users.push({ ...user });
    return user;
  },
  updateObject_: (sheetName, idColumn, id, updates) => {
    assert.strictEqual(sheetName, 'Usuarios');
    assert.strictEqual(idColumn, 'email');
    const user = state.users.find(item => String(item.email) === String(id));
    if (!user) throw new Error('Usuario ficticio no encontrado');
    Object.assign(user, updates);
    return { ...user };
  },
  audit_: (action, entityType, entityId, details) => {
    state.audits.push({ action, entityType, entityId, details:{ ...details } });
  }
});

vm.runInContext(fs.readFileSync('src/Security.gs', 'utf8'), context);
context.requireOwner_ = () => ({ email:'propietaria.ficticia@example.com', role:'PROPIETARIO' });
vm.runInContext(fs.readFileSync('src/AccessService.gs', 'utf8'), context);

// El servicio de equipo se prueba aparte. Aquí simulamos su contrato público:
// la única entrega es invitar al correo como huésped de eventos genéricos,
// nunca compartir el calendario, la hoja o Drive completos.
context.grantAgendaOnlyAccess_ = email => {
  teamEvents.forEach(event => event.addGuest(email));
  const emails = context.setAgendaOnlyViewerEmails_(
    context.listAgendaOnlyViewerEmails_().concat([email])
  );
  state.properties.AGENDA_ONLY_ACCESS_ENABLED = 'true';
  return { emails };
};
context.revokeAgendaOnlyAccess_ = email => {
  teamEvents.forEach(event => event.removeGuest(email));
  const emails = context.setAgendaOnlyViewerEmails_(
    context.listAgendaOnlyViewerEmails_().filter(value => value !== email)
  );
  return { emails };
};

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

function agendaOnlyEmails() {
  return JSON.parse(state.properties.TEAM_VIEWER_EMAILS || '[]');
}

test('normaliza y valida correos antes de habilitar la agenda', () => {
  assert.strictEqual(context.normalizeAccessEmail_(' EMPLEADA.FICTICIA@EXAMPLE.COM '), 'empleada.ficticia@example.com');
  ['', 'sin-arroba', 'persona@localhost', 'persona con espacios@example.com'].forEach(value => {
    assert.throws(() => context.normalizeAccessEmail_(value), /correo electrónico válido/);
  });
});

test('concede agenda al invitar como huésped, sin compartir Sheet, Drive ni Calendar', () => {
  const email = 'empleada.ficticia@example.com';
  const users = context.grantViewerAccess({ email });

  assert.strictEqual(state.schemaChecks, 1);
  assert.strictEqual(state.eventGuests.has(email), true);
  assert.strictEqual(state.guestAddCalls, teamEvents.length);
  assert.strictEqual(state.privateResourceCalls, 0, 'no se debe abrir ni compartir un recurso privado');
  assert.deepStrictEqual(agendaOnlyEmails(), [email]);
  assert.strictEqual(state.properties.AGENDA_ONLY_ACCESS_ENABLED, 'true');
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(users.find(user => user.email === email))),
    { email, role:'CONSULTA', active:true }
  );
  assert.strictEqual(state.audits.at(-1).action, 'CONCEDER_ACCESO');
});

test('retirar acceso quita huéspedes de los eventos y de la lista de autorización', () => {
  const email = 'empleada.ficticia@example.com';
  const users = context.revokeViewerAccess({ email });
  assert.strictEqual(state.eventGuests.has(email), false);
  assert.strictEqual(state.guestRemoveCalls, teamEvents.length);
  assert.strictEqual(state.privateResourceCalls, 0);
  assert.deepStrictEqual(agendaOnlyEmails(), []);
  assert.strictEqual(users.find(user => user.email === email).active, false);
  assert.strictEqual(state.audits.at(-1).action, 'RETIRAR_ACCESO');
});

test('una cuenta inactiva puede restaurarse sin duplicar filas ni abrir recursos privados', () => {
  const email = 'empleada.ficticia@example.com';
  const previousCount = state.users.length;
  context.grantViewerAccess({ email });
  assert.strictEqual(state.users.length, previousCount);
  assert.strictEqual(state.users.find(user => user.email === email).active, true);
  assert.strictEqual(state.eventGuests.has(email), true);
  assert.strictEqual(state.privateResourceCalls, 0);
});

test('la cuenta propietaria no puede retirarse ni degradarse', () => {
  assert.throws(
    () => context.revokeViewerAccess({ email:'propietaria.ficticia@example.com' }),
    /cuenta propietaria/
  );
  assert.throws(
    () => context.grantViewerAccess({ email:'propietaria.ficticia@example.com' }),
    /cuenta propietaria/
  );
});

test('si falla la invitación como huésped, no se autoriza la cuenta', () => {
  const email = 'fallo.ficticio@example.com';
  state.failGuestAdd = true;
  assert.throws(
    () => context.grantViewerAccess({ email }),
    /invitar a la agenda/
  );
  state.failGuestAdd = false;
  assert.strictEqual(state.eventGuests.has(email), false);
  assert.strictEqual(state.privateResourceCalls, 0);
  assert.strictEqual(agendaOnlyEmails().includes(email), false);
  assert.strictEqual(state.users.some(user => user.email === email), false);
});

assert.strictEqual(state.lockWaits.every(value => value === 30000), true);
assert.strictEqual(state.lockWaits.length, state.lockReleases, 'cada operación libera el bloqueo');

console.log(`${passed} casos de administración de acceso por huéspedes de agenda verificados correctamente.`);
