function getDatabase_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('El sistema no está configurado. Ejecuta setupSystem primero.');
  return SpreadsheetApp.openById(id);
}

function getSheet_(name) {
  const sheet = getDatabase_().getSheetByName(name);
  if (!sheet) throw new Error(`No existe la hoja ${name}.`);
  return sheet;
}

function listObjects_(sheetName) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1)
    .filter(row => row.some(value => value !== ''))
    .map(row => headers.reduce((item, header, index) => {
      item[header] = normalizeCellValue_(row[index]);
      return item;
    }, {}));
}

function appendObject_(sheetName, object) {
  const sheet = getSheet_(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const row = headers.map(header => normalizeSheetWriteValue_(object[header] === undefined ? '' : object[header]));
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
  return object;
}

function updateObject_(sheetName, idColumn, id, updates) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idIndex = headers.indexOf(idColumn);
  if (idIndex < 0) throw new Error(`La hoja ${sheetName} no tiene la columna ${idColumn}.`);
  const rowIndex = values.findIndex((row, index) => index > 0 && String(row[idIndex]) === String(id));
  if (rowIndex < 1) throw new Error(`No se encontró ${id} en ${sheetName}.`);
  const nextRow = values[rowIndex].slice();
  Object.keys(updates).forEach(key => {
    const column = headers.indexOf(key);
    if (column >= 0) nextRow[column] = normalizeSheetWriteValue_(updates[key]);
  });
  const safeRow = nextRow.slice(0, headers.length).map(normalizeSheetWriteValue_);
  sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([safeRow]);
  return findObject_(sheetName, idColumn, id);
}

function ensureSheetHeaders_(sheetName, expectedHeaders) {
  const sheet = getSheet_(sheetName);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  const missing = expectedHeaders.filter(header => !headers.includes(header));
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    sheet.getRange(1, headers.length + 1, 1, missing.length)
      .setFontWeight('bold')
      .setBackground('#171717')
      .setFontColor('#ffffff');
  }
  return missing;
}

function ensureSchema_() {
  return Object.keys(SHEET_HEADERS).reduce((changes, sheetName) => {
    const missing = ensureSheetHeaders_(sheetName, SHEET_HEADERS[sheetName]);
    if (missing.length) changes[sheetName] = missing;
    return changes;
  }, {});
}

function findObject_(sheetName, column, value) {
  return listObjects_(sheetName).find(item => String(item[column]) === String(value)) || null;
}

function normalizeCellValue_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, APP_CONFIG.TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss");
  return value;
}

function normalizeSheetWriteValue_(value) {
  if (typeof value !== 'string') return value;
  // Evita que texto capturado por usuarios se interprete como fórmula al llegar a Sheets.
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function getSetting_(key, fallback) {
  const row = findObject_('Configuracion', 'key', key);
  return row && row.value !== '' ? row.value : fallback;
}

function setSetting_(key, value) {
  const row = findObject_('Configuracion', 'key', key);
  if (row) return updateObject_('Configuracion', 'key', key, { value });
  return appendObject_('Configuracion', { key, value });
}

function audit_(action, entityType, entityId, details) {
  let user = '';
  try { user = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail(); } catch (error) {}
  appendObject_('Auditoria', {
    timestamp: nowIso_(),
    user: String(user || '').toLowerCase(),
    action,
    entityType,
    entityId,
    detailsJson: JSON.stringify(details || {})
  });
}
