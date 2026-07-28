const TEAM_VIEWERS_PROPERTY_ = 'TEAM_VIEWER_EMAILS';
const AGENDA_ONLY_ACCESS_ENABLED_PROPERTY_ = 'AGENDA_ONLY_ACCESS_ENABLED';
const OWNER_EMAILS_PROPERTY_ = 'OWNER_EMAILS';

/**
 * Conserva compatibilidad con la instalación original de un solo propietario
 * y permite propietarios adicionales sin depender de la hoja privada para
 * autorizar la primera carga del panel.
 */
function listOwnerEmails_() {
  const properties = PropertiesService.getScriptProperties();
  const legacyOwner = String(properties.getProperty('OWNER_EMAIL') || '').trim().toLowerCase();
  let configured = [];
  try { configured = JSON.parse(String(properties.getProperty(OWNER_EMAILS_PROPERTY_) || '[]')); }
  catch (error) { configured = []; }
  const values = Array.isArray(configured) ? configured : [];
  return Array.from(new Set([legacyOwner].concat(values)
    .map(value => String(value || '').trim().toLowerCase())
    .filter(email => email && email.includes('@'))));
}

function setOwnerEmails_(emails) {
  const normalized = Array.from(new Set((emails || [])
    .map(value => String(value || '').trim().toLowerCase())
    .filter(email => email && email.includes('@'))));
  if (!normalized.length) throw new Error('Debe permanecer al menos una cuenta propietaria.');
  PropertiesService.getScriptProperties().setProperty(OWNER_EMAILS_PROPERTY_, JSON.stringify(normalized));
  return normalized;
}

/**
 * La lista de consulta vive fuera de la base privada. Así una persona que solo
 * ve la agenda puede autenticarse sin recibir permiso de lectura a Sheets.
 */
function listAgendaOnlyViewerEmails_() {
  const raw = String(
    PropertiesService.getScriptProperties().getProperty(TEAM_VIEWERS_PROPERTY_) || '[]'
  ).trim();
  let values = [];
  try { values = JSON.parse(raw); }
  catch (error) { return []; }
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values
    .map(value => String(value || '').trim().toLowerCase())
    .filter(email => email && email.includes('@'))));
}

function setAgendaOnlyViewerEmails_(emails) {
  const normalized = Array.from(new Set((emails || [])
    .map(value => String(value || '').trim().toLowerCase())
    .filter(email => email && email.includes('@'))));
  PropertiesService.getScriptProperties().setProperty(
    TEAM_VIEWERS_PROPERTY_, JSON.stringify(normalized)
  );
  return normalized;
}

function isAgendaOnlyAccessEnabled_() {
  return String(
    PropertiesService.getScriptProperties().getProperty(AGENDA_ONLY_ACCESS_ENABLED_PROPERTY_) || ''
  ).trim().toLowerCase() === 'true';
}

function currentUser_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) {
    throw new Error('Google no proporcionó tu identidad. Abre la aplicación con una sola cuenta Google y autoriza el acceso.');
  }

  const properties = PropertiesService.getScriptProperties();
  if (listOwnerEmails_().includes(email)) return { email, role: APP_CONFIG.ROLE_OWNER };

  // Esta comprobación nunca abre la hoja privada. Es la ruta segura de las
  // cuentas de consulta después de retirarles Drive y Sheets.
  if (listAgendaOnlyViewerEmails_().includes(email)) {
    return { email, role: APP_CONFIG.ROLE_VIEWER };
  }

  // La instalación anterior usaba la hoja para autorizar consulta. Se conserva
  // únicamente mientras se migra; una vez activado el modo agenda, nadie fuera
  // de la lista anterior puede volver a leer la base por esta vía.
  if (isAgendaOnlyAccessEnabled_()) {
    throw new Error('Esta cuenta no está autorizada para Plaza Represo.');
  }

  const user = listObjects_('Usuarios').find(item =>
    String(item.email).trim().toLowerCase() === email && isActiveUserValue_(item.active)
  );
  if (!user) throw new Error('Esta cuenta no está autorizada para Plaza Represo.');
  return { email, role: String(user.role || APP_CONFIG.ROLE_VIEWER) };
}

function isActiveUserValue_(value) {
  return value === true || String(value).trim().toLowerCase() === 'true';
}

function requireOwner_() {
  const user = currentUser_();
  if (user.role !== APP_CONFIG.ROLE_OWNER) throw new Error('Tu cuenta es de consulta y no puede modificar información.');
  return user;
}

function stripPrivateClientFields_(client) {
  return {
    id: client.id,
    name: client.name,
    address: client.address,
    phone: client.phone,
    hasIne: Boolean(client.ineFileId),
    createdAt: client.createdAt,
    updatedAt: client.updatedAt
  };
}

function stripPrivateContractFields_(contract) {
  const publicContract = Object.assign({}, contract);
  publicContract.hasIne = Boolean(contract.ineFileId);
  delete publicContract.ineFileId;
  return publicContract;
}
