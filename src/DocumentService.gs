const DOCUMENT_THEME = Object.freeze({
  ink: '#161616',
  inkSoft: '#2B2B2B',
  gold: '#F4B41A',
  goldSoft: '#FFF4D6',
  paper: '#FFFCF6',
  line: '#D8C89B',
  muted: '#66605A',
  red: '#C52222',
  green: '#15803D',
  white: '#FFFFFF'
});

function styleText_(paragraph, options) {
  const text = paragraph.editAsText();
  if (options.fontSize) text.setFontSize(options.fontSize);
  if (options.bold !== undefined) text.setBold(options.bold);
  if (options.color) text.setForegroundColor(options.color);
  if (options.fontFamily) text.setFontFamily(options.fontFamily);
  if (options.align) paragraph.setAlignment(options.align);
  if (options.lineSpacing) paragraph.setLineSpacing(options.lineSpacing);
  if (options.spacingAfter !== undefined) paragraph.setSpacingAfter(options.spacingAfter);
  if (options.spacingBefore !== undefined) paragraph.setSpacingBefore(options.spacingBefore);
  return paragraph;
}

function setCellText_(cell, value, options) {
  const settings = Object.assign({
    background: DOCUMENT_THEME.white,
    color: DOCUMENT_THEME.ink,
    fontFamily: 'Arial',
    fontSize: 8,
    bold: false,
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 7,
    paddingRight: 7,
    align: DocumentApp.HorizontalAlignment.LEFT,
    lineSpacing: 1.05
  }, options || {});
  cell.setBackgroundColor(settings.background);
  cell.setPaddingTop(settings.paddingTop);
  cell.setPaddingBottom(settings.paddingBottom);
  cell.setPaddingLeft(settings.paddingLeft);
  cell.setPaddingRight(settings.paddingRight);
  cell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
  const paragraph = cell.getChild(0).asParagraph();
  paragraph.setText(String(value || ''));
  styleText_(paragraph, settings);
  return paragraph;
}

function styleFragments_(paragraph, fragments) {
  const fullText = paragraph.getText();
  const text = paragraph.editAsText();
  (fragments || []).forEach(fragment => {
    let start = fullText.indexOf(fragment.text);
    while (start >= 0) {
      const end = start + fragment.text.length - 1;
      if (fragment.bold !== undefined) text.setBold(start, end, fragment.bold);
      if (fragment.color) text.setForegroundColor(start, end, fragment.color);
      if (fragment.fontSize) text.setFontSize(start, end, fragment.fontSize);
      start = fullText.indexOf(fragment.text, end + 1);
    }
  });
}

function styleValueAfterLabel_(paragraph, label, options) {
  const fullText = paragraph.getText();
  const start = fullText.indexOf(label);
  if (start < 0) return;
  const valueStart = start + label.length;
  const lineEnd = fullText.indexOf('\n', valueStart);
  const valueEnd = (lineEnd < 0 ? fullText.length : lineEnd) - 1;
  if (valueEnd < valueStart) return;
  const text = paragraph.editAsText();
  if (options.bold !== undefined) text.setBold(valueStart, valueEnd, options.bold);
  if (options.fontSize) text.setFontSize(valueStart, valueEnd, options.fontSize);
  if (options.color) text.setForegroundColor(valueStart, valueEnd, options.color);
}

function printableDate_(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || '');
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(match[3])} de ${months[Number(match[2]) - 1]} de ${match[1]}`;
}

function printableTime_(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return String(value || '');
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? 'p.m.' : 'a.m.';
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${match[2]} ${suffix}`;
}

function appendOriginalBrandLogo_(brandCell) {
  const originalLogo = getPlazaRepresoBrandBlob_();
  if (!originalLogo) return false;

  try {
    brandCell.clear();
    const logoParagraph = brandCell.appendParagraph('');
    logoParagraph.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    logoParagraph.setSpacingBefore(0).setSpacingAfter(0);
    const logo = logoParagraph.appendInlineImage(originalLogo);

    // Conserva las proporciones del logotipo original aun si se sustituye el
    // archivo maestro por una versión con dimensiones distintas.
    const maxWidth = 352;
    const maxHeight = 65;
    const sourceWidth = typeof logo.getWidth === 'function' ? Number(logo.getWidth()) : 0;
    const sourceHeight = typeof logo.getHeight === 'function' ? Number(logo.getHeight()) : 0;
    if (sourceWidth > 0 && sourceHeight > 0) {
      const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
      logo.setWidth(Math.max(1, Math.round(sourceWidth * scale)));
      logo.setHeight(Math.max(1, Math.round(sourceHeight * scale)));
    } else {
      logo.setWidth(maxWidth);
      logo.setHeight(maxHeight);
    }
    return true;
  } catch (error) {
    // Un archivo incompatible nunca debe impedir generar un contrato o recibo.
    return false;
  }
}

