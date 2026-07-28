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
  // Se mantiene este nombre para instalaciones antiguas, pero ya no comparte
  // la hoja ni Drive. La única concesión permitida es la Agenda de equipo.
  return grantAgendaOnlyAccess_(email);
}

function revokeDataAccess_(email) {
  return revokeAgendaOnlyAccess_(email);
}

/**
 * Comparte los recursos privados gestionados por Drive con una cuenta
 * propietaria. Los calendarios se comparten desde Google Calendar: CalendarApp
 * no ofrece una API uniforme de ACL en todos los despliegues de Apps Script.
 */
function grantOwnerResourceAccess_(email) {
  const properties = PropertiesService.getScriptProperties();
  const resources = [
    ['la base de datos', properties.getProperty('SPREADSHEET_ID'), id => SpreadsheetApp.openById(id)],
    ['la carpeta de contratos', properties.getProperty('CONTRACTS_FOLDER_ID'), id => DriveApp.getFolderById(id)],
    ['el resguardo privado de identificaciones', properties.getProperty('PRIVATE_INE_FOLDER_ID'), id => DriveApp.getFolderById(id)]
  ];
  const failures = [];
  resources.forEach(item => {
    const label = item[0];
    const id = String(item[1] || '').trim();
    if (!id) return;
    try {
      const resource = item[2](id);
      if (!resource || typeof resource.addEditor !== 'function') throw new Error('recurso no disponible');
      resource.addEditor(email);
    } catch (error) {
      failures.push(`${label}: ${String(error.message || error)}`);
    }
  });
  if (failures.length) throw new Error(`No se pudo otorgar acceso completo: ${failures.join(' | ')}`);
  return grantIndexedContractFilesAccess_(email);
}

/**
 * Algunos contratos anteriores fueron creados antes de que existiera la
 * carpeta administrada. Sus PDFs pueden vivir fuera de ella, por lo que
 * compartir únicamente la carpeta no garantiza que otro propietario pueda
 * abrirlos. Se comparten de forma explícita, sin mover ni cambiar el archivo.
 */
function grantIndexedContractFilesAccess_(email) {
  if (typeof listContractFileLinks_ !== 'function') return { shared:0, failures:[] };
  const ids = Array.from(new Set(listContractFileLinks_()
    .map(item => String(item.contractFileId || '').trim())
    .filter(Boolean)));
  const failures = [];
  let shared = 0;
  ids.forEach(id => {
    try {
      DriveApp.getFileById(id).addEditor(email);
      shared += 1;
    } catch (error) {
      // Un enlace anterior roto no debe impedir el acceso al sistema ni a los
      // demás documentos. Se conserva para diagnóstico en la auditoría.
      failures.push({ id, message:String(error.message || error) });
    }
  });
  return { shared, failures };
}

/**
 * Concede el rol propietario sin reemplazar al propietario original. Incluye
 * acceso de edición a la base, documentos e INE. La instalación completa el
 * acceso a los calendarios desde la interfaz oficial de Google Calendar.
 */
function grantOwnerAccess(payload) {
  const owner = requireOwner_();
  const email = normalizeAccessEmail_(payload && payload.email);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSchema_();
    const alreadyOwner = listOwnerEmails_().includes(email);
    const existing = listObjects_('Usuarios').find(user =>
      String(user.email || '').trim().toLowerCase() === email
    );
    const resourceAccess = grantOwnerResourceAccess_(email) || { shared:0, failures:[] };
    if (!alreadyOwner) setOwnerEmails_(listOwnerEmails_().concat([email]));
    // Una cuenta que asciende deja de ser invitada de la agenda limitada.
    try { removeAgendaOnlyGuestFromTeamEvents_(email); } catch (ignored) {}
    setAgendaOnlyViewerEmails_(listAgendaOnlyViewerEmails_().filter(value => value !== email));
    if (existing) {
      updateObject_('Usuarios', 'email', existing.email, {
        email,
        role: APP_CONFIG.ROLE_OWNER,
        active: true
      });
    } else {
      appendObject_('Usuarios', { email, role: APP_CONFIG.ROLE_OWNER, active: true });
    }
    try {
      audit_(alreadyOwner ? 'REPARAR_ACCESO_PROPIETARIO' : 'CONCEDER_PROPIETARIO', 'Usuario', email, {
        grantedBy: owner.email,
        linkedFilesShared: resourceAccess.shared,
        linkedFileFailures: resourceAccess.failures
      });
    }
    catch (ignored) {}
    return listAccessUsers_();
  } finally {
    lock.releaseLock();
  }
}

function grantViewerAccess(payload) {
  const owner = requireOwner_();
  const email = normalizeAccessEmail_(payload && payload.email);
  if (listOwnerEmails_().includes(email)) throw new Error('La cuenta propietaria ya tiene acceso total.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSchema_();
    if (typeof migrateExistingViewerAccessToAgendaOnly_ === 'function') {
      migrateExistingViewerAccessToAgendaOnly_();
    }
    const existing = listObjects_('Usuarios').find(user =>
      String(user.email || '').trim().toLowerCase() === email
    );
    if (existing && String(existing.role) === APP_CONFIG.ROLE_OWNER) {
      throw new Error('No se puede modificar otra cuenta propietaria desde este panel.');
    }
    let shared = false;
    try {
      grantDataAccess_(email);
      shared = true;
      if (existing) {
        updateObject_('Usuarios', 'email', existing.email, {
          email,
          role: APP_CONFIG.ROLE_VIEWER,
          active: true
        });
      } else {
        appendObject_('Usuarios', { email, role: APP_CONFIG.ROLE_VIEWER, active: true });
      }
    } catch (error) {
      if (shared) {
        try { revokeDataAccess_(email); } catch (ignored) {}
      }
      throw error;
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
  if (listOwnerEmails_().includes(email)) throw new Error('No puedes retirar el acceso de la cuenta propietaria.');

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

    try {
      revokeDataAccess_(email);
    } catch (error) {
      try { audit_('ERROR_RETIRAR_RECURSOS', 'Usuario', email, { message: error.message }); }
      catch (ignored) {}
      throw new Error(`No se pudo retirar todo el acceso de agenda y recursos privados: ${error.message || error}`);
    }
    updateObject_('Usuarios', 'email', existing.email, { active: false });
    try { audit_('RETIRAR_ACCESO', 'Usuario', email, {}); }
    catch (ignored) {}
    return listAccessUsers_();
  } finally {
    lock.releaseLock();
  }
}
