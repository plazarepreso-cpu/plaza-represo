# Pruebas de aceptación

## Reglas automáticas

- Lunes a viernes calculan $3,500.
- Sábado y domingo calculan $4,500.
- El horario debe durar exactamente cinco horas, incluso si termina a medianoche.
- Una tarifa distinta requiere una explicación.
- El abono no puede superar el total y los pagos posteriores no pueden superar el saldo.
- Una fecha confirmada no puede reservarse nuevamente.
- Un contrato cancelado libera la fecha.
- La numeración comienza en C.2625 y se incrementa bajo bloqueo.

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

