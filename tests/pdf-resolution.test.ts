import { expect, it } from 'vitest';
import { pdfResolution } from '../src/pdf-resolution';

it('conserva la densidad nativa de pantallas de más de 2 píxeles por píxel CSS', () => {
  expect(pdfResolution(400, 600, 3)).toEqual({ ratio: 3, width: 1200, height: 1800 });
  expect(pdfResolution(400, 600, 2.625)).toEqual({ ratio: 2.625, width: 1050, height: 1575 });
});
it('acota memoria y dimensiones sin cambiar la proporción de una página grande', () => {
  const output = pdfResolution(3300, 4670, 4);
  expect(output.width * output.height).toBeLessThanOrEqual(2 ** 25);
  expect(output.width / output.height).toBeCloseTo(3300 / 4670, 3);
  expect(output.ratio).toBeLessThan(4);
  const narrow = pdfResolution(400, 20000, 3);
  expect(narrow.height).toBeLessThanOrEqual(8192);
});
it('permite ampliar la resolución al hacer zoom y tolera una densidad inválida', () => {
  expect(pdfResolution(400, 600, 6).width).toBe(2400);
  expect(pdfResolution(400, 600, Number.NaN).ratio).toBe(1);
});