function appendBrandFallback_(brandCell) {
  // Mantiene el documento imprimible si un día se mueve o se daña el archivo de marca.
  brandCell.clear();
  const plaza = brandCell.appendParagraph('PLAZA');
  styleText_(plaza, {
    fontFamily: 'Arial', fontSize: 8, bold: true, color: DOCUMENT_THEME.white,
    spacingBefore: 0, spacingAfter: 0
  });
  const brand = brandCell.appendParagraph('REPRESO  EVENTOS');
  styleText_(brand, {
    fontFamily: 'Arial', fontSize: 21, bold: true, color: DOCUMENT_THEME.gold,
    spacingBefore: 0, spacingAfter: 0
  });
  styleFragments_(brand, [{ text: 'EVENTOS', fontSize: 8, color: DOCUMENT_THEME.white }]);
}

function appendBrandHeader_(body, rightLabel, rightValue) {
  const table = body.appendTable([['', '']]);
  table.setBorderColor(DOCUMENT_THEME.gold).setBorderWidth(1.4);
  table.setColumnWidth(0, 400).setColumnWidth(1, 156);

  const brandCell = table.getCell(0, 0);
  brandCell.setBackgroundColor('#000000')
    .setPaddingTop(3).setPaddingBottom(3).setPaddingLeft(5).setPaddingRight(5)
    .setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
  if (!appendOriginalBrandLogo_(brandCell)) appendBrandFallback_(brandCell);

  const badgeCell = table.getCell(0, 1);
  badgeCell.setBackgroundColor(DOCUMENT_THEME.inkSoft)
    .setPaddingTop(7).setPaddingBottom(7).setPaddingLeft(8).setPaddingRight(8)
    .setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
  const badgeLabel = badgeCell.getChild(0).asParagraph();
  badgeLabel.setText(rightLabel);
  styleText_(badgeLabel, {
    fontFamily: 'Arial', fontSize: 7, bold: true, color: DOCUMENT_THEME.white,
    align: DocumentApp.HorizontalAlignment.CENTER, spacingBefore: 0, spacingAfter: 1
  });
  styleText_(badgeCell.appendParagraph(rightValue), {
    fontFamily: 'Arial', fontSize: 17, bold: true, color: DOCUMENT_THEME.gold,
    align: DocumentApp.HorizontalAlignment.CENTER, spacingBefore: 0, spacingAfter: 0
  });
  return table;
}

function appendSectionBar_(body, title) {
  const table = body.appendTable([[title]]);
  table.setBorderColor(DOCUMENT_THEME.gold).setBorderWidth(1);
  setCellText_(table.getCell(0, 0), title, {
    background: DOCUMENT_THEME.ink,
    color: DOCUMENT_THEME.white,
    fontSize: 9,
    bold: true,
    paddingTop: 3,
    paddingBottom: 3,
    align: DocumentApp.HorizontalAlignment.CENTER
  });
  return table;
}

function appendSpacer_(body, points) {
  const paragraph = body.appendParagraph('');
  paragraph.setSpacingBefore(0).setSpacingAfter(points);
  return paragraph;
}

