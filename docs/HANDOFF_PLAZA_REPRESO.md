# Entrega técnica — Plaza Represo

**Fecha de revisión:** 2026-07-21  
**Alcance:** inspección estática del repositorio. Este documento describe solamente comportamientos y configuraciones que se pueden verificar en los archivos versionados. No confirma el contenido real de la cuenta de Google, sus ACL vigentes, despliegues, ni datos de producción.

## 1. Propósito y funciones actuales

El repositorio implementa un panel web en español para un solo salón: **Plaza Represo**. Se publica como aplicación web de Google Apps Script y administra contratos, clientes, pagos, documentos y agenda.

Funciones comprobables:

- Alta, modificación, regeneración y cancelación de contratos (`src/ContractService.gs`).
- Numeración consecutiva de contratos, inicio configurado en `C.2626` (`src/Config.gs`, `src/Domain.gs`).
- Datos del cliente, evento, tarifa, abono inicial, saldo y una nota operativa (`src/index.html`, `src/Domain.gs`).
- OCR de una fotografía de INE en el navegador para proponer nombre y domicilio; exige revisión manual antes de generar (`src/index.html`).
- Resguardo de la imagen de INE en una carpeta privada de Drive (`src/ContractService.gs`).
- Generación de contrato y recibos en Google Docs, exportados a PDF en Drive (`src/DocumentService.gs`).
- Registro de abonos, liquidación, recibos, detección de duplicados técnicos y anulación auditada de un movimiento (`src/ContractService.gs`).
- Creación/actualización de eventos de Google Calendar y recordatorios (`src/CalendarService.gs`).
- Panel con inicio, nuevo contrato, agenda de próximos e histórico, contratos, pagos, clientes, accesos y automatizaciones para el propietario (`src/index.html`).
- Vista reducida para empleados: tarjetas de próximos eventos con cliente, horario, tipo, nota y saldo pendiente o liquidado; no se entregan contrato, INE, archivos ni datos internos (`src/ContractService.gs`, `src/TeamAgendaService.gs`, `src/index.html`).
- Indexación o importación de contratos anteriores y asociación de INE históricas (`src/HistoricalImportService.gs`, `src/HistoricalIneService.gs`, `src/FileIndexService.gs`).
- Conciliación diaria de contratos y agenda mediante un disparador de Apps Script (`src/AutomationService.gs`).
- Modo demostración local con datos ficticios cuando el HTML no se ejecuta dentro de Apps Script (`src/index.html`, `README.md`).

## 2. Arquitectura y responsabilidades por archivo

### Aplicación y backend

| Ruta | Responsabilidad comprobada |
| --- | --- |
| `src/appsscript.json` | Manifiesto Apps Script: V8, zona `America/Hermosillo`, aplicación web que se ejecuta como el usuario que accede y permisos OAuth declarados. |
| `src/Config.gs` | Constantes de Plaza Represo, encabezados de hojas, cláusulas, `doGet`, instalación `setupSystem_`, creación de recursos Google y consulta de información del sistema. |
| `src/Domain.gs` | Validación de fechas, horas, teléfono, importes y payloads; tarifas por día, duración, cálculo de saldos, nombre seguro de archivo y número consecutivo. |
| `src/Repository.gs` | Adaptador de Google Sheets: lectura, alta, actualización, sustitución, evolución de encabezados, configuración clave/valor y auditoría. También protege contra fórmulas introducidas como texto. |
| `src/Security.gs` | Identidad obtenida de `Session`, roles, lista segura de empleados en Script Properties y eliminación de `ineFileId` en objetos enviados al panel. |
| `src/ContractService.gs` | Fachada de operaciones del panel: bootstrap, contratos, pagos, anulación, histórico, cancelación, acceso de propietario a INE, clientes y carpetas de contrato. |
| `src/CalendarService.gs` | Calendario oficial, descripción/título de evento, recordatorios, sincronización de agenda e interpretación de eventos históricos de Calendar. |
| `src/TeamAgendaService.gs` | Caché sanitizada para empleados, calendario genérico de equipo, invitaciones, alta/retiro de acceso y migración desde permisos antiguos. |
| `src/AccessService.gs` | Alta, listado y retiro de correos de consulta; persiste el registro de usuarios y delega el acceso seguro de agenda. |
| `src/AutomationService.gs` | Instala un disparador diario a las 08:00, reconcilia contratos/eventos y calcula el conteo de saldos a siete días o menos. |
| `src/DocumentService.gs` | Construye contrato y recibo en Google Docs; aplica marca, tablas, cláusulas, importes y convierte a PDF. |
| `src/BrandAssets.gs` | Recupera el logotipo de Drive por nombre fijo y contiene una copia base64 de respaldo para documentos y el panel. |
| `src/FileIndexService.gs` | Busca y vincula contratos históricos existentes en Drive mediante puntuación de nombre/MIME; excluye INE, recibos y comprobantes. |
| `src/HistoricalImportService.gs` | Valida, indexa sin duplicar o importa contratos históricos; conserva saldos que ya recibieron pagos del sistema. |
| `src/HistoricalIneService.gs` | Importa o localiza imágenes históricas de INE, las mueve al resguardo privado y las asocia a cliente/contrato. |
| `src/index.html` | SPA HTML/CSS/JavaScript. Renderiza todas las vistas, invoca métodos de Apps Script con `google.script.run`, contiene demo local y OCR/ZIP en navegador. |

