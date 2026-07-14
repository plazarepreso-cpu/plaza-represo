/**
 * Marca visual de Plaza Represo.
 *
 * El archivo maestro se guarda junto a los contratos para que la aplicación no
 * dependa de un enlace público ni de una imagen de terceros. Su nombre es
 * deliberadamente fijo; si se reemplaza, basta conservar el mismo nombre.
 */
const PLAZA_REPRESO_BRAND_FILE_NAME = 'plaza-represo-logo-original.jpg';

function getPlazaRepresoBrandFile_() {
  const rootId = String(
    PropertiesService.getScriptProperties().getProperty('CONTRACTS_FOLDER_ID') || ''
  ).trim();
  if (!rootId) return null;
  try {
    const files = DriveApp.getFolderById(rootId).getFilesByName(PLAZA_REPRESO_BRAND_FILE_NAME);
    return files.hasNext() ? files.next() : null;
  } catch (error) {
    return null;
  }
}

function getPlazaRepresoBrandBlob_() {
  const file = getPlazaRepresoBrandFile_();
  if (!file) return null;
  try { return file.getBlob(); }
  catch (error) { return null; }
}

function getPlazaRepresoBrandDataUrl_() {
  const blob = getPlazaRepresoBrandBlob_();
  if (!blob) return '';
  const type = String(blob.getContentType() || 'image/jpeg');
  return `data:${type};base64,${Utilities.base64Encode(blob.getBytes())}`;
}