function appendContractSummary_(body, contract) {
  const table = body.appendTable([
    ['DATOS DEL EVENTO', 'DATOS DEL CLIENTE', 'PAGOS'],
    [
      `DÍA  ${contract.eventDay}\nFECHA  ${printableDate_(contract.eventDate)}\nHORARIO  ${printableTime_(contract.startTime)} - ${printableTime_(contract.endTime)}\nEVENTO  ${contract.eventType}`,
      `NOMBRE  ${contract.clientName}\nDOMICILIO  ${contract.address}\nTELÉFONO  ${contract.phone}`,
      `PAGO TOTAL  ${money_(contract.total)}\nABONO INICIAL  ${money_(contract.initialDeposit)}\nSALDO  ${money_(contract.balance)}\n${Number(contract.balance) === 0 ? 'PAGADO' : 'SALDO PENDIENTE'}`
    ]
  ]);
  table.setBorderColor(DOCUMENT_THEME.line).setBorderWidth(0.8);
  table.setColumnWidth(0, 176).setColumnWidth(1, 230).setColumnWidth(2, 150);

  for (let column = 0; column < 3; column += 1) {
    setCellText_(table.getCell(0, column), table.getCell(0, column).getText(), {
      background: DOCUMENT_THEME.ink,
      color: DOCUMENT_THEME.white,
      fontSize: 9,
      bold: true,
      paddingTop: 5,
      paddingBottom: 5,
      align: DocumentApp.HorizontalAlignment.CENTER
    });
    const detail = setCellText_(table.getCell(1, column), table.getCell(1, column).getText(), {
      background: DOCUMENT_THEME.paper,
      color: DOCUMENT_THEME.ink,
      fontSize: column === 1 ? 8 : 8,
      paddingTop: 8,
      paddingBottom: 8,
      lineSpacing: 1.18
    });
    styleFragments_(detail, [
      { text: 'DÍA', bold: true, color: DOCUMENT_THEME.red },
      { text: 'FECHA', bold: true, color: DOCUMENT_THEME.red },
      { text: 'HORARIO', bold: true, color: DOCUMENT_THEME.red },
      { text: 'EVENTO', bold: true, color: DOCUMENT_THEME.red },
      { text: 'NOMBRE', bold: true, color: DOCUMENT_THEME.red },
      { text: 'DOMICILIO', bold: true, color: DOCUMENT_THEME.red },
      { text: 'TELÉFONO', bold: true, color: DOCUMENT_THEME.red },
      { text: 'PAGO TOTAL', bold: true, color: DOCUMENT_THEME.red },
      { text: 'ABONO INICIAL', bold: true, color: DOCUMENT_THEME.red },
      { text: 'SALDO', bold: true, color: DOCUMENT_THEME.red },
      { text: Number(contract.balance) === 0 ? 'PAGADO' : 'SALDO PENDIENTE', bold: true, color: DOCUMENT_THEME.green }
    ]);
    if (column === 1) {
      styleValueAfterLabel_(detail, 'NOMBRE  ', { bold:true, fontSize:9 });
    }
  }
  return table;
}

function appendClauses_(body) {
  appendSectionBar_(body, 'CLÁUSULAS');
  const rows = CONTRACT_CLAUSES.map((clause, index) => [String(index + 1), clause]);
  const table = body.appendTable(rows);
  table.setBorderColor(DOCUMENT_THEME.line).setBorderWidth(0.45);
  table.setColumnWidth(0, 30).setColumnWidth(1, 526);
  rows.forEach((row, index) => {
    setCellText_(table.getCell(index, 0), String(index + 1), {
      background: DOCUMENT_THEME.ink,
      color: DOCUMENT_THEME.gold,
      fontSize: 10,
      bold: true,
      paddingTop: 4,
      paddingBottom: 4,
      paddingLeft: 2,
      paddingRight: 2,
      align: DocumentApp.HorizontalAlignment.CENTER
    });
    setCellText_(table.getCell(index, 1), row[1], {
      background: index % 2 === 0 ? DOCUMENT_THEME.white : DOCUMENT_THEME.paper,
      color: DOCUMENT_THEME.ink,
      fontSize: 8,
      paddingTop: 4,
      paddingBottom: 4,
      paddingLeft: 6,
      paddingRight: 5,
      lineSpacing: 1.1
    });
  });
  return table;
}

