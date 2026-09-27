/**
 * El modelo corporal del mapa muscular (ADR-018): dos siluetas, frente y
 * espalda, estilizadas y neutras en cuanto a sexo. Dibujadas en el proyecto,
 * sin anatomía realista: cada región lleva el identificador del catálogo base
 * al que pertenece. La mitad derecha es la izquierda reflejada.
 *
 * Generado desde un boceto de medio cuerpo; si se retoca a mano, que siga
 * cubriendo los dieciséis grupos (lo comprueba `rutas.test.ts`).
 */

export type Cara = 'frente' | 'espalda';

export interface Region {
  /** Identificador del grupo en el catálogo base («dorsal»). */
  readonly grupo: string;
  readonly lado: 'izquierdo' | 'derecho';
  readonly d: string;
  /** Posición en la secuencia de color, de arriba abajo. */
  readonly orden: number;
}

export const LIENZO = { ancho: 360, alto: 520 } as const;
export const CABEZA = { cx: 180, cy: 37, rx: 21, ry: 26 } as const;
export const SILUETA =
  'M 180 62 L 170 64 L 169 84 C 160 90 140 93 124 97 C 112 100 105 111 106 128 C 106 152 107 178 108 202 C 104 230 97 260 94 288 C 89 298 87 314 93 324 C 99 332 108 330 110 320 C 112 310 112 300 112 292 C 116 264 121 236 125 212 C 128 190 130 164 133 140 C 137 170 144 212 147 246 C 144 260 140 276 141 294 C 140 330 142 362 148 392 C 144 416 144 444 150 470 C 150 484 143 496 146 505 C 154 512 168 511 170 502 C 171 492 168 482 166 474 C 170 450 172 420 170 396 C 173 360 175 322 180 298 C 185 322 187 360 190 396 C 188 420 190 450 194 474 C 192 482 189 492 190 502 C 192 511 206 512 214 505 C 217 496 210 484 210 470 C 216 444 216 416 212 392 C 218 362 220 330 219 294 C 220 276 216 260 213 246 C 216 212 223 170 227 140 C 230 164 232 190 235 212 C 239 236 244 264 248 292 C 248 300 248 310 250 320 C 252 330 261 332 267 324 C 273 314 271 298 266 288 C 263 260 256 230 252 202 C 253 178 254 152 254 128 C 255 111 248 100 236 97 C 220 93 200 90 191 84 L 190 64 L 180 62 Z';
/** Línea de la columna en la cara de espalda: sólo trazo. */
export const COLUMNA = 'M 180 178 L 180 240';

