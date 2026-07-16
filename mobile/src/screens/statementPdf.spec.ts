import { isEncrypted, base64ToBytes } from './statementPdf';

const bytes = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'));

describe('isEncrypted', () => {
  it('true when the trailer references /Encrypt', () => {
    expect(isEncrypted(bytes('%PDF-1.6 ... << /Root 1 0 R /Encrypt 9 0 R >> %%EOF'))).toBe(true);
  });
  it('false for a plain PDF', () => {
    expect(isEncrypted(bytes('%PDF-1.6 ... << /Root 1 0 R /Size 10 >> %%EOF'))).toBe(false);
  });
  it('false for non-PDF bytes', () => {
    expect(isEncrypted(bytes('hello'))).toBe(false);
  });
});

describe('base64ToBytes', () => {
  it('decodes with no padding (3-byte group)', () => {
    // 'TWFu' -> 'Man'
    expect(Array.from(base64ToBytes('TWFu'))).toEqual([0x4d, 0x61, 0x6e]);
  });
  it('decodes with single "=" padding (2 bytes)', () => {
    // 'TWE=' -> 'Ma'
    expect(Array.from(base64ToBytes('TWE='))).toEqual([0x4d, 0x61]);
  });
  it('decodes with double "==" padding (1 byte)', () => {
    // 'TQ==' -> 'M'
    expect(Array.from(base64ToBytes('TQ=='))).toEqual([0x4d]);
  });
  it('ignores embedded whitespace/newlines', () => {
    expect(Array.from(base64ToBytes('TW\nFu'))).toEqual([0x4d, 0x61, 0x6e]);
  });
});
