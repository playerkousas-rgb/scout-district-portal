/** qrcode 套件內部表格（版本固定 1.5.3）：用嚟計每個 RS block 嘅容錯上限 */
declare module 'qrcode/lib/core/error-correction-code' {
  export function getBlocksCount(version: number, level: unknown): number;
  export function getTotalCodewordsCount(version: number, level: unknown): number;
}
declare module 'qrcode/lib/core/error-correction-level' {
  export const L: unknown;
  export const M: unknown;
  export const Q: unknown;
  export const H: unknown;
}
