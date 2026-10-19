declare module 'qrcode/lib/core/qrcode' {
  interface QrModules { size: number; data: Uint8Array }
  interface QrResult { modules: QrModules; maskPattern: number; version: number }
  const QRCodeCore: {
    create(text: string, opts?: { errorCorrectionLevel?: string; maskPattern?: number }): QrResult;
  };
  export = QRCodeCore;
}
