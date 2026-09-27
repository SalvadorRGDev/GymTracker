# Riesgos

Ordenados por coste si ocurren. Cada uno con su **señal de detección**: un riesgo
sin señal se descubre cuando el histórico ya no es reconstruible.

| Id | Riesgo | Mitigación | Cómo nos enteraríamos |
| -- | ------ | ---------- | --------------------- |
| R1 | Captura perdida (cola del teléfono que envejece) | Archivo antes que red; `Sincronizar` dice cuántos quedan; automatizaciones | Frescura en el resumen («hace 9 días») y aviso en texto a partir de siete días |
| R2 | Aislamiento entre cuentas roto | Un libro por persona; `conAlmacenDeUsuario` única vía; filtro por propietario igualmente | Pruebas con dos propietarios, incluida una fila ajena colada que impide cargar |
| R11 | Credencial de captura filtrada | Credencial fuera del atajo; alcance acotado; 120/min; revocación inmediata | `ultimo_uso_en` en Dispositivos |
| R3 | Reloj del teléfono mal puesto | Fecha implausible (futura o de más de 14 días) entra **marcada** | El historial la señala y permite confirmar o borrar |
| R4 | Respaldo que no restaura | Restauración real con conteos, en cada push | `deploy/ensayo.sh` |
| R5 | Deriva entre el archivo y lo esperado (edición manual) | Celdas de texto; validación al cargar; columna u hoja desconocida detiene; no se pisa una edición ajena | Error con hoja, fila y columna; 409 al guardar |
| R6 | El umbral de RIR decidiendo el resultado | Vigilancia de la frontera (fase 3) | Aceptado y declarado hasta entonces |
| R7 | Atajo atascado en versión vieja | Versión en la ruta, crecimiento aditivo, 426 con URL en el cuerpo | Rechazos ruidosos |
| R8 | Servidor apagado | Cola del atajo; captura web; Tailscale; servicio de usuario con reinicio | El atajo aborta y conserva la cola |
| R9 | Mantenedor único | Seis dependencias de ejecución, lockfile, gitleaks, exportación abierta | Auditoría, calendario |
| R10 | Motor duplicado (una pantalla, un atajo o una hoja que suma) | Regla escrita; ningún cliente agrega; un solo servicio de escritura; el nivel del mapa lo decide el servidor | Pruebas de arquitectura y la del mapa que pinta el nivel del contrato aunque la cifra diga otra cosa |
| R12 | Una escala verde→rojo leída como nota | Rótulos de cantidad, cifra junto al color, leyenda explicada, sin relación con el rango del grupo (ADR-018) | Revisión de textos; prueba de rótulos |
