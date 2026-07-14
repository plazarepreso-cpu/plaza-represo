# Diseño visual aprobado para pruebas

## Dirección gráfica

- Formato carta vertical de una sola página.
- Identidad principal en negro carbón, dorado cálido y rojo como acento.
- Encabezado compacto para dar más espacio a la información contractual.
- Tres tarjetas equilibradas para evento, cliente y pagos.
- Montos y estado de cuenta visibles sin competir con las cláusulas.
- Nueve cláusulas completas, numeradas y con separación suficiente para leerlas al imprimir.
- Franja inferior destacada para la cantidad del apartado.
- Pie de página con dirección y capacidad del salón.

## Reglas del contrato

- No se eliminan ni se resumen cláusulas.
- No se usan fotografías de identificaciones en el contrato.
- Los ejemplos del repositorio contienen únicamente datos ficticios.
- Total, abono, saldo y cantidad apartada deben coincidir.
- Fechas y horarios se presentan en español y en formato fácil de leer.

## Reglas del recibo

- La cantidad recibida es el elemento principal.
- Incluye contrato, cliente, fecha, método, concepto, total pagado y saldo restante.
- Muestra claramente si el pago liquidó el contrato o dejó saldo pendiente.
- Cada recibo conserva un folio visible y forma parte del historial del contrato.

## Matriz de pruebas ficticias

- `C.2625`: tarifa de fin de semana y saldo pendiente.
- `C.2626`: tarifa entre semana y contrato pagado.
- `C.2627`: nombre, domicilio y tipo de evento largos para verificar saltos de línea.
- Recibo de liquidación con saldo en cero.
- Recibo de abono posterior con saldo pendiente.

La comprobación automatizada se ejecuta con:

```bash
python3 tests/document_design_test.py
```

La prueba exige una sola página tamaño carta, las nueve cláusulas completas y todos los datos y montos ficticios visibles.
