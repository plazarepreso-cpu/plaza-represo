# Trabajo simultáneo en dos Macs

## Repartición

| Mac | Rama | Responsabilidad |
| --- | --- | --- |
| Hijo | `hijo-aplicacion` | Panel, base de datos, OCR y automatizaciones |
| Papá | `papa-contratos` | Contrato, cláusulas, recibos y pruebas visuales |

`main` contiene únicamente versiones revisadas.

## Primera conexión

1. El hijo crea el repositorio privado `plaza-represo` en GitHub.
2. El papá crea su propia cuenta gratuita y activa la verificación de correo.
3. El hijo invita la cuenta del papá como colaborador.
4. Cada Mac clona el repositorio con su propia cuenta.
5. En la Mac del hijo se cambia a `hijo-aplicacion`.
6. En la Mac del papá se cambia a `papa-contratos`.

Cada persona escribe personalmente su contraseña y códigos de verificación. No deben compartirse con Codex, guardarse en documentos ni enviarse por chat.

## Rutina de trabajo

1. Antes de empezar: actualizar `main` y después la rama propia.
2. Trabajar únicamente en el área asignada.
3. Ejecutar las pruebas.
4. Guardar un cambio pequeño y descriptivo.
5. Compartir la rama y solicitar revisión antes de integrarla a `main`.

No se deben colocar identificaciones reales, contraseñas, tokens, archivos `.clasp.json` ni credenciales de Google en GitHub.

## Primera prueba de sincronización

- La Mac del hijo comparte la base del proyecto.
- La Mac del papá la descarga, agrega una nota ficticia en su rama y la comparte.
- La Mac del hijo integra esa nota en `main`.
- Solo después de esta prueba se inicia el trabajo paralelo.

