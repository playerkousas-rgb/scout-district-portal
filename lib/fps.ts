// ── 轉數快（FPS）QR payload — 香港 Common QR Code 規格（HKICL） ─────────────
// 由 /fps 卡片抽出成共用模組，訓練班管理（每班收費 QR）同樣使用。
//
// FPS ID 放在 tag 26 的子欄 02；港幣是 tag 53 = 344；銀碼是 tag 54。
// CRC 是 CRC-16/CCITT（poly 0x1021, init 0xFFFF, 無反轉、無 xorout），
// 計算範圍 = 全部內容 + "6304"（CRC 欄頭）。

export const DEFAULT_FPS_ACCOUNT = {
  name: 'SCOUT ASSOCIATION OF HONG KONG - SHAU KEI WAN DISTRICT',
  id: '102866183',
};

export const FPS_ID_PATTERN = /^\d{7,9}$/;
export const SAFE_REFERENCE_PATTERN = /^[A-Za-z0-9 ._:/@+()\-]*$/;
export const FPS_REFERENCE_MAX = 25;

export type InputCheck = { value: string; error: string };

export function tlv(id: string, value: string): string {
  if (value.length > 99) throw new Error(`QR 欄位 ${id} 過長`);
  return id + String(value.length).padStart(2, '0') + value;
}

export function crc16(value: string): string {
  let crc = 0xffff;
  for (let i = 0; i < value.length; i++) {
    crc ^= value.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** 組出 FPS QR 內容字串。amount 留空 = 靜態 QR（付款人自行輸入銀碼）。 */
export function buildFpsPayload(fpsId: string, amount: string, reference: string): string {
  let payload = '';
  payload += tlv('00', '01'); // Payload Format Indicator
  payload += tlv('01', amount ? '12' : '11'); // 12 = 固定銀碼；11 = 付款人輸入銀碼
  payload += tlv('26', tlv('00', 'hk.com.hkicl') + tlv('02', fpsId));
  payload += tlv('52', '0000'); // Merchant Category Code（FPS dummy code）
  payload += tlv('53', '344'); // HKD；無論是否固定銀碼均為必要欄位
  if (amount) payload += tlv('54', amount);
  payload += tlv('58', 'HK');
  payload += tlv('59', 'NA'); // FPS 規格的 merchant name dummy value
  payload += tlv('60', 'HK');
  if (reference) payload += tlv('62', tlv('05', reference)); // Reference Label
  return payload + '6304' + crc16(payload + '6304');
}

export function checkAmount(rawAmount: string | number | undefined | null): InputCheck {
  const value = String(rawAmount ?? '').trim();
  if (!value) return { value: '', error: '' };
  if (value.length > 13) return { value, error: '銀碼最多可有 13 個字元。' };
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) {
    return { value, error: '銀碼格式不正確：請輸入正數，最多 2 位小數（例：100 或 100.50）。' };
  }
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
    return { value, error: '銀碼必須大於 0。' };
  }
  return { value, error: '' };
}

export function checkReference(rawReference: string | undefined | null): InputCheck {
  const value = String(rawReference ?? '').trim();
  if (!value) return { value: '', error: '' };
  if (value.length > FPS_REFERENCE_MAX) return { value, error: `參考編號最多可有 ${FPS_REFERENCE_MAX} 個字元。` };
  if (!SAFE_REFERENCE_PATTERN.test(value)) {
    return { value, error: '參考編號請只用英文、數字、空格及常用符號。' };
  }
  return { value, error: '' };
}

/**
 * 由任意文字（例如課程編號 SKW-CUB-2026-01 或 courseId）整理成合規嘅 FPS 參考編號：
 * 只保留英數及常用符號、去多餘空格、限長。
 */
export function sanitizeReference(raw: string | undefined | null): string {
  const cleaned = String(raw ?? '')
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9 ._:/@+()\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, FPS_REFERENCE_MAX).trim();
}

/** Google Sheet 純數字儲存格會以 number 回傳，統一轉字串再 trim。 */
export function normalizeFpsId(raw: string | number | undefined | null): string {
  return String(raw ?? '').trim();
}

export function formatFileName(amount: string, tag = '') {
  const t = tag ? `${tag}-` : '';
  return `fps-qr-${t}${amount ? amount.replace('.', '_') : 'static'}.png`;
}
