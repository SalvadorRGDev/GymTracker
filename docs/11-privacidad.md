# Aviso de privacidad

Qué guarda GymTracker, dónde y cómo se borra. Son datos personales sensibles bajo la
LFPDPPP (México): peso corporal e historial de entrenamiento.

- **Responsable**: quien opera el servidor (la máquina donde corre GymTracker).
- **Qué se guarda**: correo, huella Argon2id de la contraseña, zona horaria,
  huellas de las credenciales, y el entrenamiento (sesiones, series, peso,
  planes, parámetros).
- **Dónde**: sólo en la máquina del responsable, en libros de Excel
  (`DATOS_DIR`). No hay terceros: ni nube, ni analítica, ni fuentes externas. No
  hay cifrado de aplicación: un `.xlsx` copiado a otro sitio va en claro.
- **Acceso y portabilidad**: la exportación JSON desde la web (Dispositivos).
- **Rectificación**: borrar una serie o sesión desde el historial, o pedirlo al
  responsable.
- **Cancelación (baja)**: el responsable ejecuta `npm run baja -- <correo>`. Borra
  **en el acto** el libro, las filas de `cuentas.xlsx` y todas las copias
  automáticas de `DATOS_DIR/respaldos` que llevan esos datos (las de
  `cuentas.xlsx` se rehacen sin ellos).
- **Plazo efectivo de borrado**: los respaldos completos sacados con
  `deploy/respaldo.sh` están fuera del servidor y conservan los datos hasta que el
  responsable los borre o caduquen en su rotación. Ese es el plazo máximo real.
