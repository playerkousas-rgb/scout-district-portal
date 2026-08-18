'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { useDistrict } from '@/lib/useDistrict';

// ── 轉數快 (FPS) QR payload — 香港 Common QR Code 規格 ─────────────
// 參考 HKMA「Common QR Code Specification」及 HKICL FPS QR 規格。
// 收款識別碼（FPS ID）放 tag 26 子欄 02；銀碼放 tag 54（幣別 tag 53 = 344 HKD）。
// CRC 係 CRC-16/CCITT（poly 0x1021, init 0xFFFF, 無反轉, 無 xorout），
// 計算範圍 = 內容 + "6304"（CRC 欄頭）。
function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, '0') + value;
}
function crc16(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function buildFpsPayload(fpsId: string, amount: string, ref: string): string {
  let s = '';
  s += tlv('00', '01');                                            // Payload Format Indicator
  s += tlv('01', amount ? '12' : '11');                            // 12=動態(有銀碼) / 11=靜態
  s += tlv('26', tlv('00', 'hk.com.hkicl') + tlv('02', fpsId));   // FPS 收款識別碼
  s += tlv('52', '0000');                                          // Merchant Category Code（dummy）
  if (amount) { s += tlv('53', '344'); s += tlv('54', amount); }   // 幣別 HKD + 銀碼
  s += tlv('58', 'HK');                                            // 國家
  s += tlv('59', 'NA');                                            // 商戶名（FPS 規格：用 NA）
  s += tlv('60', 'HK');                                            // 城市
  if (ref) s += tlv('62', tlv('05', ref));                         // 備註／參考編號
  return s + '6304' + crc16(s + '6304');                           // CRC
}

export default function FpsPage() {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const session = useRequireCard('fps');

  const [accountName, setAccountName] = useState('');
  const [fpsId, setFpsId] = useState('');
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [payload, setPayload] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!session) return;
    api.getConfig().then(r => {
      if (r.ok && r.data) {
        setAccountName(r.data.fpsAccountName || '');
        setFpsId(r.data.fpsAccountNumber || '');
      }
      setCfgLoaded(true);
    });
  }, [session]);

  function generate() {
    setError('');
    const id = fpsId.trim();
    if (!id) {
      setPayload('');
      setError('尚未設定轉數快收款識別碼（FPS ID）。請喺後台 Config 填「FPS_ACCOUNT_NUMBER」（同 FPS_ACCOUNT_NAME）。');
      return;
    }
    const amt = amount.trim();
    if (amt && !/^\d+(\.\d{1,2})?$/.test(amt)) {
      setPayload('');
      setError('銀碼格式不正確：只可以係數字，最多 2 位小數（例：100 或 100.50）。');
      return;
    }
    setPayload(buildFpsPayload(id, amt, ref.trim()));
  }

  function downloadPng() {
    const canvas = document.querySelector('#fps-qr canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `fps-qr${amount.trim() ? '-' + amount.trim() : ''}.png`;
    a.click();
  }

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <span className="backlink" onClick={() => router.push(withDistrict('/'))}>← 返回主控台</span>
      <h1 className="page-title">💳 FPS QR 製作</h1>
      <p className="page-sub">
        轉數快收款 QR 碼：綁定區會戶口，填銀碼即生成，可貼落通告／下載 PNG。
      </p>

      <section className="info-card">
        <div className="section-head"><div><h3>綁定收款戶口</h3></div></div>
        {!cfgLoaded ? <div className="small-loading">載入中…</div> : (
          <div className="user-row" style={{ flexWrap: 'wrap' }}>
            <div className="user-identity">
              <b>{accountName || '（未設定戶口名）'}</b>
              <span className="rcode">{fpsId || '（未設定 FPS ID）'}</span>
            </div>
          </div>
        )}
        <p style={{ fontSize: 12.5, color: '#888', margin: '6px 0 0' }}>
          ⚙️ 呢度讀取自後台 Config 嘅 <code>FPS_ACCOUNT_NAME</code> / <code>FPS_ACCOUNT_NUMBER</code>，
          要改戶口去 Google Sheet 嘅 Config 表改。
        </p>
      </section>

      <section className="info-card">
        <div className="section-head"><div><h3>製作 QR 碼</h3></div></div>
        <div className="account-form" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#666' }}>銀碼（港幣）*</span>
            <input
              placeholder="例：100 或 100.50"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              inputMode="decimal"
              style={{ width: 180 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#666' }}>備註／參考（選填）</span>
            <input
              placeholder="例：活動名 / 旅號"
              value={ref}
              onChange={e => setRef(e.target.value)}
              style={{ width: 200 }}
            />
          </label>
          <button className="btn-sm" onClick={generate}>⚡ 生成 QR</button>
        </div>
        <p style={{ fontSize: 12.5, color: '#888', margin: '8px 0 0' }}>
          * 銀碼留空 = 生成「靜態 QR」（由付款人自填銀碼）。有填銀碼 = 動態 QR，付款人唔使再打銀碼。
        </p>
      </section>

      {error && <div className="err">{error}</div>}

      {payload && (
        <section className="info-card">
          <div className="section-head"><div><h3>QR 碼結果</h3></div></div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div id="fps-qr" style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #eee', display: 'inline-block' }}>
              <QRCodeCanvas value={payload} size={300} level="M" fgColor="#000000" bgColor="#ffffff" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 240 }}>
              {amount.trim() && <div style={{ fontSize: 20, fontWeight: 700 }}>HK$ {amount.trim()}</div>}
              {ref.trim() && <div style={{ fontSize: 14, color: '#555' }}>備註：{ref.trim()}</div>}
              <button className="btn-sm" onClick={downloadPng}>⬇ 下載 PNG</button>
              <button className="btn-sm" onClick={copyPayload}>{copied ? '✓ 已複製' : '📋 複製 QR 內容'}</button>
              <textarea readOnly value={payload} rows={3} style={{ fontSize: 11, color: '#666', resize: 'vertical' }} />
            </div>
          </div>
        </section>
      )}
    </>
  );
}
