const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

let activeEmail = 'propietaria.ficticia@example.com';
let users = [];
let scriptProperties = {};
let privateUserReads = 0;

const context = vm.createContext({
  APP_CONFIG: {
    ROLE_OWNER: 'PROPIETARIO',
    ROLE_VIEWER: 'CONSULTA'
  },
  Session: {
    getActiveUser: () => ({ getEmail: () => activeEmail })
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: key => scriptProperties[key] || '',
      setProperty: (key, value) => { scriptProperties[key] = String(value); }
    })
  },
  listObjects_: sheetName => {
    privateUserReads += 1;
    assert.strictEqual(sheetName, 'Usuarios');
    return users;
  }
});

vm.runInContext(fs.readFileSync('src/Security.gs', 'utf8'), context);

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

test('solo el booleano true y el texto true representan una cuenta activa', () => {
  const activeValues = [true, 'true', ' TRUE ', 'TrUe'];
  activeValues.forEach(value => assert.strictEqual(context.isActiveUserValue_(value), true));

  const inactiveValues = [false, 'false', 1, '1', 0, 'sí', '', null, undefined];
  inactiveValues.forEach(value => assert.strictEqual(context.isActiveUserValue_(value), false));
});

test('currentUser autoriza una cuenta ficticia activa y normaliza su correo', () => {
  activeEmail = '  PROPIETARIA.FICTICIA@EXAMPLE.COM ';
  scriptProperties = {};
  privateUserReads = 0;
  users = [{
    email: 'propietaria.ficticia@example.com',
    role: 'PROPIETARIO',
    active: 'true'
  }];

  assert.deepStrictEqual(JSON.parse(JSON.stringify(context.currentUser_())), {
    email: 'propietaria.ficticia@example.com',
    role: 'PROPIETARIO'
  });
});

test('currentUser rechaza valores activos ambiguos aunque el correo coincida', () => {
  activeEmail = 'consulta.ficticia@example.com';
  scriptProperties = {};
  privateUserReads = 0;
  users = [{
    email: 'consulta.ficticia@example.com',
    role: 'CONSULTA',
    active: 1
  }];

  assert.throws(() => context.currentUser_(), /no está autorizada/);
});

test('currentUser reconoce al empleado de agenda desde propiedades sin leer la hoja privada', () => {
  activeEmail = '  EMPLEADA.FICTICIA@EXAMPLE.COM ';
  scriptProperties = {
    OWNER_EMAIL: 'propietaria.ficticia@example.com',
    TEAM_VIEWER_EMAILS: JSON.stringify(['empleada.ficticia@example.com']),
    AGENDA_ONLY_ACCESS_ENABLED: 'true'
  };
  users = [{
    email: 'empleada.ficticia@example.com',
    role: 'CONSULTA',
    active: true
  }];
  privateUserReads = 0;

  assert.deepStrictEqual(JSON.parse(JSON.stringify(context.currentUser_())), {
    email: 'empleada.ficticia@example.com',
    role: 'CONSULTA'
  });
  assert.strictEqual(privateUserReads, 0, 'la cuenta de agenda no debe abrir Usuarios ni la hoja privada');
});

test('cuando la agenda exclusiva está activa, una cuenta ajena no cae a la hoja privada', () => {
  activeEmail = 'ajena.ficticia@example.com';
  scriptProperties = {
    OWNER_EMAIL: 'propietaria.ficticia@example.com',
    TEAM_VIEWER_EMAILS: JSON.stringify(['empleada.ficticia@example.com']),
    AGENDA_ONLY_ACCESS_ENABLED: 'true'
  };
  users = [{
    email: 'ajena.ficticia@example.com',
    role: 'PROPIETARIO',
    active: true
  }];
  privateUserReads = 0;

  assert.throws(() => context.currentUser_(), /no está autorizada/);
  assert.strictEqual(privateUserReads, 0, 'no debe intentar leer Usuarios para una cuenta no incluida');
});

test('la vista pública del cliente no filtra el identificador privado', () => {
  const publicClient = JSON.parse(JSON.stringify(context.stripPrivateClientFields_({
    id: 'cliente-ficticio-001',
    name: 'Cliente Ficticio',
    address: 'Domicilio ficticio 123',
    phone: '0000000000',
    ineFileId: 'archivo-ine-ficticio-privado',
    createdAt: '2026-07-13T10:00:00',
    updatedAt: '2026-07-13T10:00:00'
  })));

  assert.strictEqual(publicClient.hasIne, true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(publicClient, 'ineFileId'), false);
});

test('los contratos enviados al panel no filtran el identificador privado', () => {
  const publicContract = JSON.parse(JSON.stringify(context.stripPrivateContractFields_({
    id: 'contrato-ficticio-001',
    contractNumber: 'C.9001',
    ineFileId: 'archivo-ine-ficticio-historico'
  })));

  assert.strictEqual(publicContract.contractNumber, 'C.9001');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(publicContract, 'ineFileId'), false);
  assert.match(fs.readFileSync('src/ContractService.gs', 'utf8'), /\.map\(stripPrivateContractFields_\)/);
});

test('la instalación queda privada para google.script.run', () => {
  const configSource = fs.readFileSync('src/Config.gs', 'utf8');
  assert.match(configSource, /function setupSystem_\(/);
  assert.doesNotMatch(configSource, /function setupSystem\(/);
});

test('el panel no permite embeber acciones desde otros sitios', () => {
  const configSource = fs.readFileSync('src/Config.gs', 'utf8');
  assert.doesNotMatch(configSource, /XFrameOptionsMode\.ALLOWALL/);
  assert.match(configSource, /function getSystemInfo\(\)\s*{\s*requireOwner_\(\)/);
});

console.log(`${passed} casos de seguridad verificados correctamente.`);
