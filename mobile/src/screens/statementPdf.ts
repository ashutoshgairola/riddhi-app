// On-device statement PDF handling. Unencrypted PDFs upload raw base64 bytes
// (best fidelity, Claude document block); encrypted PDFs are opened locally
// with pdfjs-dist and their *text* is uploaded instead, so the password never
// leaves the device. See plan Task 4 for the Hermes feasibility caveats and
// the server-side-decrypt fallback if the on-device path proves infeasible.
//
// pdfjs-dist is loaded lazily — via a dynamic `import()` inside `extractText`
// — rather than a top-level import. Reason: the mobile jest harness runs pure
// TS specs (this file's `isEncrypted` cases included) under `ts-jest` on
// `testEnvironment: node` (see mobile/jest.config.js). A static top-level
// `import ... from 'pdfjs-dist/...'` would drag the whole pdfjs-dist package
// into that node environment just to test a string-scanning helper, and
// pdfjs-dist's browser/worker-oriented code is not guaranteed to load cleanly
// there. Keeping `isEncrypted` (and every other export's import-time surface)
// free of pdfjs lets the unit test exercise real logic without mocking.
//
// Runtime note: the exact pdfjs-dist entry point, worker configuration (RN/
// Hermes has no Worker thread to hand it), and any Hermes-specific polyfills
// (e.g. `Promise.withResolvers`) are DEVICE-VERIFIED IN TASK 10 — they cannot
// be exercised in this sandbox. `extractText`/`prepareUpload`'s pdfjs-backed
// paths are implemented against the installed pdfjs-dist API (v6, see
// mobile/package.json) but not run end-to-end here.

export class PdfPasswordError extends Error {
  constructor(message = 'PDF password required or incorrect') {
    super(message);
    this.name = 'PdfPasswordError';
  }
}

export type PreparedUpload = { pdf: string } | { text: string };

/**
 * A PDF is encrypted iff its trailer references an /Encrypt object. Scan only
 * the last 4KB (where the trailer conventionally lives) to avoid false
 * positives from the literal bytes "/Encrypt" appearing inside compressed
 * stream data earlier in the file.
 */
export function isEncrypted(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  const head = latin1Decode(bytes.subarray(0, 5));
  if (!head.startsWith('%PDF-')) return false;
  const tail = latin1Decode(bytes.subarray(Math.max(0, bytes.length - 4096)));
  return /\/Encrypt\b/.test(tail);
}

/**
 * Open an (encrypted) PDF with the given password and concatenate the text of
 * every page. Throws `PdfPasswordError` when a password is required but
 * missing, or wrong.
 *
 * pdfjs-dist is imported dynamically here — see the module doc comment above.
 */
export async function extractText(bytes: Uint8Array, password?: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { getDocument, PasswordException, GlobalWorkerOptions, VerbosityLevel } = pdfjs;

  // RN/Hermes has no Worker thread for pdfjs to offload parsing to; pointing
  // workerSrc at an empty string is a placeholder to force the main-thread
  // ("fake worker") fallback pdfjs uses when no real worker is reachable.
  // Whether that fallback actually works under Hermes (or needs an explicit
  // no-op worker port / polyfill instead) is confirmed on-device in Task 10.
  GlobalWorkerOptions.workerSrc = '';

  try {
    const doc = await getDocument({ data: bytes, password, verbosity: VerbosityLevel.ERRORS }).promise;
    let out = '';
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      out += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n';
    }
    return out.trim();
  } catch (e) {
    if (e instanceof PasswordException) throw new PdfPasswordError();
    throw e;
  }
}

/**
 * Decide the upload shape from raw base64 PDF bytes. Unencrypted → `{ pdf }`
 * (raw bytes, unchanged); encrypted → decrypt + extract text locally and
 * return `{ text }`, so the password is used only on-device. `password` is
 * required for the encrypted case — the caller prompts and retries on a
 * thrown `PdfPasswordError`.
 */
export async function prepareUpload(base64: string, password?: string): Promise<PreparedUpload> {
  const bytes = base64ToBytes(base64);
  if (!isEncrypted(bytes)) return { pdf: base64 };
  const text = await extractText(bytes, password);
  return { text };
}

/**
 * Decode a byte range as latin1/binary text. Safe for scanning PDF structure
 * bytes (trailers/dictionaries are ASCII) — not for the PDF's actual content
 * streams. Chunked to avoid exceeding the engine's max call-argument count on
 * `String.fromCharCode(...bytes)` for large ranges.
 */
function latin1Decode(bytes: Uint8Array): string {
  const CHUNK = 0x2000;
  let out = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

// Standard base64 alphabet → 6-bit value lookup, built once at module load.
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64_CHARS.length; i++) B64_LOOKUP[B64_CHARS[i]] = i;

/**
 * Base64 → bytes without relying on a `Buffer`/`atob` global. Neither is
 * available in RN/Hermes without a polyfill, and there's no existing
 * base64-decode pattern elsewhere in the app to reuse (base64 strings from
 * expo-image-picker etc. are currently passed straight through to the
 * backend, never decoded on-device — see mobile/src/screens/Chat.tsx and
 * mobile/src/app/AddTxSheet.tsx). This bit-buffer decoder is self-contained
 * and behaves identically in the node test environment and on-device.
 */
function base64ToBytes(base64: string): Uint8Array {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < base64.length; i++) {
    const ch = base64[i];
    if (ch === '=') break;
    const value = B64_LOOKUP[ch];
    if (value === undefined) continue; // skip whitespace/newlines etc.
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}
