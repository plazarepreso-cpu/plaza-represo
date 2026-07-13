function styleText_(paragraph, options) {
  const text = paragraph.editAsText();
  if (options.fontSize) text.setFontSize(options.fontSize);
  if (options.bold !== undefined) text.setBold(options.bold);
  if (options.color) text.setForegroundColor(options.color);
  if (options.fontFamily) text.setFontFamily(options.fontFamily);
  if (options.align) paragraph.setAlignment(options.align);
  if (options.spacingAfter !== undefined) paragraph.setSpacingAfter(options.spacingAfter);
  if (options.spacingBefore !== undefined) paragraph.setSpacingBefore(options.spacingBefore);
  return paragraph;
}

function styleCell_(cell, background, color, size, bold) {
  cell.setBackgroundColor(background);
  const paragraph = cell.getChild(0).asParagraph();
  styleText_(paragraph, {
    fontFamily: 'Arial',
    fontSize: size,
    bold,
    color,
    spacingBefore: 2,
    spacingAfter: 2
  });
}

function buildContractDocument_(contract) {
  const doc = DocumentApp.create(`${contract.contractNumber} - ${safeFileName_(contract.clientName)} - v${contract.version}`);
  const body = doc.getBody();
  body
    .setPageWidth(612)
    .setPageHeight(792)
    .setMarginTop(24)
    .setMarginBottom(24)
    .setMarginLeft(28)
    .setMarginRight(28);

  const header = body.appendTable([['PLAZA REPRESO\nEVENTOS', `CONTRATO No.\n${contract.contractNumber}`]]);
  header.setBorderColor('#f59e0b').setBorderWidth(1.5);
  header.setColumnWidth(0, 410).setColumnWidth(1, 146);
  styleCell_(header.getCell(0, 0), '#111111', '#f59e0b', 24, true);
  styleCell_(header.getCell(0, 1), '#111111', '#ffffff', 13, true);
  header.getCell(0, 0).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  header.getCell(0, 1).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  styleText_(body.appendParagraph('CONTRATO DE ARRENDAMIENTO PARA SALÓN DE EVENTOS SOCIALES'), {
    fontFamily: 'Arial', fontSize: 13, bold: true, color: '#111111',
    align: DocumentApp.HorizontalAlignment.CENTER, spacingBefore: 6, spacingAfter: 2
  });
  styleText_(body.appendParagraph('DENOMINADO “PLAZA REPRESO”'), {
    fontFamily: 'Arial', fontSize: 14, bold: true, color: '#dc2626',
    align: DocumentApp.HorizontalAlignment.CENTER, spacingAfter: 2
  });
  styleText_(body.appendParagraph(`NOGALES, SONORA A ${contract.elaborationDate}`), {
    fontFamily: 'Arial', fontSize: 9, bold: true, color: '#333333',
    align: DocumentApp.HorizontalAlignment.CENTER, spacingAfter: 5
  });

  const info = body.appendTable([[`DATOS DEL EVENTO\n\nDía: ${contract.eventDay}\nFecha: ${contract.eventDate}\nHorario: ${contract.startTime} a ${contract.endTime}\nTipo: ${contract.eventType}`,
    `DATOS DEL CLIENTE\n\nNombre: ${contract.clientName}\nDomicilio: ${contract.address}\nTeléfono: ${contract.phone}`,
    `PAGOS\n\nTotal: ${money_(contract.total)}\nPagado: ${money_(contract.paid)}\nRestan: ${money_(contract.balance)}\n${Number(contract.balance) === 0 ? 'PAGADO' : 'SALDO PENDIENTE'}`]]);
  info.setBorderColor('#ef4444').setBorderWidth(1);
  [0, 1, 2].forEach(index => {
    info.setColumnWidth(index, index === 1 ? 210 : 173);
    styleCell_(info.getCell(0, index), '#fffaf5', '#171717', 8, false);
    const p = info.getCell(0, index).getChild(0).asParagraph();
    p.setLineSpacing(1.1);
    p.editAsText().setBold(0, p.getText().split('\n')[0].length - 1, true);
  });

  styleText_(body.appendParagraph('CLÁUSULAS'), {
    fontFamily: 'Arial', fontSize: 11, bold: true, color: '#ffffff',
    align: DocumentApp.HorizontalAlignment.CENTER, spacingBefore: 6, spacingAfter: 3
  }).setBackgroundColor('#111111');

  const clauseRows = CONTRACT_CLAUSES.map((clause, index) => [String(index + 1), clause]);
  const clauses = body.appendTable(clauseRows);
  clauses.setBorderColor('#f59e0b').setBorderWidth(0.5);
  clauses.setColumnWidth(0, 32).setColumnWidth(1, 524);
  clauseRows.forEach((row, index) => {
    styleCell_(clauses.getCell(index, 0), '#111111', '#f59e0b', 9, true);
    styleCell_(clauses.getCell(index, 1), '#ffffff', '#222222', 7, false);
    clauses.getCell(index, 0).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  });

  const apart = body.appendTable([[`SE APARTÓ CON LA CANTIDAD DE: ${money_(contract.initialDeposit)} M.N.`]]);
  apart.setBorderColor('#f59e0b').setBorderWidth(1.5);
  styleCell_(apart.getCell(0, 0), '#111111', '#ffffff', 11, true);
  apart.getCell(0, 0).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  styleText_(body.appendParagraph('¡¡¡PLAZA REPRESO AGRADECE SU PREFERENCIA!!!'), {
    fontFamily: 'Arial', fontSize: 10, bold: true, color: '#111111',
    align: DocumentApp.HorizontalAlignment.CENTER, spacingBefore: 2, spacingAfter: 2
  });
  styleText_(body.appendParagraph(`DIRECCIÓN: ${APP_CONFIG.VENUE_ADDRESS}   |   CAPACIDAD MÁXIMA: ${APP_CONFIG.MAX_CAPACITY} PERSONAS`), {
    fontFamily: 'Arial', fontSize: 7, bold: true, color: '#dc2626',
    align: DocumentApp.HorizontalAlignment.CENTER, spacingAfter: 0
  });

  doc.saveAndClose();
  return doc;
}

