function currentUser_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) {
    throw new Error('Google no proporcionó tu identidad. Abre la aplicación con una sola cuenta Google y autoriza el acceso.');
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
