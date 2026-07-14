# Pruebas de aceptación

## Reglas automáticas

Ejecuta `pnpm test` antes de compartir cambios. La suite usa exclusivamente nombres, teléfonos, domicilios e identificadores ficticios.

- Lunes a viernes calculan $3,500.
- Sábado y domingo calculan $4,500.
- El horario debe durar exactamente cinco horas, incluso si termina a medianoche.
- Una tarifa distinta requiere una explicación.
- El abono no puede superar el total y los pagos posteriores no pueden superar el saldo.
- Una fecha confirmada no puede reservarse nuevamente.
- Un contrato cancelado libera la fecha.
- La numeración comienza en C.2625 y se incrementa bajo bloqueo.
- Fechas inexistentes, horas fuera de rango e importes no finitos son rechazados.
- Los importes se normalizan a centavos para liquidar el saldo exactamente.
- Un `requestId` repetido no registra dos veces el mismo pago.
- El identificador de reintento sobrevive una recarga de la pestaña sin guardar el contenido del formulario.
- Reparar un contrato `ERROR` completa o reutiliza su recibo inicial sin volver a sumar el abono.
- Una identificación nueva no reemplaza la referencia histórica de contratos anteriores.

## Seguridad

- Un correo no autorizado no carga el panel.
- El rol `CONSULTA` no ve botones de modificación.
- El servidor rechaza toda modificación del rol `CONSULTA`, aunque se intente llamar directamente.
- Las respuestas de clientes solo incluyen `hasIne`; nunca incluyen `ineFileId`.
- La carpeta de INE permanece fuera de la carpeta compartida de contratos.

## Flujo completo

1. Crear un contrato ficticio de lunes y otro de sábado.
2. Confirmar PDF, carpeta, evento y tres recordatorios.
3. Registrar un segundo pago y revisar recibo, saldo y Calendar.
4. Cambiar la fecha y confirmar que no se duplique el evento.
5. Cancelar y comprobar que la fecha quede libre sin borrar el historial.
6. Abrir desde la cuenta del empleado y comprobar el modo de consulta.
7. Instalar dos veces la automatización y comprobar que quede un solo disparador diario.
8. Ejecutar la conciliación manual y comprobar eventos activos, cancelados y saldos próximos.

## Modo demostración y OCR

1. Restablecer el demo desde el aviso naranja.
2. Usar únicamente una tarjeta sintética marcada **FICTICIA / SIN VALIDEZ**.
3. Confirmar que OCR propone nombre y domicilio, pero no genera nada hasta marcar la revisión manual.
4. Crear, editar, pagar y cancelar contratos ficticios; recargar y revisar la persistencia local.
5. Confirmar que ninguna fotografía o `data:` URL queda guardada en `localStorage`.
