import { describe, expect, it } from 'vitest';
import { describeFile, folderList, inFolder, isScorePath, matches } from '../src/library';

const file = (name: string) => new File(['%PDF-1.7'], name, { lastModified: 123 });
describe('Búsqueda y organización de partituras', () => {
  it('encuentra fragmentos sin distinguir mayúsculas ni tildes', () => {
    const score = describeFile(file('Canción.pdf'), 'Música/Piano/Canción.pdf');
    expect(matches(score, 'NCIO')).toBe(true);
    expect(matches(score, 'musica/pia')).toBe(true);
    expect(matches(score, 'violín')).toBe(false);
  });
  it('trata signos de puntuación como caracteres literales', () => {
    const score = describeFile(file('Estudio [1]+.pdf'));
    expect(matches(score, '[1]+')).toBe(true);
    expect(matches(score, '.*')).toBe(false);
  });
  it('conserva subcarpetas y evita confundir rutas con el mismo prefijo', () => {
    const score = describeFile(file('Sonata.pdf'), 'Repertorio/Piano/Sonata.pdf');
    expect(folderList([score])).toEqual(['Repertorio', 'Repertorio/Piano']);
    expect(inFolder(score, 'Repertorio')).toBe(true);
    expect(inFolder(score, 'Reper')).toBe(false);
  });
  it('permite archivos individuales y evita colisiones entre carpetas', () => {
    const a = describeFile(file('Sonata.pdf'));
    const b = describeFile(file('Sonata.pdf'), 'Piano/Sonata.pdf');
    expect(a.folder).toBe('Importados');
    expect(a.id).not.toBe(b.id);
  });
  it('excluye papelera, archivos ocultos y metadatos sin ocultar partituras normales', () => {
    for (const path of [
      'Música/.trashed-123-Sonata.pdf',
      'Música/.pending-123-Sonata.pdf',
      'Música/._Sonata.pdf',
      'Música/.Trash/Sonata.pdf',
      'Música/__MACOSX/Sonata.pdf',
      'Música/$RECYCLE.BIN/Sonata.pdf',
      'Música/~$Sonata.pdf',
      'Música/nota.txt',
    ])
      expect(isScorePath(path)).toBe(false);
    expect(isScorePath('Música/1. Sonata.PDF')).toBe(true);
    expect(isScorePath('Música/Trasher.pdf')).toBe(true);
  });
});