### Material de apoyo y artefactos

| Ruta | Contenido comprobado |
| --- | --- |
| `templates/CLAUSULAS.md` | Copia de las nueve cláusulas vigentes. |
| `templates/DISENO_VISUAL.md` | Reglas del diseño visual y matriz de casos ficticios de PDF. |
| `assets/plaza-represo-logo-original.jpg` y `.png` | Recursos de logotipo versionados. |
| `samples/contratos-ficticios.json` | Tres contratos ficticios para diseño/pruebas. |
| `scripts/generate_visual_examples.py` | Generador de ejemplos visuales en PDF con ReportLab. |
| `docs/CONFIGURACION_GOOGLE.md` | Guía de instalación en la cuenta del propietario. |
| `docs/DOS_MACS.md` | Convención de colaboración Git entre dos Macs. |
| `docs/PRUEBAS.md` | Pruebas de aceptación y de seguridad esperadas. |
| `outputs/` | Ejemplos de manual, contrato y recibo; son entregables, no fuente de producción. |
| `work/` y `tmp/` | Material local de generación/revisión; están ignorados por Git. |

## 3. Recursos de Google y permisos utilizados

### Apps Script

- Runtime V8 y zona horaria `America/Hermosillo` (`src/appsscript.json`).
- Aplicación web declarada con `access: "ANYONE"` y `executeAs: "USER_ACCESSING"`. Aun así, el backend exige que `Session.getActiveUser().getEmail()` produzca un correo autorizado (`src/appsscript.json`, `src/Security.gs`).
- El instalador debe correr desde el correo que se registra como propietario (`src/Config.gs`).
- Usa Script Properties para IDs de recursos, correo propietario, zona horaria, lista de empleados y caché de agenda (`src/Config.gs`, `src/Security.gs`, `src/TeamAgendaService.gs`).
- Usa Script Lock en instalación, contratos, pagos, acceso, histórico y automatizaciones para serializar operaciones (`src/Config.gs`, `src/ContractService.gs`, `src/AccessService.gs`, `src/HistoricalImportService.gs`, `src/HistoricalIneService.gs`, `src/AutomationService.gs`).
- Usa un disparador diario configurado a las 08:00 de la zona indicada (`src/AutomationService.gs`).

### Google Sheets

`setupSystem_` crea una hoja llamada **Plaza Represo - Base de datos** y crea/inicializa estas pestañas (`src/Config.gs`):

- `Contratos`
- `Clientes`
- `Pagos`
- `Agenda`
- `Historial`
- `Archivos`
- `Auditoria`
- `Usuarios`
- `Configuracion`

La aplicación lee y escribe las hojas completas mediante `getDataRange()` y operaciones por fila (`src/Repository.gs`).

