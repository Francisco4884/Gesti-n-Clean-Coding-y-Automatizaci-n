/**
 * Constantes de configuracion de la aplicacion.
 *
 * Centraliza los valores que antes estaban escritos directamente en el codigo,
 * para que su mantenimiento futuro se haga desde un unico lugar.
 */

/** Tamano maximo permitido para el payload de un evento (8 KB). */
export const MAX_PAYLOAD_BYTES = 8 * 1024;

/** Numero maximo de solicitudes permitidas por minuto (rate limiting). */
export const RATE_LIMIT_PER_MINUTE = 30;
