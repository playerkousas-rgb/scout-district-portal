'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { useDistrict } from '@/lib/useDistrict';

// ── 轉數快（FPS）QR payload — 香港 Common QR Code 規格 ─────────────
// FPS ID 放在 tag 26 的子欄 02；港幣是 tag 53 = 344；銀碼是 tag 54。
// CRC 是 CRC-16/CCITT（poly 0x1021, init 0xFFFF, 無反轉、無 xorout），
// 計算範圍 = 全部內容 + "6304"（CRC 欄頭）。
function tlv(id: string, value: string): string {
  if (value.length > 99) throw new Error(`QR 欄位 ${id} 過長`);
  return id + String(value.length).padStart(2, '0') + value;
}

function crc16(value: string): string {
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

function buildFpsPayload(fpsId: string, amount: string, reference: string): string {
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

const DEFAULT_FPS_ACCOUNT = {
  name: 'SCOUT ASSOCIATION OF HONG KONG - SHAU KEI WAN DISTRICT',
  id: '102866183',
};

const FPS_ID_PATTERN = /^\d{7,9}$/;
const SAFE_REFERENCE_PATTERN = /^[A-Za-z0-9 ._:/@+()\-]*$/;

type InputCheck = { value: string; error: string };
type Feedback = { tone: 'success' | 'error' | 'info'; text: string } | null;

function checkAmount(rawAmount: string): InputCheck {
  const value = rawAmount.trim();
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

function checkReference(rawReference: string): InputCheck {
  const value = rawReference.trim();
  if (!value) return { value: '', error: '' };
  if (value.length > 25) return { value, error: '參考編號最多可有 25 個字元。' };
  if (!SAFE_REFERENCE_PATTERN.test(value)) {
    return { value, error: '參考編號請只用英文、數字、空格及常用符號。' };
  }
  return { value, error: '' };
}

function formatFileName(amount: string) {
  return `fps-qr-${amount ? amount.replace('.', '_') : 'static'}.png`;
}

export default function FpsPage() {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const session = useRequireCard('fps');
  const qrContainerRef = useRef<HTMLDivElement>(null);

  // 先放入指定的預設收款戶口；Apps Script 設定載入後才覆蓋。
  const [accountName, setAccountName] = useState(DEFAULT_FPS_ACCOUNT.name);
  const [fpsId, setFpsId] = useState(DEFAULT_FPS_ACCOUNT.id);
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [configNotice, setConfigNotice] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [staticMode, setStaticMode] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [workingAction, setWorkingAction] = useState<'copy' | 'share' | 'download' | 'payload' | ''>('');

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    (async () => {
      try {
        const result = await api.getConfig();
        if (cancelled) return;
        if (result.ok && result.data) {
          // Google Sheet 的純數字儲存格會在 Apps Script JSON 中變成 number，
          // 因此必須先轉字串，否則稍後呼叫 trim() 會令製作 QR 失敗。
          const remoteName = String(result.data.fpsAccountName ?? '').trim();
          const remoteId = String(result.data.fpsAccountNumber ?? '').trim();
          if (remoteName) setAccountName(remoteName);
          if (remoteId) setFpsId(remoteId);
        } else {
          setConfigNotice('未能讀取區設定，現正使用預設 FPS ID 102866183。');
        }
      } catch {
        if (!cancelled) setConfigNotice('未能讀取區設定，現正使用預設 FPS ID 102866183。');
      } finally {
        if (!cancelled) setCfgLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [session]);

  const amountCheck = useMemo(() => checkAmount(amount), [amount]);
  const referenceCheck = useMemo(() => checkReference(reference), [reference]);
  const cleanFpsId = fpsId.trim();
  const accountError = cfgLoaded && !FPS_ID_PATTERN.test(cleanFpsId)
    ? '收款帳戶不是有效的 7 或 9 位 FPS ID，請管理員檢查 Config 的 FPS_ACCOUNT_NUMBER。'
    : '';
  const shouldGenerate = Boolean(amount.trim()) || staticMode;
  const formError = accountError || amountCheck.error || referenceCheck.error;

  const payload = useMemo(() => {
    if (!cfgLoaded || !shouldGenerate || formError) return '';
    return buildFpsPayload(cleanFpsId, amountCheck.value, referenceCheck.value);
  }, [cfgLoaded, shouldGenerate, formError, cleanFpsId, amountCheck.value, referenceCheck.value]);

  useEffect(() => {
    setFeedback(null);
  }, [payload]);

  function handleAmountChange(nextAmount: string) {
    setAmount(nextAmount);
    if (nextAmount.trim()) setStaticMode(false);
  }

  function makeStaticQr() {
    setAmount('');
    setStaticMode(true);
  }

  function getQrCanvas() {
    return qrContainerRef.current?.querySelector('canvas') ?? null;
  }

  async function getQrPngBlob(): Promise<Blob> {
    const canvas = getQrCanvas();
    if (!canvas) throw new Error('QR 碼仍在準備中，請稍候再試。');
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('未能建立 QR 圖片。');
    return blob;
  }

  function savePng(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = formatFileName(amountCheck.value);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function paymentSummary() {
    const amountLine = amountCheck.value
      ? `銀碼：HK$ ${amountCheck.value}`
      : '銀碼：由付款人自行輸入';
    return [
      'FPS 收款 QR Code',
      `收款 FPS ID：${cleanFpsId}`,
      amountLine,
      referenceCheck.value ? `參考：${referenceCheck.value}` : '',
    ].filter(Boolean).join('\n');
  }

  async function downloadPng() {
    setWorkingAction('download');
    try {
      savePng(await getQrPngBlob());
      setFeedback({ tone: 'success', text: 'QR 圖片已開始下載。' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '下載 QR 圖片失敗。' });
    } finally {
      setWorkingAction('');
    }
  }

  async function copyQrImage() {
    setWorkingAction('copy');
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('此瀏覽器未支援直接複製圖片，請改用分享或下載 PNG。');
      }
      const blob = await getQrPngBlob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setFeedback({ tone: 'success', text: 'QR 圖片已複製，可直接貼到 WhatsApp、電郵或文件。' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '複製 QR 圖片失敗。' });
    } finally {
      setWorkingAction('');
    }
  }

  async function shareQrImage() {
    setWorkingAction('share');
    try {
      const blob = await getQrPngBlob();
      const file = new File([blob], formatFileName(amountCheck.value), { type: 'image/png' });
      const shareData = { title: 'FPS 收款 QR Code', text: paymentSummary(), files: [file] };

      if (typeof navigator.share !== 'function' || (navigator.canShare && !navigator.canShare(shareData))) {
        savePng(blob);
        setFeedback({ tone: 'info', text: '此瀏覽器未支援圖片分享，已改為下載 PNG。' });
        return;
      }

      await navigator.share(shareData);
      setFeedback({ tone: 'success', text: '已開啟系統分享選單。' });
    } catch (error) {
      // 使用者在系統分享選單按取消不算錯誤。
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '分享 QR 圖片失敗。' });
    } finally {
      setWorkingAction('');
    }
  }

  async function copyPayload() {
    setWorkingAction('payload');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('此瀏覽器未支援剪貼簿。');
      await navigator.clipboard.writeText(payload);
      setFeedback({ tone: 'success', text: 'FPS QR 原始付款資料已複製。' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '複製付款資料失敗。' });
    } finally {
      setWorkingAction('');
    }
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <span className="backlink" onClick={() => router.push(withDistrict('/'))}>← 返回主控台</span>
      <h1 className="page-title">💳 FPS QR Code 製作</h1>
      <p className="page-sub">輸入銀碼後即時生成轉數快收款 QR Code，可複製、分享或下載，不再需要前往外部網站。</p>

      <section className="info-card">
        <div className="section-head"><div><h3>已綁定收款戶口</h3></div></div>
        {!cfgLoaded ? <div className="small-loading">載入戶口設定中…</div> : (
          <div className="fps-account">
            <b>{accountName}</b>
            <span>FPS ID：<code>{cleanFpsId}</code></span>
          </div>
        )}
        <p className="fps-help">
          此功能預設收款 FPS ID 為 <code>102866183</code>。收款戶口只可由管理員在 Google Sheet 的
          {' '}<code>FPS_ACCOUNT_NAME</code>／<code>FPS_ACCOUNT_NUMBER</code> 設定中更改。
        </p>
        {configNotice && <p className="fps-notice">ℹ️ {configNotice}</p>}
      </section>

      <section className="info-card">
        <div className="section-head">
          <div>
            <h3>製作收款 QR Code</h3>
            <p>輸入有效銀碼後，QR Code 會立即更新，毋須按「生成」。</p>
          </div>
        </div>
        <div className="fps-form-grid">
          <label className="fps-field">
            <span>銀碼（港幣）</span>
            <input
              aria-describedby="fps-amount-help"
              placeholder="例：100 或 100.50"
              value={amount}
              onChange={event => handleAmountChange(event.target.value)}
              inputMode="decimal"
              maxLength={13}
              autoComplete="off"
            />
          </label>
          <label className="fps-field">
            <span>參考編號（選填）</span>
            <input
              placeholder="例：CAMP-2026"
              value={reference}
              onChange={event => setReference(event.target.value)}
              maxLength={25}
              autoComplete="off"
            />
          </label>
          <div className="fps-static-control">
            <span>沒有固定銀碼？</span>
            <button type="button" className="mini-btn" onClick={makeStaticQr}>製作靜態 QR</button>
          </div>
        </div>
        <p id="fps-amount-help" className="fps-help">
          製作者填入銀碼時，QR 會帶有指定金額；如製作者不設定銀碼，掃碼付款人會在付款 App 自行輸入。參考編號建議使用簡短英文／數字。
        </p>
        {formError && <div className="err fps-form-error" role="alert">{formError}</div>}
      </section>

      {payload && (
        <section className="info-card" aria-live="polite">
          <div className="section-head"><div><h3>QR Code 已就緒</h3></div></div>
          <div className="fps-result-grid">
            <div className="fps-qr-column">
              <div ref={qrContainerRef} className="fps-qr-frame">
                <QRCodeCanvas
                  value={payload}
                  size={512}
                  level="M"
                  marginSize={4}
                  fgColor="#000000"
                  bgColor="#ffffff"
                  style={{ display: 'block', width: '100%', height: 'auto' }}
                />
              </div>
              <p className="fps-scan-note">請在正式發放前，以 FPS／銀行 App 試掃一次確認付款資料。</p>
            </div>

            <div className="fps-result-actions">
              <div className="fps-payment-summary">
                <strong>{amountCheck.value ? `HK$ ${amountCheck.value}` : '靜態 QR（付款人自行輸入銀碼）'}</strong>
                <span>收款 FPS ID：{cleanFpsId}</span>
                {referenceCheck.value && <span>參考：{referenceCheck.value}</span>}
              </div>
              <div className="fps-action-grid">
                <button type="button" className="btn-sm" disabled={Boolean(workingAction)} onClick={copyQrImage}>
                  {workingAction === 'copy' ? '複製中…' : '📋 複製 QR 圖片'}
                </button>
                <button type="button" className="btn-sm" disabled={Boolean(workingAction)} onClick={shareQrImage}>
                  {workingAction === 'share' ? '準備分享…' : '↗️ 分享 QR 圖片'}
                </button>
                <button type="button" className="btn-sm fps-secondary-btn" disabled={Boolean(workingAction)} onClick={downloadPng}>
                  {workingAction === 'download' ? '下載中…' : '⬇️ 下載 PNG'}
                </button>
                <button type="button" className="btn-sm fps-secondary-btn" disabled={Boolean(workingAction)} onClick={copyPayload}>
                  {workingAction === 'payload' ? '複製中…' : '⌘ 複製付款資料'}
                </button>
              </div>
              {feedback && <p className={`fps-feedback ${feedback.tone}`} role="status">{feedback.text}</p>}
              <details className="fps-payload-details">
                <summary>查看 FPS QR 原始付款資料</summary>
                <textarea aria-label="FPS QR 原始付款資料" readOnly value={payload} rows={4} />
              </details>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