### Google Drive y Google Docs

El instalador crea (`src/Config.gs`):

- **Plaza Represo - Contratos**: raíz para carpetas de contrato, documentos y PDFs.
- **Plaza Represo - Identificaciones privadas**: raíz separada para imágenes de INE.

Cada contrato administrado crea una carpeta por año y luego una subcarpeta con número, cliente y fecha del evento (`src/ContractService.gs`). El contrato y los recibos se generan como Google Docs, se mueven a esa carpeta y se exportan a PDF (`src/DocumentService.gs`).

### Google Calendar

El instalador crea (`src/Config.gs`):

- **Eventos Plaza Represo**, calendario oficial con datos del contrato en título/descripción.
- **Agenda de equipo — Plaza Represo**, calendario independiente con eventos genéricos para el equipo.

El calendario oficial contiene nombre de cliente, teléfono, tipo, nota, importes, enlace al PDF y la dirección del salón en cada evento (`src/CalendarService.gs`). Los recordatorios de popup intentan programarse a 7 días, 1 día y 4 horas, si aún están en el futuro y dentro del rango permitido por Calendar (`src/CalendarService.gs`).

El calendario de equipo genera eventos titulados solamente `Evento reservado`, sin descripción ni ubicación, e invita a los correos de consulta (`src/TeamAgendaService.gs`).

### Scopes OAuth declarados

`src/appsscript.json` declara: `userinfo.email`, Spreadsheets, Drive, Docs, Calendar y ScriptApp. Los scopes son amplios porque la aplicación crea/lee/modifica recursos de esos servicios.

## 4. Estructura de datos

Los encabezados son la fuente verificable del esquema actual: `SHEET_HEADERS` en `src/Config.gs`.

| Entidad / hoja | Campos principales |
| --- | --- |
| `Contratos` | IDs, `requestId`, número, versión, estado, fechas, horario, tipo, nota, cliente, INE, contacto, total/abono/pagado/saldo, motivo de tarifa especial, carpeta, PDF, evento de Calendar, usuarios de creación/edición y motivo de cancelación. |
| `Clientes` | `id`, nombre, domicilio, teléfono, `ineFileId`, creación y actualización. |
| `Pagos` | IDs, `requestId`, estado, contrato, fecha, importe, método, nota, recibo, autor, saldo posterior, mensaje de error y datos de anulación. |
| `Agenda` | Índice de eventos leídos desde Calendar: procedencia, número, cliente, contacto, evento, nota, fecha/horario, importes, estado y ubicación. |
| `Historial` | Contratos previos indexados/importados con información contractual y financiera. |
| `Archivos` | Vínculo entre contrato histórico y archivo existente de Drive. |
| `Auditoria` | Marca de tiempo, usuario, acción, entidad, ID y JSON de detalles. |
| `Usuarios` | Correo, rol y estado activo. |
| `Configuracion` | Pares clave/valor: siguiente número, tarifas, duración y recordatorios. |

Además, Script Properties conserva al menos IDs de Spreadsheet, carpetas, calendarios, propietario y zona horaria; la lista `TEAM_VIEWER_EMAILS` y la caché de agenda de equipo se guardan también allí (`src/Config.gs`, `src/Security.gs`, `src/TeamAgendaService.gs`).

La caché que se entrega a un empleado se reduce a: número de contrato, nombre de cliente, fecha/día, horas, tipo, nota, estado de pago y saldo pendiente. Excluye domicilio, teléfono, total, importe pagado, IDs, INE, URLs y archivos (`src/TeamAgendaService.gs`).

## 5. Reglas del negocio existentes

