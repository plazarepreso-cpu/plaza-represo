# Plaza Represo - sistema unificado

Aplicación web gratuita para administrar clientes, contratos, pagos y agenda de Plaza Represo. Está preparada para desplegarse como Google Apps Script y para que dos Macs trabajen en paralelo mediante Git.

## Funciones incluidas

- Un solo panel adaptable a computadora y celular.
- Roles `PROPIETARIO` y `CONSULTA` validados también en el servidor.
- Captura de INE con OCR gratuito en el navegador y confirmación manual.
- Numeración automática desde `C.2625`.
- Tarifas automáticas: $3,500 entre semana y $4,500 sábado o domingo.
- Bloqueo de fechas ocupadas y validación de eventos de cinco horas.
- Contrato PDF, recibos, historial de pagos y saldo calculado.
- Agenda sincronizada con Google Calendar y recordatorios automáticos.
- Conciliación diaria reparable de eventos y aviso de contratos con saldo a siete días o menos.
- Identificaciones guardadas en una carpeta privada, separada de los contratos compartidos y con referencia histórica por contrato.
- Modo demostración local con información completamente ficticia.

## Estructura

- `src/`: aplicación y backend para Google Apps Script.
- `templates/`: texto contractual aprobado y plantilla visual de referencia.
- `samples/`: datos ficticios para pruebas.
- `tests/`: pruebas automáticas de reglas del negocio.
- `docs/`: configuración de las dos Macs y de Google.
- `outputs/`: ejemplos listos para revisar.

## Vista local

Abre `src/index.html` con un servidor local. Sin conexión a Apps Script, la aplicación usa datos ficticios guardados en el navegador. No cargues una INE real en el modo de demostración.

El modo demostración permite recorrer clientes, contratos, pagos, agenda, OCR y automatizaciones sin crear recursos de Google. Restablece sus datos desde el aviso naranja cuando quieras volver al escenario inicial.

## Publicación

La configuración final se realiza en la cuenta Google del propietario. Sigue [docs/CONFIGURACION_GOOGLE.md](docs/CONFIGURACION_GOOGLE.md), copia `clasp.example.json` como `.clasp.json` y conserva fuera del repositorio los IDs y credenciales privadas.
