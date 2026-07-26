import { MAX_PAYLOAD_BYTES, RATE_LIMIT_PER_MINUTE } from './app.constants';

describe('app.constants', () => {
  // Guard de regresion: centralizar los valores no debe alterar los limites
  // que la aplicacion ya aplicaba cuando estaban escritos en el codigo.

  it('conserva el limite de payload en 8 KB', () => {
    expect(MAX_PAYLOAD_BYTES).toBe(8 * 1024);
    expect(MAX_PAYLOAD_BYTES).toBe(8192);
  });

  it('conserva el limite de 30 solicitudes por minuto', () => {
    expect(RATE_LIMIT_PER_MINUTE).toBe(30);
  });
});