- Lunes a viernes usan tarifa predeterminada de **$3,500**; sábado y domingo, **$4,500**. Ambas se pueden cambiar en `Configuracion` (`src/Config.gs`, `src/Domain.gs`).
- Todo evento debe durar exactamente **5 horas**; se permite que termine al día siguiente (`src/Config.gs`, `src/Domain.gs`).
- La fecha del evento no puede ser anterior a la elaboración y debe ser una fecha ISO válida; horarios deben ser `HH:mm` válidos (`src/Domain.gs`).
- El contrato bloquea toda fecha que ya tenga otro contrato no cancelado. No hay disponibilidad por franja horaria: dos eventos distintos el mismo día se consideran ocupación (`src/Domain.gs`).
- Un total distinto de la tarifa automática requiere motivo de tarifa especial. El abono inicial no puede ser negativo ni superar el total (`src/Domain.gs`).
- Pagos posteriores deben ser positivos, no superar el saldo y solo se aceptan para contratos `CONFIRMADO` o `PAGADO` (`src/Domain.gs`).
- Los importes se redondean a centavos; los saldos se recalculan a partir del pago registrado (`src/Domain.gs`, `src/ContractService.gs`).
- El estado operativo usa, entre otros, `GENERANDO`, `ERROR`, `CONFIRMADO`, `PAGADO`, `CANCELADO`, `COMPLETADO` y `ANULADO` según la entidad (`src/ContractService.gs`, `src/index.html`).
- Un contrato pagado queda como `PAGADO` y se presenta como liquidado en el panel; uno con saldo queda `CONFIRMADO` (`src/ContractService.gs`, `src/index.html`).
- La creación y el pago aceptan `requestId` para evitar repetir una operación ante reintentos; los cambios de contrato verifican `expectedVersion` para evitar sobrescritura entre sesiones (`src/ContractService.gs`).
- Cancelar requiere motivo, conserva el registro, libera la fecha para futuras validaciones y marca el evento de Calendar como cancelado sin recordatorios (`src/ContractService.gs`, `src/CalendarService.gs`).
- El contrato contiene nueve cláusulas y texto contractual fijo; una cláusula exige liquidar siete días antes del evento (`src/Config.gs`, `templates/CLAUSULAS.md`).
- El historial puede indexarse sin crear archivos/eventos nuevos; la importación completa admite hasta 100 registros por ejecución y eleva el siguiente número si es necesario (`src/HistoricalImportService.gs`).

## 6. Elementos fijos de Plaza Represo

Los siguientes elementos impiden que el código sea genérico hoy:

- Nombre de aplicación, carpetas, calendarios y textos: `Plaza Represo`, `Eventos Plaza Represo`, `Agenda de equipo — Plaza Represo` y sus descripciones (`src/Config.gs`, `src/TeamAgendaService.gs`).
- Domicilio: **Ave. Tecnológico y Calle Cahitas No. 250, Col. Luis Donaldo Colosio, Nogales, Sonora** (`src/Config.gs`).
- Ciudad de la cabecera del contrato: **Nogales, Sonora** (`src/DocumentService.gs`).
- Capacidad de **100** personas, tarifas, duración, número inicial y cláusulas (`src/Config.gs`).
- Logo original identificado como `plaza-represo-logo-original.jpg`, recursos en `assets/` y respaldo base64 incrustado (`src/BrandAssets.gs`, `assets/`).
- Paleta negro/dorado/rojo y textos `PLAZA REPRESO`/`PLAZA REPRESO AGRADECE SU PREFERENCIA` en documentos (`src/DocumentService.gs`).
- La dirección vuelve a aparecer en el recibo (`src/DocumentService.gs`).
- Interfaz, textos, estados y formatos están escritos en español (`src/index.html`).
- La lógica de importación de Calendar identifica eventos de Plaza Represo mediante marca, número o la dirección Tecnológico/Cahitas (`src/CalendarService.gs`).

## 7. Seguridad, usuarios, roles y datos privados

### Autorización

- La identidad se obtiene con `Session.getActiveUser().getEmail()`; si no existe, el acceso se rechaza (`src/Security.gs`).
- Existe un propietario definido en Script Properties y el rol `CONSULTA` (`src/Config.gs`, `src/Security.gs`).
- Las operaciones que cambian datos invocan `requireOwner_` en el servidor. Ocultar controles en HTML no es la única barrera (`src/ContractService.gs`, `src/AccessService.gs`, `src/AutomationService.gs`).
- Los empleados activos se mantienen en `Usuarios` y, en el modo actual, la lista de autorización de agenda se mantiene además en Script Properties (`src/AccessService.gs`, `src/Security.gs`).