function exportDocumentToPdf_(doc, folder, name) {
  const sourceFile = DriveApp.getFileById(doc.getId());
  sourceFile.moveTo(folder);
  const pdf = folder.createFile(sourceFile.getAs(MimeType.PDF).setName(name));
  return { documentFileId: sourceFile.getId(), pdfFileId: pdf.getId(), pdfUrl: pdf.getUrl() };
}

function generateContractPdf_(contract, folder) {
  const doc = buildContractDocument_(contract);
  return exportDocumentToPdf_(
    doc,
    folder,
    `${contract.contractNumber} - ${safeFileName_(contract.clientName)} - v${contract.version}.pdf`
  );
}

function generateReceiptPdf_(contract, payment, folder) {
  const doc = DocumentApp.create(`Recibo ${contract.contractNumber} - ${payment.id}`);
  const body = doc.getBody();
  body.setPageWidth(612).setPageHeight(792).setMarginTop(50).setMarginBottom(50).setMarginLeft(55).setMarginRight(55);
  const header = body.appendTable([['PLAZA REPRESO', 'RECIBO DE PAGO']]);
  header.setBorderColor('#f59e0b').setBorderWidth(1.5).setColumnWidth(0, 300).setColumnWidth(1, 202);
  styleCell_(header.getCell(0, 0), '#111111', '#f59e0b', 20, true);
  styleCell_(header.getCell(0, 1), '#111111', '#ffffff', 13, true);
  styleText_(body.appendParagraph(`Contrato ${contract.contractNumber}`), {
    fontFamily: 'Arial', fontSize: 15, bold: true, color: '#111111',
    align: DocumentApp.HorizontalAlignment.CENTER, spacingBefore: 18, spacingAfter: 12
  });
  const rows = [
    ['Cliente', contract.clientName],
    ['Fecha de pago', payment.date],
    ['Cantidad recibida', money_(payment.amount)],
    ['Método', payment.method || 'No indicado'],
    ['Concepto', payment.note || 'Abono al contrato'],
    ['Total pagado', money_(payment.newPaid)],
    ['Saldo restante', money_(payment.newBalance)]
  ];
  const table = body.appendTable(rows);
  table.setBorderColor('#f59e0b').setBorderWidth(1).setColumnWidth(0, 175).setColumnWidth(1, 327);
  rows.forEach((row, index) => {
    styleCell_(table.getCell(index, 0), '#fff7ed', '#111111', 10, true);
    styleCell_(table.getCell(index, 1), '#ffffff', '#111111', 10, false);
  });
  styleText_(body.appendParagraph('Este recibo forma parte del historial del contrato y no sustituye el contrato original.'), {
    fontFamily: 'Arial', fontSize: 8, bold: false, color: '#555555',
    align: DocumentApp.HorizontalAlignment.CENTER, spacingBefore: 18, spacingAfter: 0
  });
  doc.saveAndClose();
  return exportDocumentToPdf_(doc, folder, `Recibo ${contract.contractNumber} - ${payment.date} - ${payment.id}.pdf`);
}