function appendContractFooter_(body, contract) {
  const deposit = body.appendTable([['SE APARTÓ CON LA CANTIDAD DE', `${money_(contract.initialDeposit)} M.N.`]]);
  deposit.setBorderColor(DOCUMENT_THEME.gold).setBorderWidth(1.2);
  deposit.setColumnWidth(0, 370).setColumnWidth(1, 186);
  setCellText_(deposit.getCell(0, 0), 'SE APARTÓ CON LA CANTIDAD DE', {
    background: DOCUMENT_THEME.ink,
    color: DOCUMENT_THEME.white,
    fontSize: 10,
    bold: true,
    paddingTop: 6,
    paddingBottom: 6,
    align: DocumentApp.HorizontalAlignment.CENTER
  });
  setCellText_(deposit.getCell(0, 1), `${money_(contract.initialDeposit)} M.N.`, {
    background: DOCUMENT_THEME.gold,
    color: DOCUMENT_THEME.ink,
    fontSize: 12,
    bold: true,
    paddingTop: 6,
    paddingBottom: 6,
    align: DocumentApp.HorizontalAlignment.CENTER
  });

  styleText_(body.appendParagraph('PLAZA REPRESO AGRADECE SU PREFERENCIA'), {
    fontFamily: 'Arial', fontSize: 9, bold: true, color: DOCUMENT_THEME.ink,
    align: DocumentApp.HorizontalAlignment.CENTER, spacingBefore: 4, spacingAfter: 3
  });
}

