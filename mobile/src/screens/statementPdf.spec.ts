import { isEncrypted } from './statementPdf';

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