export const REGIONES: Readonly<Record<Cara, readonly Region[]>> = {
  frente: [
    {
      grupo: 'trapecio',
      lado: 'izquierdo',
      orden: 0,
      d: 'M 170 86 C 162 90 150 94 136 97 C 148 99 160 98 172 95 C 172 92 171 89 170 86 Z',
    },
    {
      grupo: 'trapecio',
      lado: 'derecho',
      orden: 0,
      d: 'M 190 86 C 198 90 210 94 224 97 C 212 99 200 98 188 95 C 188 92 189 89 190 86 Z',
    },
    {
      grupo: 'deltoides-lateral',
      lado: 'izquierdo',
      orden: 2,
      d: 'M 122 100 C 113 104 108 112 108 126 C 110 134 114 140 120 144 C 122 132 122 120 124 108 C 124 104 123 101 122 100 Z',
    },
    {
      grupo: 'deltoides-lateral',
      lado: 'derecho',
      orden: 2,
      d: 'M 238 100 C 247 104 252 112 252 126 C 250 134 246 140 240 144 C 238 132 238 120 236 108 C 236 104 237 101 238 100 Z',
    },
    {
      grupo: 'deltoides-anterior',
      lado: 'izquierdo',
      orden: 3,
      d: 'M 135 103 C 129 103 124 107 122 114 C 122 125 125 135 131 143 C 133 143 135 142 138 139 C 134 128 134 116 137 106 Z',
    },
    {
      grupo: 'deltoides-anterior',
      lado: 'derecho',
      orden: 3,
      d: 'M 225 103 C 231 103 236 107 238 114 C 238 125 235 135 229 143 C 227 143 225 142 222 139 C 226 128 226 116 223 106 Z',
    },
    {
      grupo: 'pectoral',
      lado: 'izquierdo',
      orden: 1,
      d: 'M 178 100 C 164 96 148 98 138 106 C 135 117 136 130 140 141 C 150 155 165 161 178 158 Z',
    },
    {
      grupo: 'pectoral',
      lado: 'derecho',
      orden: 1,
      d: 'M 182 100 C 196 96 212 98 222 106 C 225 117 224 130 220 141 C 210 155 195 161 182 158 Z',
    },
    {
      grupo: 'biceps',
      lado: 'izquierdo',
      orden: 4,
      d: 'M 113 146 C 110 164 110 184 113 200 C 119 205 126 204 129 198 C 132 180 132 160 129 146 C 124 141 118 141 113 146 Z',
    },
    {
      grupo: 'biceps',
      lado: 'derecho',
      orden: 4,
      d: 'M 247 146 C 250 164 250 184 247 200 C 241 205 234 204 231 198 C 228 180 228 160 231 146 C 236 141 242 141 247 146 Z',
    },
    {
      grupo: 'abdomen',
      lado: 'izquierdo',
      orden: 5,
      d: 'M 144 156 C 149 172 153 192 153 216 C 153 232 154 244 156 250 C 150 246 147 238 145 226 C 141 204 140 178 144 156 Z',
    },
    {
      grupo: 'abdomen',
      lado: 'derecho',
      orden: 5,
      d: 'M 216 156 C 211 172 207 192 207 216 C 207 232 206 244 204 250 C 210 246 213 238 215 226 C 219 204 220 178 216 156 Z',
    },
    {
      grupo: 'abdomen',
      lado: 'izquierdo',
      orden: 6,
      d: 'M 158 162 C 166 164 173 166 178 166 L 178 250 C 171 252 164 250 158 246 C 155 224 155 188 158 162 Z',
    },
    {
      grupo: 'abdomen',
      lado: 'derecho',
      orden: 6,
      d: 'M 202 162 C 194 164 187 166 182 166 L 182 250 C 189 252 196 250 202 246 C 205 224 205 188 202 162 Z',
    },
    {
      grupo: 'antebrazo',
      lado: 'izquierdo',
      orden: 7,
      d: 'M 110 214 C 106 236 101 260 99 284 C 103 289 108 289 111 285 C 115 262 120 238 123 216 C 119 210 114 210 110 214 Z',
    },
    {
      grupo: 'antebrazo',
      lado: 'derecho',
      orden: 7,
      d: 'M 250 214 C 254 236 259 260 261 284 C 257 289 252 289 249 285 C 245 262 240 238 237 216 C 241 210 246 210 250 214 Z',
    },
    {
      grupo: 'cuadriceps',
      lado: 'izquierdo',
      orden: 8,
      d: 'M 148 292 C 144 320 144 352 150 384 C 157 390 164 390 168 385 C 170 352 170 322 168 296 C 161 291 154 290 148 292 Z',
    },
    {
      grupo: 'cuadriceps',
      lado: 'derecho',
      orden: 8,
      d: 'M 212 292 C 216 320 216 352 210 384 C 203 390 196 390 192 385 C 190 352 190 322 192 296 C 199 291 206 290 212 292 Z',
    },
    {
      grupo: 'aductores',
      lado: 'izquierdo',
      orden: 9,
      d: 'M 170 298 C 175 306 178 322 178 344 C 177 352 175 356 172 358 C 172 336 172 316 170 298 Z',
    },
    {
      grupo: 'aductores',
      lado: 'derecho',
      orden: 9,
      d: 'M 190 298 C 185 306 182 322 182 344 C 183 352 185 356 188 358 C 188 336 188 316 190 298 Z',
    },
    {
      grupo: 'gemelo',
      lado: 'izquierdo',
      orden: 10,
      d: 'M 147 404 C 144 422 144 446 148 464 C 151 467 154 467 156 463 C 154 442 154 422 155 404 Z',
    },
    {
      grupo: 'gemelo',
      lado: 'derecho',
      orden: 10,
      d: 'M 213 404 C 216 422 216 446 212 464 C 209 467 206 467 204 463 C 206 442 206 422 205 404 Z',
    },
  ],
  espalda: [
    {
      grupo: 'trapecio',
      lado: 'izquierdo',
      orden: 0,
      d: 'M 180 72 C 174 80 160 88 138 96 C 150 104 164 114 172 130 C 176 146 178 162 180 174 Z',
    },
    {
      grupo: 'trapecio',
      lado: 'derecho',
      orden: 0,
      d: 'M 180 72 C 186 80 200 88 222 96 C 210 104 196 114 188 130 C 184 146 182 162 180 174 Z',
    },
    {
      grupo: 'deltoides-lateral',
      lado: 'izquierdo',
      orden: 1,
      d: 'M 122 100 C 113 104 108 112 108 126 C 110 134 114 140 120 144 C 122 132 122 120 124 108 C 124 104 123 101 122 100 Z',
    },
    {
      grupo: 'deltoides-lateral',
      lado: 'derecho',
      orden: 1,
      d: 'M 238 100 C 247 104 252 112 252 126 C 250 134 246 140 240 144 C 238 132 238 120 236 108 C 236 104 237 101 238 100 Z',
    },
    {
      grupo: 'deltoides-posterior',
      lado: 'izquierdo',
      orden: 2,
      d: 'M 134 102 C 126 102 122 108 122 116 C 122 126 124 134 129 140 C 131 132 132 120 136 106 Z',
    },
    {
      grupo: 'deltoides-posterior',
      lado: 'derecho',
      orden: 2,
      d: 'M 226 102 C 234 102 238 108 238 116 C 238 126 236 134 231 140 C 229 132 228 120 224 106 Z',
    },
    {
      grupo: 'dorsal',
      lado: 'izquierdo',
      orden: 3,
      d: 'M 140 140 C 136 160 138 186 146 208 C 154 222 164 232 176 238 C 176 214 173 190 168 170 C 164 156 154 146 140 140 Z',
    },
    {
      grupo: 'dorsal',
      lado: 'derecho',
      orden: 3,
      d: 'M 220 140 C 224 160 222 186 214 208 C 206 222 196 232 184 238 C 184 214 187 190 192 170 C 196 156 206 146 220 140 Z',
    },
    {
      grupo: 'triceps',
      lado: 'izquierdo',
      orden: 4,
      d: 'M 113 146 C 110 164 110 184 113 200 C 119 205 126 204 129 198 C 132 180 132 160 129 146 C 124 141 118 141 113 146 Z',
    },
    {
      grupo: 'triceps',
      lado: 'derecho',
      orden: 4,
      d: 'M 247 146 C 250 164 250 184 247 200 C 241 205 234 204 231 198 C 228 180 228 160 231 146 C 236 141 242 141 247 146 Z',
    },
    {
      grupo: 'antebrazo',
      lado: 'izquierdo',
      orden: 5,
      d: 'M 110 214 C 106 236 101 260 99 284 C 103 289 108 289 111 285 C 115 262 120 238 123 216 C 119 210 114 210 110 214 Z',
    },
    {
      grupo: 'antebrazo',
      lado: 'derecho',
      orden: 5,
      d: 'M 250 214 C 254 236 259 260 261 284 C 257 289 252 289 249 285 C 245 262 240 238 237 216 C 241 210 246 210 250 214 Z',
    },
    {
      grupo: 'lumbares',
      lado: 'izquierdo',
      orden: 6,
      d: 'M 168 240 C 166 252 166 264 169 274 L 178 274 L 178 240 C 174 242 171 242 168 240 Z',
    },
    {
      grupo: 'lumbares',
      lado: 'derecho',
      orden: 6,
      d: 'M 192 240 C 194 252 194 264 191 274 L 182 274 L 182 240 C 186 242 189 242 192 240 Z',
    },
    {
      grupo: 'gluteo',
      lado: 'izquierdo',
      orden: 7,
      d: 'M 144 266 C 139 284 143 304 156 312 C 166 316 174 312 178 304 L 178 280 C 168 274 156 268 144 266 Z',
    },
    {
      grupo: 'gluteo',
      lado: 'derecho',
      orden: 7,
      d: 'M 216 266 C 221 284 217 304 204 312 C 194 316 186 312 182 304 L 182 280 C 192 274 204 268 216 266 Z',
    },
    {
      grupo: 'isquiosurales',
      lado: 'izquierdo',
      orden: 8,
      d: 'M 148 318 C 145 344 147 370 152 392 C 159 396 166 396 169 390 C 171 366 171 340 169 318 C 162 315 155 315 148 318 Z',
    },
    {
      grupo: 'isquiosurales',
      lado: 'derecho',
      orden: 8,
      d: 'M 212 318 C 215 344 213 370 208 392 C 201 396 194 396 191 390 C 189 366 189 340 191 318 C 198 315 205 315 212 318 Z',
    },
    {
      grupo: 'aductores',
      lado: 'izquierdo',
      orden: 9,
      d: 'M 171 318 C 175 330 177 344 177 360 C 175 364 173 364 171 362 C 172 346 172 332 171 318 Z',
    },
    {
      grupo: 'aductores',
      lado: 'derecho',
      orden: 9,
      d: 'M 189 318 C 185 330 183 344 183 360 C 185 364 187 364 189 362 C 188 346 188 332 189 318 Z',
    },
    {
      grupo: 'gemelo',
      lado: 'izquierdo',
      orden: 10,
      d: 'M 148 402 C 143 422 145 448 152 470 C 158 474 165 472 167 466 C 171 444 171 422 168 404 C 161 399 154 399 148 402 Z',
    },
    {
      grupo: 'gemelo',
      lado: 'derecho',
      orden: 10,
      d: 'M 212 402 C 217 422 215 448 208 470 C 202 474 195 472 193 466 C 189 444 189 422 192 404 C 199 399 206 399 212 402 Z',
    },
  ],
};

export type Vista = 'completo' | 'superior' | 'inferior';

/**
 * Encuadres: qué rectángulo del lienzo llena el panel en cada vista. Se anima
 * el `transform` del grupo (escala y desplazamiento), no el `viewBox`.
 */
export const ENCUADRES: Readonly<
  Record<Vista, { x: number; y: number; ancho: number; alto: number }>
> = {
  completo: { x: 0, y: 0, ancho: 360, alto: 520 },
  superior: { x: 68, y: 6, ancho: 224, alto: 300 },
  inferior: { x: 110, y: 250, ancho: 140, alto: 266 },
};

/** Matriz del encuadre: escala uniforme y centrado dentro del lienzo. */
export function matrizDeEncuadre(vista: Vista): { escala: number; x: number; y: number } {
  const r = ENCUADRES[vista];
  const escala = Math.min(LIENZO.ancho / r.ancho, LIENZO.alto / r.alto);
  return {
    escala,
    x: (LIENZO.ancho - r.ancho * escala) / 2 - r.x * escala,
    y: (LIENZO.alto - r.alto * escala) / 2 - r.y * escala,
  };
}
