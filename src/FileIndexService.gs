function listContractFileLinks_() {
  try {
    return listObjects_('Archivos').sort((a, b) =>
      String(a.contractNumber || '').localeCompare(String(b.contractNumber || ''))
    );
  } catch (error) {
    return [];
  }
}

function normalizeIndexedContractNumber_(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `C.${digits.padStart(4, '0')}` : '';
}

function normalizeDriveFileName_(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isExcludedContractFileName_(name) {
  const normalized = normalizeDriveFileName_(name);
  return /(^|[^a-z0-9])(ine|identificacion|credencial|recibo|comprobante|transferencia|pago)([^a-z0-9]|$)/.test(normalized);
}

function contractFileMimeScore_(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime === 'application/pdf') return 35;
  if (mime === 'application/vnd.google-apps.document') return 30;
  if (/^image\/(jpeg|jpg|png|webp)$/.test(mime)) return 25;
  return -1;
}

function scoreContractFile_(file, contractNumber) {
  const number = normalizeIndexedContractNumber_(contractNumber);
  const digits = number.replace(/\D/g, '');
  if (!digits) return -1;

  let name = '';
  let mimeType = '';
  try {
    name = String(file.getName() || '');
    mimeType = String(file.getMimeType() || '');
  } catch (error) {
    return -1;
  }
  if (isExcludedContractFileName_(name)) return -1;
  const mimeScore = contractFileMimeScore_(mimeType);
  if (mimeScore < 0) return -1;

  const normalized = normalizeDriveFileName_(name);
  const escapedDigits = digits.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const standaloneNumber = new RegExp(`(^|[^0-9])${escapedDigits}([^0-9]|$)`);
  if (!standaloneNumber.test(normalized)) return -1;

  const cNumber = new RegExp(`(^|[^a-z0-9])c[\\s._-]*${escapedDigits}([^0-9]|$)`);
  const contractNumberPattern = new RegExp(`(^|[^a-z0-9])contrato[^0-9]{0,20}${escapedDigits}([^0-9]|$)`);
  // Un número aislado no basta: podría pertenecer a un pago o comprobante.
  if (!cNumber.test(normalized) && !contractNumberPattern.test(normalized)) return -1;
  let score = mimeScore + 20;
  if (cNumber.test(normalized)) score += 100;
  if (contractNumberPattern.test(normalized)) score += 75;
  if (/\bcontrato\b/.test(normalized)) score += 30;
  if (/\b(final|firmado|original)\b/.test(normalized)) score += 10;
  return score;
}

function findExistingContractFile_(contractNumber) {
  const number = normalizeIndexedContractNumber_(contractNumber);
  const digits = number.replace(/\D/g, '');
  if (!digits) return null;
  const escapedQuery = digits.replace(/'/g, "\\'");
  const files = DriveApp.searchFiles(`title contains '${escapedQuery}' and trashed = false`);
  const candidates = [];

  while (files.hasNext()) {
    const file = files.next();
    const score = scoreContractFile_(file, number);
    if (score < 0) continue;
    let candidate;
    try {
      candidate = { id:file.getId(), name:file.getName(), score };
    } catch (error) {
      continue;
    }
    candidates.push(candidate);
  }
  if (!candidates.length) return null;
  if (candidates.length > 1) {
    return {
      ambiguous:true,
      candidateNames:candidates.map(candidate => candidate.name).sort()
    };
  }
  return candidates[0];
}

function indexedContractNumbers_() {
  const seen = {};
  // Los contratos gestionados ya incluyen currentPdfFileId. Solo el historial
  // necesita encontrar su documento original; Calendar no es fuente documental.
  listObjects_('Historial').forEach(item => {
    const number = normalizeIndexedContractNumber_(item.contractNumber);
    if (number) seen[number] = true;
  });
  return Object.keys(seen).sort((a, b) =>
    Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, ''))
  );
}

/**
 * Vincula el índice con documentos que ya existen en Drive. No mueve, copia,
 * comparte ni modifica archivos; únicamente guarda su referencia.
 */
function syncExistingContractFiles() {
  const owner = requireOwner_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSchema_();
    const numbers = indexedContractNumbers_();
    const indexedFiles = new Map(listContractFileLinks_().map(item => [
      normalizeIndexedContractNumber_(item.contractNumber), item
    ]));
    const results = [];

    numbers.forEach(contractNumber => {
      try {
        const match = findExistingContractFile_(contractNumber);
        if (!match) {
          results.push({ contractNumber, status:'NO_ENCONTRADO' });
          return;
        }
        if (match.ambiguous) {
          results.push({
            contractNumber,
            status:'AMBIGUO',
            candidateNames:match.candidateNames
          });
          return;
        }
        indexedFiles.set(contractNumber, {
          id:`archivo:${contractNumber}`,
          contractNumber,
          contractFileId:match.id,
          contractFileName:match.name,
          updatedAt:nowIso_()
        });
        results.push({
          contractNumber,
          status:'VINCULADO',
          contractFileName:match.name
        });
      } catch (error) {
        results.push({
          contractNumber,
          status:'ERROR',
          message:String(error.message || error)
        });
      }
    });

    // Una búsqueda temporal sin resultados no borra vínculos que ya fueron
    // comprobados; solo se agregan o actualizan coincidencias inequívocas.
    replaceObjects_('Archivos', Array.from(indexedFiles.values()));
    const summary = {
      linked:results.filter(result => result.status === 'VINCULADO').length,
      missing:results.filter(result => ['NO_ENCONTRADO', 'AMBIGUO'].includes(result.status)).length,
      ambiguous:results.filter(result => result.status === 'AMBIGUO').length,
      errors:results.filter(result => result.status === 'ERROR').length,
      results
    };
    try { audit_('VINCULAR_ARCHIVOS_EXISTENTES', 'Sistema', owner.email, summary); }
    catch (ignored) {}
    return summary;
  } finally {
    lock.releaseLock();
  }
}
