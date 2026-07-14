const ACCESS_EMAIL_PATTERN_ = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

function normalizeAccessEmail_(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 254 || !ACCESS_EMAIL_PATTERN_.test(email)) {
    throw new Error('Indica un correo electrónico válido.');
  }
  return email;
}

function listAccessUsers_() {
  return listObjects_('Usuarios')
    .map(user => ({
      email: String(user.email || '').trim().toLowerCase(),
      role: String(user.role || APP_CONFIG.ROLE_VIEWER),
      active: isActiveUserValue_(user.active)
    }))
    .filter(user => user.email)
    .sort((a, b) => {
      if (a.role === APP_CONFIG.ROLE_OWNER && b.role !== APP_CONFIG.ROLE_OWNER) return -1;
      if (b.role === APP_CONFIG.ROLE_OWNER && a.role !== APP_CONFIG.ROLE_OWNER) return 1;
      return a.email.localeCompare(b.email);
    });
}

function getAccessUsers() {
  requireOwner_();
  return listAccessUsers_();
}

function grantDataAccess_(email) {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty('SPREADSHEET_ID');
  const contractsFolderId = props.getProperty('CONTRACTS_FOLDER_ID');
  if (!spreadsheetId || !contractsFolderId) throw new Error('El sistema todavía no está configurado.');

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const contractsFolder = DriveApp.getFolderById(contractsFolderId);
  try {
    spreadsheet.addViewer(email);
    contractsFolder.addViewer(email);
  } catch (error) {
    try { spreadsheet.removeViewer(email); } catch (ignored) {}
    try { contractsFolder.removeViewer(email); } catch (ignored) {}
    throw new Error(`No se pudo compartir el acceso con ${email}: ${error.message || error}`);
  }
}

function revokeDataAccess_(email) {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty('SPREADSHEET_ID');
  const contractsFolderId = props.getProperty('CONTRACTS_FOLDER_ID');
  if (!spreadsheetId || !contractsFolderId) throw new Error('El sistema todavía no está configurado.');
  SpreadsheetApp.openById(spreadsheetId).removeViewer(email);
  DriveApp.getFolderById(contractsFolderId).removeViewer(email);
}

function grantViewerAccess(payload) {
  const owner = requireOwner_();
  const email = normalizeAccessEmail_(payload && payload.email);
  if (email === owner.email) throw new Error('La cuenta propietaria ya tiene acceso total.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSchema_();
    const existing = listObjects_('Usuarios').find(user =>
      String(user.email || '').trim().toLowerCase() === email
    );
    if (existing && String(existing.role) === APP_CONFIG.ROLE_OWNER) {
      throw new Error('No se puede modificar otra cuenta propietaria desde este panel.');
    }

    grantDataAccess_(email);
    if (existing) {
      updateObject_('Usuarios', 'email', existing.email, {
        email,
        role: APP_CONFIG.ROLE_VIEWER,
        active: true
      });
    } else {
      appendObject_('Usuarios', { email, role: APP_CONFIG.ROLE_VIEWER, active: true });
    }
    try { audit_('CONCEDER_ACCESO', 'Usuario', email, { role: APP_CONFIG.ROLE_VIEWER }); }
    catch (ignored) {}
    return listAccessUsers_();
  } finally {
    lock.releaseLock();
  }
}

function revokeViewerAccess(payload) {
  const owner = requireOwner_();
  const email = normalizeAccessEmail_(payload && payload.email);
  if (email === owner.email) throw new Error('No puedes retirar el acceso de la cuenta propietaria.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const existing = listObjects_('Usuarios').find(user =>
      String(user.email || '').trim().toLowerCase() === email
    );
    if (!existing) throw new Error('La cuenta indicada no está registrada.');
    if (String(existing.role) === APP_CONFIG.ROLE_OWNER) {
      throw new Error('No se puede retirar otra cuenta propietaria desde este panel.');
    }

    updateObject_('Usuarios', 'email', existing.email, { active: false });
    try {
      revokeDataAccess_(email);
    } catch (error) {
      try { audit_('ERROR_RETIRAR_RECURSOS', 'Usuario', email, { message: error.message }); }
      catch (ignored) {}
      throw new Error(`La cuenta fue bloqueada en el panel, pero no se pudo retirar todo su acceso a Drive: ${error.message || error}`);
    }
    try { audit_('RETIRAR_ACCESO', 'Usuario', email, {}); }
    catch (ignored) {}
    return listAccessUsers_();
  } finally {
    lock.releaseLock();
  }
}
