# Configuración Google del propietario

## Recursos que crea el instalador

- Hoja `Plaza Represo - Base de datos`.
- Carpeta compartible `Plaza Represo - Contratos`.
- Carpeta privada `Plaza Represo - Identificaciones privadas`.
- Calendario `Eventos Plaza Represo`.
- Hojas internas: `Contratos`, `Clientes`, `Pagos`, `Auditoria`, `Usuarios` y `Configuracion`.

## Datos requeridos al instalar

- Correo Google del propietario.
- Correo Google del empleado de consulta.
- Confirmación de zona horaria `America/Hermosillo`.

## Publicación segura

1. Crear un proyecto de Google Apps Script en la cuenta del propietario.
2. Copiar `clasp.example.json` como `.clasp.json`, colocar el ID privado del proyecto y cargar el contenido de `src/`.
3. Ejecutar `setupSystem(ownerEmail, employeeEmail)` una vez.
4. Revisar los recursos creados antes de compartirlos.
5. Compartir la carpeta de contratos y el calendario con el empleado como lector.
6. No compartir la carpeta de identificaciones privadas.
7. Implementar la aplicación web para que se ejecute como el usuario que accede.
8. Probar primero con los datos ficticios de `samples/`.

La aplicación rechaza correos no incluidos en `Usuarios`. El empleado no recibe IDs, enlaces ni archivos de la INE desde las respuestas del servidor.
