/**
 * Límites de tasa en la memoria del proceso. Hay una sola instancia (ADR-011),
 * así que basta; si alguna vez hubiera dos, tendrían que persistir.
 *
 * Ventana fija por clave. La clave la decide quien llama: cuenta e IP para el
 * acceso, usuario para la exportación, huella de credencial para la captura.
 */
export class LimiteDeTasa {
  private readonly cubos = new Map<string, { inicio: number; cuenta: number }>();

  constructor(
    readonly maximo: number,
    readonly ventanaMs: number,
    private readonly reloj: () => number = Date.now,
  ) {}

  /** `null` si pasa; si no, los segundos hasta que vuelva a pasar. */
  consume(clave: string): number | null {
    const ahora = this.reloj();
    if (this.cubos.size > 10_000) this.poda(ahora);
    const cubo = this.cubos.get(clave);
    if (cubo === undefined || ahora - cubo.inicio >= this.ventanaMs) {
      this.cubos.set(clave, { inicio: ahora, cuenta: 1 });
      return null;
    }
    if (cubo.cuenta >= this.maximo) {
      return Math.max(1, Math.ceil((cubo.inicio + this.ventanaMs - ahora) / 1000));
    }
    cubo.cuenta += 1;
    return null;
  }

  private poda(ahora: number): void {
    for (const [clave, cubo] of this.cubos) {
      if (ahora - cubo.inicio >= this.ventanaMs) this.cubos.delete(clave);
    }
  }
}