### Frontera de datos para empleados

- `getBootstrapData()` devuelve al empleado únicamente `viewerAgenda`; no devuelve contratos, clientes, pagos, histórico, archivos, usuarios, configuración, URLs internas, automatizaciones ni logo desde Drive (`src/ContractService.gs`, `tests/agenda-only-bootstrap.test.js`).
- La agenda del empleado se lee de Script Properties y no abre Sheets, Drive, Calendar oficial ni historial (`src/ContractService.gs`, `src/TeamAgendaService.gs`, `tests/agenda-only-bootstrap.test.js`).
- El HTML del empleado muestra tarjetas pasivas, sin abrir detalles, documento, INE, archivos ni edición (`src/index.html`).

### INE y datos sensibles

- Las INE admitidas son JPEG, PNG o WebP con límite de 5 MB; se guardan bajo la carpeta privada, separada de los contratos (`src/ContractService.gs`).
- Un `ineFileId` nunca se entrega en el objeto público de cliente/contrato; el propietario solicita una URL solamente después de verificar que el archivo pertenece al árbol de la carpeta privada (`src/Security.gs`, `src/ContractService.gs`).
- Domicilio y teléfono sí se guardan en Sheets y aparecen en el contrato; nombre, teléfono, importes y enlace al PDF aparecen en la descripción del calendario oficial (`src/Config.gs`, `src/CalendarService.gs`).

### Controles adicionales comprobados

- Validación de tipo, formato, longitud y monto en servidor (`src/Domain.gs`).
- Texto que inicia con `=`, `+`, `-` o `@` se escribe con apóstrofo para reducir inyección de fórmulas en Sheets (`src/Repository.gs`).
- Auditoría de acciones relevantes en la hoja `Auditoria` (`src/Repository.gs` y servicios). 
- Locks y `requestId` reducen colisiones y duplicados (`src/ContractService.gs`, `src/AccessService.gs`).

## 8. Pruebas existentes y ejecución

El comando principal es:

```bash
pnpm test
```

Está definido en `package.json` y ejecuta estas pruebas JavaScript con datos ficticios:

- Dominio: `tests/domain.test.js`
- Seguridad y bootstrap de empleado: `tests/security.test.js`, `tests/agenda-only-bootstrap.test.js`
- Agenda/equipo y Calendar: `tests/team-agenda.test.js`, `tests/calendar.test.js`
- Repositorio y accesos: `tests/repository.test.js`, `tests/access.test.js`
- Contratos, pagos y automatización: `tests/contract-service.test.js`, `tests/automation.test.js`
- Histórico, archivos e INE: `tests/historical-import.test.js`, `tests/file-index.test.js`, `tests/historical-ine.test.js`
- Documento/marca e interfaz: `tests/document-brand.test.js`, `tests/ui.test.js`

Existe una comprobación visual adicional, no incluida en `pnpm test`:

```bash
python3 tests/document_design_test.py
```

Esa prueba genera PDFs ficticios con `scripts/generate_visual_examples.py`, valida una página carta, las nueve cláusulas y texto/monedas. No invoca Google Apps Script ni `src/DocumentService.gs` para crear el PDF real (`tests/document_design_test.py`).

## 9. Decisiones relevantes registradas en el código

