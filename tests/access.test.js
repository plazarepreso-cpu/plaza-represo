const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const state = {
  users: [{ email:'propietaria.ficticia@example.com', role:'PROPIETARIO', active:true }],
  spreadsheetViewers: new Set(),
  folderViewers: new Set(),
  audits: [],
  lockWaits: [],
  lockReleases: 0,
  schemaChecks: 0,
  failFolderAdd: false
};

const spreadsheet = {
  addViewer(email) { state.spreadsheetViewers.add(email); },
  removeViewer(email) { state.spreadsheetViewers.delete(email); }
};

const folder = {
  addViewer(email) {
    if (state.failFolderAdd) throw new Error('Fallo ficticio al compartir carpeta');
    state.folderViewers.add(email);
  },
  removeViewer(email) { state.folderViewers.delete(email); }
};

const context = vm.createContext({
  APP_CONFIG: { ROLE_OWNER:'PROPIETARIO', ROLE_VIEWER:'CONSULTA' },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: key => ({
        SPREADSHEET_ID:'hoja-ficticia',
        CONTRACTS_FOLDER_ID:'carpeta-ficticia'
      })[key] || ''
    })
  },
  SpreadsheetApp: {
    openById: id => {
      assert.strictEqual(id, 'hoja-ficticia');
      return spreadsheet;
    }
  },
  DriveApp: {
    getFolderById: id => {
      assert.strictEqual(id, 'carpeta-ficticia');
      return folder;
    }
  },
  LockService: {
    getScriptLock: () => ({
      waitLock: milliseconds => state.lockWaits.push(milliseconds),
      releaseLock: () => { state.lockReleases += 1; }
    })
  },
  requireOwner_: () => ({ email:'propietaria.ficticia@example.com', role:'PROPIETARIO' }),
  isActiveUserValue_: value => value === true || String(value).trim().toLowerCase() === 'true',
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

vm.runInContext(fs.readFileSync('src/AccessService.gs', 'utf8'), context);

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

test('normaliza y valida correos antes de compartir recursos', () => {
  assert.strictEqual(context.normalizeAccessEmail_(' EMPLEADA.FICTICIA@EXAMPLE.COM '), 'empleada.ficticia@example.com');
  ['', 'sin-arroba', 'persona@localhost', 'persona con espacios@example.com'].forEach(value => {
    assert.throws(() => context.normalizeAccessEmail_(value), /correo electrónico válido/);
  });
});

test('concede acceso de consulta a Sheets, Drive y al panel', () => {
  const users = context.grantViewerAccess({ email:'empleada.ficticia@example.com' });
  assert.strictEqual(state.schemaChecks, 1);
  assert.strictEqual(state.spreadsheetViewers.has('empleada.ficticia@example.com'), true);
  assert.strictEqual(state.folderViewers.has('empleada.ficticia@example.com'), true);
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(users.find(user => user.email === 'empleada.ficticia@example.com'))),
    { email:'empleada.ficticia@example.com', role:'CONSULTA', active:true }
  );
  assert.strictEqual(state.audits.at(-1).action, 'CONCEDER_ACCESO');
});

test('retirar acceso bloquea primero el panel y después elimina permisos', () => {
  const users = context.revokeViewerAccess({ email:'empleada.ficticia@example.com' });
  assert.strictEqual(state.spreadsheetViewers.has('empleada.ficticia@example.com'), false);
  assert.strictEqual(state.folderViewers.has('empleada.ficticia@example.com'), false);
  assert.strictEqual(users.find(user => user.email === 'empleada.ficticia@example.com').active, false);
  assert.strictEqual(state.audits.at(-1).action, 'RETIRAR_ACCESO');
});

test('una cuenta inactiva puede restaurarse sin duplicar filas', () => {
  const previousCount = state.users.length;
  context.grantViewerAccess({ email:'empleada.ficticia@example.com' });
  assert.strictEqual(state.users.length, previousCount);
  assert.strictEqual(state.users.find(user => user.email === 'empleada.ficticia@example.com').active, true);
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

test('si Drive falla, revierte el permiso parcial y no autoriza el panel', () => {
  state.failFolderAdd = true;
  assert.throws(
    () => context.grantViewerAccess({ email:'fallo.ficticio@example.com' }),
    /No se pudo compartir/
  );
  state.failFolderAdd = false;
  assert.strictEqual(state.spreadsheetViewers.has('fallo.ficticio@example.com'), false);
  assert.strictEqual(state.users.some(user => user.email === 'fallo.ficticio@example.com'), false);
});

assert.strictEqual(state.lockWaits.every(value => value === 30000), true);
assert.strictEqual(state.lockWaits.length, state.lockReleases, 'cada operación libera el bloqueo');

console.log(`${passed} casos de administración de accesos verificados correctamente.`);
