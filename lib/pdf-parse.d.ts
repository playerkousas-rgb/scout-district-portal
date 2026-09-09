declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    numpages: number;
    text: string;
    info?: unknown;
    metadata?: unknown;
    version?: string;
  }
  function pdf(dataBuffer: Buffer | Uint8Array, options?: unknown): Promise<PdfParseResult>;
  export default pdf;
}
