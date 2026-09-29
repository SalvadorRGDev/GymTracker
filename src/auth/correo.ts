/**
 * Qué correo se admite al crear una cuenta, por la web o con `npm run alta`.
 * Sólo ASCII sin comillas, espacios ni `<>`: un correo con marcado no debe
 * llegar al almacén aunque la página lo escape al pintarlo (auditoría ADR-020).
 * Se comprueba DESPUÉS de pasarlo a minúsculas.
 */
const CORREO = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})*\.[a-z]{2,63}$/;

export function esCorreoValido(correo: string): boolean {
  return correo.length <= 254 && CORREO.test(correo);
}
