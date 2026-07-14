# Configuración Google del propietario

## Recursos que crea el instalador

- Hoja `Plaza Represo - Base de datos`.
- Carpeta compartible `Plaza Represo - Contratos`.
- Carpeta privada `Plaza Represo - Identificaciones privadas`.
- Calendario `Eventos Plaza Represo`.
- Hojas internas: `Contratos`, `Clientes`, `Pagos`, `Auditoria`, `Usuarios` y `Configuracion`.

## Datos requeridos al instalar

- Correo Google del propietario.
- Correo Google del empleado de consulta, si ya se conoce. Puede dejarse vacío y agregarse después desde **Accesos**.
- Confirmación de zona horaria `America/Hermosillo`.

## Publicación segura

1. Crear un proyecto de Google Apps Script en la cuenta del propietario.
2. Copiar `clasp.example.json` como `.clasp.json`, colocar el ID privado del proyecto y cargar el contenido de `src/`.
3. Ejecutar `setupSystem_(ownerEmail, employeeEmail)` una vez desde el editor de Apps Script. El guion bajo final evita que esta instalación pueda invocarse desde el navegador.
4. Revisar los recursos creados antes de compartirlos.
5. Abrir el panel como propietario, entrar a **Automatizaciones** e instalar la conciliación diaria.
6. Entrar a **Accesos** para agregar, retirar o restaurar correos de consulta. El sistema comparte automáticamente la base y la carpeta de contratos; la agenda se consulta desde el panel.
7. No compartir la carpeta de identificaciones privadas.
8. Implementar la aplicación web para que se ejecute como el usuario que accede.
9. Probar primero con los datos ficticios de `samples/`.
10. En **Automatizaciones**, importar el archivo privado de contratos anteriores y revisar el resumen antes de crear el siguiente contrato.

La automatización se ejecuta diariamente alrededor de las 08:00 en `America/Hermosillo`. Repara eventos faltantes o desactualizados, conserva cancelaciones y reporta contratos con saldo cuyo evento ocurre en siete días o menos. Puede ejecutarse manualmente desde el mismo panel para verificarla.

La aplicación rechaza correos no incluidos en `Usuarios`. El empleado no recibe IDs, enlaces ni archivos de la INE desde las respuestas del servidor.