- **Apps Script y recursos Google como plataforma actual:** el repositorio está diseñado para una instalación en la cuenta del propietario, con Sheets/Drive/Calendar/Docs creados por `setupSystem_` (`src/Config.gs`, `docs/CONFIGURACION_GOOGLE.md`).
- **Separar INE de contratos:** la imagen se guarda fuera de la carpeta compartible de contratos y se verifica pertenencia de carpeta antes de mostrar URL (`src/ContractService.gs`, `docs/CONFIGURACION_GOOGLE.md`).
- **Agenda segura para equipo:** tras detectar que una cuenta de consulta no debe leer recursos privados, se agregó lista de correos y caché sanitizada en Script Properties. Esta caché permite mostrar nombre, horarios, notas y saldo sin abrir la base (`src/Security.gs`, `src/TeamAgendaService.gs`, `src/ContractService.gs`).
- **Calendario de equipo genérico:** los eventos invitados al equipo no llevan datos privados (`src/TeamAgendaService.gs`).
- **No sincronizar en lote el calendario de equipo después de cada cambio:** la función está deliberadamente vacía para no alcanzar límites temporales de Calendar; la vista de empleado se actualiza con la caché (`src/CalendarService.gs`).
- **Idempotencia y recuperación:** contratos/pagos conservan `requestId`, estados `GENERANDO`/`ERROR`, y existe reparación del recibo inicial para reintentos (`src/ContractService.gs`).
- **Histórico por índice antes de importación:** el modo de indexación no crea copias de contrato, recibo, carpeta ni evento; se evita duplicar recursos que ya viven en Drive/Calendar (`src/HistoricalImportService.gs`).
- **Marca con respaldo:** el documento intenta usar el archivo maestro en Drive y, si falla, usa el logo base64/fallback para no bloquear la impresión (`src/BrandAssets.gs`, `src/DocumentService.gs`).
- **OCR local en el navegador:** Tesseract se carga en el cliente y solo propone campos; el formulario exige confirmación/revisión humana antes de generar (`src/index.html`, `README.md`).
- **Colaboración por Git:** la documentación existente propone ramas separadas para panel y documentos, con `main` como versión revisada (`docs/DOS_MACS.md`).

## 10. Limitaciones, riesgos y trabajo pendiente comprobable

### Limitaciones funcionales y técnicas

- El modelo representa un solo salón y un solo propietario global. No existe entidad `empresa`, `tenant`, `venue` u organización en hojas, propiedades, carpetas, calendarios, usuarios o URLs (`src/Config.gs`, `src/Security.gs`, `src/Repository.gs`).
- La disponibilidad se bloquea por fecha completa, no por intervalos; no admite dos eventos no traslapados el mismo día ni múltiples salones (`src/Domain.gs`).
- Las consultas de Sheets cargan rangos completos y se filtran en memoria; no hay paginación ni índices de base de datos (`src/Repository.gs`).
- La agenda de empleado solo incluye eventos desde hoy y depende de la caché. La caché se actualiza cuando el propietario carga bootstrap y tras varias mutaciones; un despliegue/instalación sin carga de propietario puede dejarla vacía hasta refrescarse (`src/ContractService.gs`, `src/TeamAgendaService.gs`).
- El disparador diario cuenta saldos próximos, pero el código no envía un correo o notificación específica basada en ese conteo (`src/AutomationService.gs`).
- Los contratos cancelados no se modifican y las operaciones con estado incompleto pueden requerir reparación desde el panel (`src/ContractService.gs`).
- El contrato PDF real se genera con Google Docs. La prueba de diseño de una página usa otro renderizador (ReportLab), por lo que no garantiza visualmente el resultado de Apps Script (`src/DocumentService.gs`, `tests/document_design_test.py`).
- Los métodos de sincronización de agenda histórica dependen de patrones de texto de Calendar; los registros ambiguos o datos no etiquetados pueden requerir revisión manual (`src/CalendarService.gs`, `src/FileIndexService.gs`).

### Riesgos que deben validarse antes de producción SaaS

