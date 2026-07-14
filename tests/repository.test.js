const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function copy(value) {
  return Array.from(value, row => Array.from(row));
}

class FakeSheet {
  constructor(values) {
    this.values = copy(values);
    this.valueWrites = [];
    this.formatOperations = [];
  }

  getLastColumn() {
    return this.values[0] ? this.values[0].length : 0;
  }

  getLastRow() {
    return this.values.length;
  }

  getDataRange() {
    return { getValues: () => copy(this.values) };
  }

  getRange(row, column, rowCount, columnCount) {
    const sheet = this;
    const range = {
      getValues() {
        const rows = [];
        for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
          const source = sheet.values[row - 1 + rowOffset] || [];
          rows.push(source.slice(column - 1, column - 1 + columnCount));
        }
        return rows;
      },
      setValues(nextValues) {
        sheet.valueWrites.push({
          row,
          column,
          rowCount,
          columnCount,
          values: copy(nextValues)
        });
        for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
          const targetIndex = row - 1 + rowOffset;
          if (!sheet.values[targetIndex]) sheet.values[targetIndex] = [];
          for (let columnOffset = 0; columnOffset < columnCount; columnOffset += 1) {
            sheet.values[targetIndex][column - 1 + columnOffset] = nextValues[rowOffset][columnOffset];
          }
        }
        return range;
      },
      setFontWeight(value) {
        sheet.formatOperations.push(['fontWeight', value]);
        return range;
      },
      setBackground(value) {
        sheet.formatOperations.push(['background', value]);
        return range;
      },
      setFontColor(value) {
        sheet.formatOperations.push(['fontColor', value]);
        return range;
      }
    };
    return range;
  }
}

const sheets = {
  Clientes: new FakeSheet([
    ['id', 'name', 'note', 'version'],
    ['cliente-ficticio-001', 'Nombre anterior', 'Conservar este texto', 1]
  ]),
  Contratos: new FakeSheet([
    ['id', 'status'],
    ['contrato-ficticio-001', 'CONFIRMADO']
  ])
};

const context = vm.createContext({
  APP_CONFIG: { TIME_ZONE: 'America/Hermosillo' },
  SHEET_HEADERS: {
    Contratos: ['id', 'status', 'requestId', 'version']
  },
  Utilities: { formatDate: value => value.toISOString() },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: key => key === 'SPREADSHEET_ID' ? 'hoja-calculo-ficticia' : null
    })
  },
  SpreadsheetApp: {
    openById: spreadsheetId => {
      assert.strictEqual(spreadsheetId, 'hoja-calculo-ficticia');
      return {
        getSheetByName(sheetName) {
          if (!sheets[sheetName]) throw new Error(`Hoja ficticia no disponible: ${sheetName}`);
          return sheets[sheetName];
        }
      };
    }
  }
});

vm.runInContext(fs.readFileSync('src/Repository.gs', 'utf8'), context);

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

test('neutraliza todos los prefijos que Sheets podría interpretar como fórmula', () => {
  ['=SUM(A1:A2)', '+1+1', '-2+3', '@IMPORTXML("x")'].forEach(value => {
    assert.strictEqual(context.normalizeSheetWriteValue_(value), `'${value}`);
  });
  assert.strictEqual(context.normalizeSheetWriteValue_('Texto ficticio seguro'), 'Texto ficticio seguro');
  assert.strictEqual(context.normalizeSheetWriteValue_(42), 42);
});

test('appendObject aplica el esquema de encabezados y neutraliza fórmulas', () => {
  const sheet = sheets.Clientes;
  const previousWrites = sheet.valueWrites.length;
  context.appendObject_('Clientes', {
    id: 'cliente-ficticio-002',
    name: '=HYPERLINK("https://invalid.example","ficticio")',
    note: '@dato-ficticio',
    version: 1,
    ignored: 'no debe crear una columna'
  });

  assert.strictEqual(sheet.valueWrites.length, previousWrites + 1);
  assert.deepStrictEqual(sheet.valueWrites.at(-1).values, [[
    'cliente-ficticio-002',
    '\'=HYPERLINK("https://invalid.example","ficticio")',
    "'@dato-ficticio",
    1
  ]]);
});

test('updateObject conserva el esquema y actualiza la fila en una sola escritura', () => {
  const sheet = sheets.Clientes;
  const previousWrites = sheet.valueWrites.length;
  const saved = context.updateObject_('Clientes', 'id', 'cliente-ficticio-001', {
    name: '=2+2',
    version: 2,
    extra: 'esta propiedad no pertenece al esquema'
  });

  assert.strictEqual(sheet.valueWrites.length, previousWrites + 1);
  const write = sheet.valueWrites.at(-1);
  assert.deepStrictEqual(
    { row: write.row, column: write.column, rowCount: write.rowCount, columnCount: write.columnCount },
    { row: 2, column: 1, rowCount: 1, columnCount: 4 }
  );
  assert.deepStrictEqual(write.values, [[
    'cliente-ficticio-001',
    "'=2+2",
    'Conservar este texto',
    2
  ]]);
  assert.strictEqual(saved.note, 'Conservar este texto');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(saved, 'extra'), false);
});

test('ensureSchema agrega únicamente encabezados faltantes en una escritura', () => {
  const sheet = sheets.Contratos;
  const changes = JSON.parse(JSON.stringify(context.ensureSchema_()));

  assert.deepStrictEqual(changes, { Contratos: ['requestId', 'version'] });
  assert.strictEqual(sheet.valueWrites.length, 1);
  assert.deepStrictEqual(sheet.valueWrites[0], {
    row: 1,
    column: 3,
    rowCount: 1,
    columnCount: 2,
    values: [['requestId', 'version']]
  });
  assert.deepStrictEqual(sheet.values[0], ['id', 'status', 'requestId', 'version']);
});

console.log(`${passed} casos de repositorio verificados correctamente.`);