function buildContractDocument_(contract) {
  const doc = DocumentApp.create(`${contract.contractNumber} - ${safeFileName_(contract.clientName)} - v${contract.version}`);
  const body = doc.getBody();
  body
    .setPageWidth(612)
    .setPageHeight(792)
    .setMarginTop(16)
    .setMarginBottom(14)
    .setMarginLeft(28)
    .setMarginRight(28);

  appendBrandHeader_(body, 'CONTRATO No.', contract.contractNumber);
  styleText_(body.appendParagraph('CONTRATO DE ARRENDAMIENTO PARA SALÓN DE EVENTOS SOCIALES'), {
    fontFamily: 'Arial', fontSize: 12, bold: true, color: DOCUMENT_THEME.ink,
    align: DocumentApp.HorizontalAlignment.CENTER, spacingBefore: 6, spacingAfter: 2
  });
  styleText_(body.appendParagraph('PLAZA REPRESO'), {
    fontFamily: 'Arial', fontSize: 15, bold: true, color: DOCUMENT_THEME.red,
    align: DocumentApp.HorizontalAlignment.CENTER, spacingBefore: 0, spacingAfter: 2
  });
  const dateLine = body.appendParagraph(`NOGALES, SONORA  |  ${printableDate_(contract.elaborationDate).toUpperCase()}`);
  styleText_(dateLine, {
    fontFamily: 'Arial', fontSize: 9, bold: true, color: DOCUMENT_THEME.muted,
    align: DocumentApp.HorizontalAlignment.CENTER, spacingBefore: 0, spacingAfter: 6
  });
  styleFragments_(dateLine, [{ text: printableDate_(contract.elaborationDate).toUpperCase(), color: DOCUMENT_THEME.red }]);

  appendContractSummary_(body, contract);
  styleText_(body.appendParagraph('Se celebra este contrato entre el ARRENDADOR, Salón de Eventos Plaza Represo, y el ARRENDATARIO(A) antes mencionado, quienes aceptan las siguientes cláusulas:'), {
    fontFamily: 'Arial', fontSize: 8, bold: false, color: DOCUMENT_THEME.ink,
    align: DocumentApp.HorizontalAlignment.CENTER, lineSpacing: 1.12,
    spacingBefore: 6, spacingAfter: 5
  });
  appendClauses_(body);
  appendContractFooter_(body, contract);

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
  body
    .setPageWidth(612)
    .setPageHeight(792)
    .setMarginTop(38)
    .setMarginBottom(38)
    .setMarginLeft(48)
    .setMarginRight(48);

  appendBrandHeader_(body, 'RECIBO', contract.contractNumber);
  styleText_(body.appendParagraph('COMPROBANTE DE PAGO'), {
    fontFamily: 'Arial', fontSize: 13, bold: true, color: DOCUMENT_THEME.ink,
    align: DocumentApp.HorizontalAlignment.CENTER, spacingBefore: 14, spacingAfter: 2
  });
  styleText_(body.appendParagraph(`FOLIO ${String(payment.id || '').slice(0, 8).toUpperCase()}`), {
    fontFamily: 'Arial', fontSize: 7, bold: true, color: DOCUMENT_THEME.muted,
    align: DocumentApp.HorizontalAlignment.CENTER, spacingBefore: 0, spacingAfter: 10
  });

  const amount = body.appendTable([['CANTIDAD RECIBIDA', money_(payment.amount)]]);
  amount.setBorderColor(DOCUMENT_THEME.gold).setBorderWidth(1.2);
  amount.setColumnWidth(0, 260).setColumnWidth(1, 256);
  setCellText_(amount.getCell(0, 0), 'CANTIDAD RECIBIDA', {
    background: DOCUMENT_THEME.ink,
    color: DOCUMENT_THEME.white,
    fontSize: 9,
    bold: true,
    paddingTop: 9,
    paddingBottom: 9,
    align: DocumentApp.HorizontalAlignment.CENTER
  });
  setCellText_(amount.getCell(0, 1), money_(payment.amount), {
    background: DOCUMENT_THEME.gold,
    color: DOCUMENT_THEME.ink,
    fontSize: 17,
    bold: true,
    paddingTop: 7,
    paddingBottom: 7,
    align: DocumentApp.HorizontalAlignment.CENTER
  });
  appendSpacer_(body, 6);

  const rows = [
    ['CLIENTE', contract.clientName],
    ['CONTRATO', contract.contractNumber],
    ['FECHA DE PAGO', printableDate_(payment.date)],
    ['MÉTODO', payment.method || 'No indicado'],
    ['CONCEPTO', payment.note || 'Abono al contrato'],
    ['TOTAL PAGADO', money_(payment.newPaid)],
    ['SALDO RESTANTE', money_(payment.newBalance)]
  ];
  const details = body.appendTable(rows);
  details.setBorderColor(DOCUMENT_THEME.line).setBorderWidth(0.7);
  details.setColumnWidth(0, 170).setColumnWidth(1, 346);
  rows.forEach((row, index) => {
    setCellText_(details.getCell(index, 0), row[0], {
      background: index % 2 === 0 ? DOCUMENT_THEME.goldSoft : DOCUMENT_THEME.paper,
      color: DOCUMENT_THEME.red,
      fontSize: 8,
      bold: true,
      paddingTop: 6,
      paddingBottom: 6
    });
    setCellText_(details.getCell(index, 1), row[1], {
      background: index % 2 === 0 ? DOCUMENT_THEME.white : DOCUMENT_THEME.paper,
      color: DOCUMENT_THEME.ink,
      fontSize: 9,
      bold: index >= 5,
      paddingTop: 6,
      paddingBottom: 6
    });
  });
  appendSpacer_(body, 6);

  const statusText = Number(payment.newBalance) === 0 ? 'PAGO LIQUIDADO' : `SALDO PENDIENTE  ${money_(payment.newBalance)}`;
  const status = body.appendTable([[statusText]]);
  status.setBorderColor(Number(payment.newBalance) === 0 ? DOCUMENT_THEME.green : DOCUMENT_THEME.gold).setBorderWidth(1);
  setCellText_(status.getCell(0, 0), statusText, {
    background: Number(payment.newBalance) === 0 ? '#ECFDF3' : DOCUMENT_THEME.goldSoft,
    color: Number(payment.newBalance) === 0 ? DOCUMENT_THEME.green : DOCUMENT_THEME.ink,
    fontSize: 11,
    bold: true,
    paddingTop: 7,
    paddingBottom: 7,
    align: DocumentApp.HorizontalAlignment.CENTER
  });

  styleText_(body.appendParagraph('Este recibo forma parte del historial de pagos y no sustituye el contrato original.'), {
    fontFamily: 'Arial', fontSize: 8, bold: false, color: DOCUMENT_THEME.muted,
    align: DocumentApp.HorizontalAlignment.CENTER, spacingBefore: 12, spacingAfter: 2
  });
  styleText_(body.appendParagraph('PLAZA REPRESO  |  ' + APP_CONFIG.VENUE_ADDRESS), {
    fontFamily: 'Arial', fontSize: 7, bold: true, color: DOCUMENT_THEME.ink,
    align: DocumentApp.HorizontalAlignment.CENTER, spacingBefore: 2, spacingAfter: 0
  });

  doc.saveAndClose();
  return exportDocumentToPdf_(doc, folder, `Recibo ${contract.contractNumber} - ${payment.date} - ${payment.id}.pdf`);
}
