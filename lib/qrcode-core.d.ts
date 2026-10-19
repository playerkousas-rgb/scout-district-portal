/**
 * qrcode 套件嘅核心 API（只用 create()）。
 * 官方冇出型別，呢個係我們實際用到嘅最小介面。
 */
declare module 'qrcode/lib/core/qrcode' {
  export interface QrModules { size: number; data: Uint8Array }
  export interface QrResult { modules: QrModules; maskPattern: number; version: number }
  const QRCodeCore: {
    create(
      text: string,
      opts?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; maskPattern?: number },
    ): QrResult;
  };
  export default QRCodeCore;
}