- El manifiesto declara web app accesible a `ANYONE`; la protección posterior depende de que Apps Script entregue el correo del usuario. Debe verificarse el modo de despliegue real y el comportamiento de `Session` en cada dominio/cuenta (`src/appsscript.json`, `src/Security.gs`).
- La operación real de los permisos de Drive/Sheets/Calendar y las ACL existentes no puede verificarse desde Git. El código intenta retirar recursos privados de empleados migrados, pero un fallo de Calendar queda como advertencia en Script Properties (`src/TeamAgendaService.gs`).
- INE, domicilio, teléfono y datos financieros son información sensible y viven en recursos Google del propietario. No se observa cifrado adicional a los controles de Google; para SaaS se requerirá definir retención, borrado, exportación, auditoría y base legal.
- El calendario oficial expone información contractual en su descripción a quien tenga acceso a ese calendario (`src/CalendarService.gs`).
- `src/index.html` carga Tesseract 5.1.1 y JSZip 3.10.1 desde jsDelivr sin atributo de integridad en las etiquetas observadas. Para SaaS debe definirse política de dependencias, disponibilidad y control de integridad (`src/index.html`).
- El archivo de marca contiene una copia base64 grande dentro del código. Para multiempresa no es escalable ni adecuado para marcas por cliente (`src/BrandAssets.gs`).
- La suite usa mocks de Apps Script; no hay prueba automatizada contra una cuenta/recurso Google aislado de integración (`tests/`).
- Los IDs reales de Apps Script se excluyen por `.gitignore`; Git no permite confirmar la configuración real ni el despliegue actual (`.gitignore`, `clasp.example.json`).

## 11. Archivos que probablemente cambiarán para hacerlo multiempresa

Esta lista es una estimación técnica basada en las dependencias actuales; no constituye una implementación todavía.

| Área | Rutas candidatas | Motivo |
| --- | --- | --- |
| Modelo de tenant, membresías y permisos | `src/Config.gs`, `src/Repository.gs`, `src/Security.gs`, `src/AccessService.gs` | Agregar organización/salón, propietario(s), empleados por organización y aislamiento de datos. |
| Configuración por salón | `src/Config.gs`, `src/Domain.gs`, `src/ContractService.gs` | Sustituir constantes globales de tarifas, horario, domicilio, capacidad, numeración y reglas por configuración tenant-scoped. |
| Datos y migración | `src/Config.gs`, `src/Repository.gs`, `src/HistoricalImportService.gs`, `src/FileIndexService.gs`, `src/HistoricalIneService.gs` | Añadir claves de empresa/salón, migrar registros existentes y evitar búsquedas globales entre clientes. |
| Archivos, INE y marca | `src/ContractService.gs`, `src/DocumentService.gs`, `src/BrandAssets.gs` | Carpetas aisladas, política de acceso/reten­ción y logos/documentos configurables por empresa. |
| Agenda y automatización | `src/CalendarService.gs`, `src/TeamAgendaService.gs`, `src/AutomationService.gs` | Calendarios, recordatorios, cachés y triggers por tenant; controlar cuotas de Apps Script/Calendar. |
| Interfaz | `src/index.html` | Selector/contexto de empresa, administración de miembros, branding y rutas sin datos globales. |
| Contratos y plantillas | `src/DocumentService.gs`, `templates/CLAUSULAS.md`, `templates/DISENO_VISUAL.md` | Plantillas, cláusulas, ciudad, idioma, logo y pie configurables por cada negocio. |
| Seguridad y plataforma | `src/appsscript.json`, `docs/CONFIGURACION_GOOGLE.md`, `README.md` | Reevaluar autenticación, aislamiento de tenant, scopes, despliegue, límites y operación SaaS. |
| Pruebas | `tests/*.js`, `tests/document_design_test.py`, `samples/contratos-ficticios.json` | Agregar pruebas de aislamiento entre empresas, autorización cruzada, migración y configuración por tenant. |

## 12. Estado de Git revisado

Al iniciar la revisión, el árbol de trabajo estaba limpio y la base revisada era:

```text
rama base: main...origin/main
commit revisado: 0cfd55c Igualar agenda del equipo sin detalles
```

Esta entrega se crea en la rama `docs/saas-handoff`, nacida de ese commit. La única modificación prevista en esta rama es este documento; no cambia el funcionamiento de la aplicación.

## Próximo paso recomendado

Antes de migrar código, decidir el límite del producto SaaS: si una empresa puede tener varios salones, qué usuarios administrativos existen, quién es dueño de los datos y qué datos personales se almacenarán. Esa decisión define si la siguiente base debe conservar Apps Script/Sheets o migrar a un backend con base de datos multi-tenant y autenticación centralizada.
