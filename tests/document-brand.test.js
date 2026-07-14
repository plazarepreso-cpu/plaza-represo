const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('src/DocumentService.gs', 'utf8');
const brandSource = fs.readFileSync('src/BrandAssets.gs', 'utf8');

const state = {
  logo: null,
  throwOnImage: false
};

class FakeText {
  setFontSize() { return this; }
  setBold() { return this; }
  setForegroundColor() { return this; }
  setFontFamily() { return this; }
}

class FakeImage {
  constructor(blob) {
    this.blob = blob;
    this.width = 1024;
    this.height = 190;
  }

  getWidth() { return this.width; }
  getHeight() { return this.height; }
  setWidth(value) { this.width = value; return this; }
  setHeight(value) { this.height = value; return this; }
}

class FakeParagraph {
  constructor(text) {
    this.text = String(text || '');
    this.images = [];
  }

  asParagraph() { return this; }
  editAsText() { return new FakeText(); }
  getText() { return this.text; }
  setText(value) { this.text = String(value || ''); return this; }
  setAlignment() { return this; }
  setSpacingBefore() { return this; }
  setSpacingAfter() { return this; }
  setLineSpacing() { return this; }
  appendInlineImage(blob) {
    if (state.throwOnImage) throw new Error('Archivo de imagen ficticio incompatible');
    const image = new FakeImage(blob);
    this.images.push(image);
    return image;
  }
}

class FakeCell {
  constructor() {
    this.children = [new FakeParagraph('')];
  }

  setBackgroundColor() { return this; }
  setPaddingTop() { return this; }
  setPaddingBottom() { return this; }
  setPaddingLeft() { return this; }
  setPaddingRight() { return this; }
  setVerticalAlignment() { return this; }
  clear() { this.children = []; return this; }
  getChild(index) { return this.children[index]; }
  appendParagraph(text) {
    const paragraph = new FakeParagraph(text);
    this.children.push(paragraph);
    return paragraph;
  }
}

class FakeTable {
  constructor() {
    this.cells = [[new FakeCell(), new FakeCell()]];
  }

  setBorderColor() { return this; }
  setBorderWidth() { return this; }
  setColumnWidth() { return this; }
  getCell(row, column) { return this.cells[row][column]; }
}

class FakeBody {
  constructor() { this.tables = []; }
  appendTable() {
    const table = new FakeTable();
    this.tables.push(table);
    return table;
  }
}

const context = vm.createContext({
  DocumentApp: {
    HorizontalAlignment: { LEFT: 'LEFT', CENTER: 'CENTER' },
    VerticalAlignment: { CENTER: 'CENTER' }
  },
  getPlazaRepresoBrandBlob_: () => state.logo
});
vm.runInContext(source, context);

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

function brandCellFor(body) {
  return body.tables[0].getCell(0, 0);
}

test('el encabezado usa el archivo maestro original de Plaza Represo', () => {
  state.logo = { id: 'logo-original-ficticio' };
  state.throwOnImage = false;
  const body = new FakeBody();
  context.appendBrandHeader_(body, 'CONTRATO No.', 'C.2626');

  const image = brandCellFor(body).children[0].images[0];
  assert.strictEqual(image.blob, state.logo);
  assert.strictEqual(image.width, 350, 'el logotipo conserva su proporción dentro del encabezado');
  assert.strictEqual(image.height, 65);
});

test('el mismo encabezado compartido alimenta contratos y recibos', () => {
  assert.match(
    source,
    /function buildContractDocument_[\s\S]*?appendBrandHeader_\(body, 'CONTRATO No\.', contract\.contractNumber\)/
  );
  assert.match(
    source,
    /function generateReceiptPdf_[\s\S]*?appendBrandHeader_\(body, 'RECIBO', contract\.contractNumber\)/
  );
});

test('si el logo no está disponible, el contrato conserva una marca visual imprimible', () => {
  state.logo = null;
  state.throwOnImage = false;
  const body = new FakeBody();
  context.appendBrandHeader_(body, 'RECIBO', 'C.2626');

  const labels = brandCellFor(body).children.map(paragraph => paragraph.text).join(' ');
  assert.match(labels, /PLAZA/);
  assert.match(labels, /REPRESO\s+EVENTOS/);
});

test('si el archivo maestro no se puede insertar, el recibo no falla y usa la marca alternativa', () => {
  state.logo = { id: 'logo-incompatible-ficticio' };
  state.throwOnImage = true;
  const body = new FakeBody();
  context.appendBrandHeader_(body, 'RECIBO', 'C.2626');

  const labels = brandCellFor(body).children.map(paragraph => paragraph.text).join(' ');
  assert.match(labels, /PLAZA/);
  assert.match(labels, /REPRESO\s+EVENTOS/);
});

test('la imagen maestra se obtiene desde la carpeta privada de contratos', () => {
  assert.match(brandSource, /PLAZA_REPRESO_BRAND_FILE_NAME = 'plaza-represo-logo-original\.jpg'/);
  assert.match(brandSource, /getFolderById\(rootId\)\.getFilesByName/);
});

test('la copia integrada corresponde exactamente al logo original de Plaza Represo', () => {
  const logoContext = vm.createContext({});
  vm.runInContext(`${brandSource}\nglobalThis.__embeddedLogo = PLAZA_REPRESO_EMBEDDED_LOGO_BASE64;`, logoContext);
  const embeddedLogo = Buffer.from(logoContext.__embeddedLogo, 'base64');
  const originalLogo = fs.readFileSync('assets/plaza-represo-logo-original.jpg');
  assert.deepStrictEqual(embeddedLogo, originalLogo);
});

test('el pie conserva el apartado y agradecimiento sin duplicar dirección ni capacidad', () => {
  const footerMatch = source.match(/function appendContractFooter_\([\s\S]*?\n}\n\nfunction buildContractDocument_/);
  assert.ok(footerMatch, 'el generador del pie debe existir');
  const footerSource = footerMatch[0];
  assert.match(footerSource, /SE APARTÓ CON LA CANTIDAD DE/);
  assert.match(footerSource, /PLAZA REPRESO AGRADECE SU PREFERENCIA/);
  assert.doesNotMatch(footerSource, /DIRECCIÓN DEL SALÓN|CAPACIDAD MÁXIMA|VENUE_ADDRESS|MAX_CAPACITY/);
});

console.log(`${passed} casos de marca en contratos y recibos verificados correctamente.`);
