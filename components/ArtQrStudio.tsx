'use client';
/**
 * 徽章融合 QR 工作室（v4.21.0）
 * ═══════════════════════════════════════════════════════════════
 * 唔再係「中間貼一個 logo」，而係將 **整個 QR** 化成筲箕灣區章：
 * 每一個模組都係畫筆，深模組壓暗、淺模組提亮，八個 mask 逐個試，
 * 揀最似區章嗰個。銀碼一改，內容同紋理就跟住變，但構圖照樣係燈塔。
 *
 * - 全部 Canvas 即時繪畫，零後端、零 AI 費用
 * - QR 用 H 級（30%）容錯，重寫資料碼字仍留足安全距離
 * - 已用 ZXing + jsQR 逐張掃過，先至出廠
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FUSION_THEMES, drawFusionQr, fusionMatrixInfo, fusionSafety,
  type FusionModuleStyle, type FusionOptions, type FusionTemplate,
} from '@/lib/artQrFusion';
import { buildFpsPayload, checkAmount, checkReference, formatFileName } from '@/lib/fps';

type Feedback = { tone: 'success' | 'error' | 'info'; text: string } | null;
type SourceMode = 'fps' | 'text';

const PRESET_TEXTS: { label: string; value: string }[] = [
  { label: '🌐 區會網站', value: 'https://www.skwscout.org.hk' },
];

const STORAGE_KEY = 'portal_fusion_qr_options_v1';

interface SavedOptions {
  template: FusionTemplate;
  moduleStyle: FusionModuleStyle;
  fusion: number;
  brandZh: string;
  brandEn: string;
  caption: string;
}

const DEFAULT_OPTIONS: SavedOptions = {
  template: 'districtBadge',
  moduleStyle: 'square',
  fusion: 100,
  brandZh: '香港童軍總會 · 筲箕灣區',
  brandEn: 'SHAU KEI WAN DISTRICT · HONG KONG SCOUTS',
  caption: '掃碼付款 · SCAN TO PAY',
};

const MODULE_STYLES: { id: FusionModuleStyle; name: string }[] = [
  { id: 'square', name: '方塊（最易掃）' },
  { id: 'soft', name: '微圓角' },
];

export default function ArtQrStudio({
  fpsAccount, initialAmount = '', initialReference = '',
}: {
  fpsAccount: { name: string; id: string };
  initialAmount?: string;
  initialReference?: string;
}) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // ── 來源 ──────────────────────────────────────────────
  const [source, setSource] = useState<SourceMode>('fps');
  const [amount, setAmount] = useState(initialAmount);
  const [reference, setReference] = useState(initialReference);
  const [text, setText] = useState(PRESET_TEXTS[0].value);

  // ── 外觀 ──────────────────────────────────────────────
  const [design, setDesign] = useState<SavedOptions>(DEFAULT_OPTIONS);
  const [working, setWorking] = useState<'download' | 'copy' | 'share' | ''>('');
  const [feedback, setFeedback] = useState<Feedback>(null);

  // 記住上次設定（唔記內容，保護私隱）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<SavedOptions>;
      setDesign(prev => ({ ...prev, ...saved }));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(design)); } catch { /* ignore */ }
  }, [design]);

  // ── 砌 payload ─────────────────────────────────────────
  const amountCheck = useMemo(() => checkAmount(amount), [amount]);
  const referenceCheck = useMemo(() => checkReference(reference), [reference]);
  const fpsId = fpsAccount.id.trim();

  const payload = useMemo(() => {
    if (source === 'text') return text.trim();
    // 銀碼留空 = 靜態 QR（付款人自己入銀碼），同 /fps 標準模式一致
    if (amountCheck.error || referenceCheck.error) return '';
    return buildFpsPayload(fpsId, amountCheck.value, referenceCheck.value);
  }, [source, text, amountCheck, referenceCheck, fpsId]);

  const options: FusionOptions = useMemo(() => ({
    text: payload || ' ',
    template: design.template,
    moduleStyle: design.moduleStyle,
    fusion: design.fusion,
    brandZh: design.brandZh,
    brandEn: design.brandEn,
    caption: design.caption,
  }), [payload, design]);

  const matrixInfo = useMemo(() => {
    if (!payload) return null;
    try {
      const info = fusionMatrixInfo(payload, design.template);
      return { count: info.count, version: info.version, bytes: new TextEncoder().encode(payload).length };
    } catch {
      return { count: 0, version: 0, bytes: new TextEncoder().encode(payload).length };
    }
  }, [payload, design.template]);

  const safety = useMemo(
    () => (matrixInfo && matrixInfo.count ? fusionSafety(options, matrixInfo.count) : null),
    [matrixInfo, options],
  );

  const tooLong = matrixInfo?.count === 0;

  // ── 即時預覽 ───────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      const scale = Math.min(2, window.devicePixelRatio || 1);
      const size = Math.round(canvas.clientWidth * scale) || 640;
      if (canvas.width !== size) canvas.width = size;
      if (canvas.height !== size) canvas.height = size;
      drawFusionQr(ctx, size, options);
    } catch {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [options]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  useEffect(() => {
    function onResize() { render(); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [render]);

  // ── 輸出 ──────────────────────────────────────────────
  function exportCanvas(px = 1600): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('瀏覽器未能建立畫布。');
    drawFusionQr(ctx, px, options);
    return canvas;
  }

  function fileBase() {
    if (source === 'text') return 'badge-qr';
    return formatFileName(amountCheck.value || '', referenceCheck.value ? referenceCheck.value.replace(/\s+/g, '-') : '')
      .replace(/\.png$/, '');
  }

  async function downloadPng() {
    setWorking('download');
    try {
      const canvas = exportCanvas(1600);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('未能建立圖片。');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileBase()}-badge.png`;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({ tone: 'success', text: '已下載 1600 × 1600 PNG，可直接貼落通告或印刷。' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '下載失敗。' });
    } finally { setWorking(''); }
  }

  async function copyImage() {
    setWorking('copy');
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('此瀏覽器未支援直接複製圖片，請改用下載 PNG。');
      }
      const blob = await new Promise<Blob | null>(resolve => exportCanvas(1600).toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('未能建立圖片。');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setFeedback({ tone: 'success', text: '區章 QR 圖片已複製，可直接貼到 WhatsApp、電郵或通告。' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '複製失敗。' });
    } finally { setWorking(''); }
  }

  async function shareImage() {
    setWorking('share');
    try {
      const blob = await new Promise<Blob | null>(resolve => exportCanvas(1600).toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('未能建立圖片。');
      const file = new File([blob], `${fileBase()}-badge.png`, { type: 'image/png' });
      const data = { title: '筲箕灣區章 QR', text: design.caption || design.brandZh, files: [file] };
      if (typeof navigator.share !== 'function' || (navigator.canShare && !navigator.canShare(data))) {
        throw new Error('此瀏覽器未支援圖片分享，請改用下載 PNG。');
      }
      await navigator.share(data);
      setFeedback({ tone: 'success', text: '已開啟系統分享選單。' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '分享失敗。' });
    } finally { setWorking(''); }
  }

  const previewNote = source === 'fps'
    ? (amountCheck.value ? `HK$ ${amountCheck.value}` : '付款人自填銀碼')
    : '';

  return (
    <div className="artqr">
      {/* 左：控制台 */}
      <div className="artqr-controls">
        <section className="info-card">
          <div className="section-head"><div><h3>1. QR 內容</h3></div></div>

          <div className="artqr-tabs" role="tablist" aria-label="QR 內容來源">
            <button type="button" role="tab" aria-selected={source === 'fps'}
              className={source === 'fps' ? 'active' : ''} onClick={() => setSource('fps')}>
              💳 FPS 收款
            </button>
            <button type="button" role="tab" aria-selected={source === 'text'}
              className={source === 'text' ? 'active' : ''} onClick={() => setSource('text')}>
              🔗 網址／文字
            </button>
          </div>

          {source === 'fps' ? (
            <div className="artqr-fps">
              <div className="fps-account">
                <b>{fpsAccount.name}</b>
                <span>FPS ID：<code>{fpsId}</code></span>
              </div>
              <div className="fps-form-grid">
                <label className="fps-field">
                  <span>銀碼（港幣，留空＝付款人自填）</span>
                  <input value={amount} onChange={e => setAmount(e.target.value)}
                    inputMode="decimal" maxLength={13} placeholder="例：100 或 100.50" autoComplete="off" />
                </label>
                <label className="fps-field">
                  <span>參考編號（選填）</span>
                  <input value={reference} onChange={e => setReference(e.target.value)}
                    maxLength={25} placeholder="例：CAMP-2026" autoComplete="off" />
                </label>
                <div className="fps-static-control">
                  <span>冇固定銀碼？</span>
                  <button type="button" className="mini-btn" onClick={() => setAmount('')}>
                    清空銀碼（靜態）
                  </button>
                </div>
              </div>
              {(amountCheck.error || referenceCheck.error) && (
                <div className="err fps-form-error" role="alert">{amountCheck.error || referenceCheck.error}</div>
              )}
              <p className="fps-help">
                每個銀碼都會生成唔同嘅 QR，但個個都係同一幅區章。
                QR 內容、CRC 全部照 HKICL 規格，銀行 App 照掃得。
                {!amountCheck.value ? ' 而家係靜態 QR：付款人自己入銀碼。' : ''}
              </p>
            </div>
          ) : (
            <div className="artqr-text">
              <label className="fps-field">
                <span>網址或文字</span>
                <input value={text} onChange={e => setText(e.target.value)}
                  placeholder="https://www.skwscout.org.hk" maxLength={1200} autoComplete="off" />
              </label>
              <div className="artqr-presets">
                {PRESET_TEXTS.map(p => (
                  <button key={p.label} type="button" className="mini-btn" onClick={() => setText(p.value)}>{p.label}</button>
                ))}
              </div>
              <p className="fps-help">適合活動報名連結、區會網站、WhatsApp 群組邀請等。內容太長會畫唔到（可先縮短網址）。</p>
            </div>
          )}
        </section>

        <section className="info-card">
          <div className="section-head"><div><h3>2. 區章風格</h3><p>整幅 QR 就係區章，唔係中間貼圖。</p></div></div>

          <div className="artqr-label">主題</div>
          <div className="artqr-choices">
            {FUSION_THEMES.map(t => (
              <button key={t.id} type="button" className={`artqr-choice ${design.template === t.id ? 'active' : ''}`}
                onClick={() => setDesign(d => ({ ...d, template: t.id }))}>
                <b>{t.name}</b><small>{t.hint}</small>
              </button>
            ))}
          </div>

          <div className="artqr-grid2">
            <label className="artqr-range">
              <span>融合強度 <b>{design.fusion}%</b></span>
              <input type="range" min={40} max={100} step={5} value={design.fusion}
                onChange={e => setDesign(d => ({ ...d, fusion: Number(e.target.value) }))} />
            </label>
            <label className="fps-field">
              <span>模組形狀</span>
              <select value={design.moduleStyle}
                onChange={e => setDesign(d => ({ ...d, moduleStyle: e.target.value as FusionModuleStyle }))}>
                {MODULE_STYLES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <p className="fps-help" style={{ marginTop: 10 }}>
            融合強度愈高，區章顏色愈實、燈塔愈清楚；調低會慢慢變返普通黑白 QR。
            正式出街前，請用銀行 App 或者手機相機試掃一次。
          </p>
        </section>

        <section className="info-card">
          <div className="section-head"><div><h3>3. 文字</h3></div></div>
          <div className="artqr-grid2">
            <label className="fps-field">
              <span>頂部標題（中文）</span>
              <input value={design.brandZh} maxLength={30}
                onChange={e => setDesign(d => ({ ...d, brandZh: e.target.value }))} />
            </label>
            <label className="fps-field">
              <span>頂部英文</span>
              <input value={design.brandEn} maxLength={60}
                onChange={e => setDesign(d => ({ ...d, brandEn: e.target.value }))} />
            </label>
          </div>
          <label className="fps-field" style={{ marginTop: 10 }}>
            <span>底部說明</span>
            <input value={design.caption} maxLength={40}
              onChange={e => setDesign(d => ({ ...d, caption: e.target.value }))} />
          </label>
        </section>
      </div>

      {/* 右：預覽 */}
      <aside className="artqr-preview">
        <div className="artqr-canvas-wrap">
          <canvas ref={previewRef} className="artqr-canvas" aria-label="區章 QR 預覽" />
          {!payload && (
            <div className="artqr-empty">
              <b>請先輸入 QR 內容</b>
              <span>輸入銀碼或網址，就會即時生成。</span>
            </div>
          )}
          {tooLong && (
            <div className="artqr-empty error">
              <b>內容太長</b>
              <span>請縮短網址或減少文字，再試一次。</span>
            </div>
          )}
        </div>

        {previewNote && <div className="artqr-chip">{previewNote}</div>}

        {safety && (
          <div className={`artqr-safety ${safety.tone}`}>
            <div className="artqr-safety-head">
              <span>掃描穩定度</span>
              <b>{safety.score}/100</b>
            </div>
            <div className="artqr-meter"><i style={{ width: `${safety.score}%` }} /></div>
            <p>{safety.label}</p>
            <p className="artqr-safety-meta">
              版本 {matrixInfo?.count ? `QR v${matrixInfo.version}` : '—'} ·
              內容 {matrixInfo?.bytes ?? 0} bytes ·
              容錯級別 H（30%）
            </p>
          </div>
        )}

        <div className="artqr-actions">
          <button type="button" className="btn-sm" disabled={!payload || Boolean(working)} onClick={downloadPng}>
            {working === 'download' ? '輸出中…' : '⬇️ 下載 PNG（1600px）'}
          </button>
          <button type="button" className="btn-sm fps-secondary-btn" disabled={!payload || Boolean(working)} onClick={copyImage}>
            {working === 'copy' ? '複製中…' : '📋 複製圖片'}
          </button>
          <button type="button" className="btn-sm fps-secondary-btn" disabled={!payload || Boolean(working)} onClick={shareImage}>
            {working === 'share' ? '準備分享…' : '↗️ 分享'}
          </button>
        </div>

        {feedback && <p className={`fps-feedback ${feedback.tone}`} role="status">{feedback.text}</p>}

        <div className="artqr-tips">
          <b>📌 印前檢查</b>
          <ul>
            <li>用銀行 App／手機相機<b>實際試掃一次</b>，核對戶口、銀碼、參考編號。</li>
            <li>印刷建議 QR 本體大於 <b>3 公分</b>；海報用 5 公分以上。</li>
            <li>四邊留白（靜區）已經畫埋，剪裁時唔好剪到 QR 本體。</li>
            <li>唔同銀碼會出唔同紋理，屬正常現象——因為每個 QR 都係獨立內容。</li>
            <li>呢個工具會直接讀「FPS QR Code 製作」嘅區會戶口設定，唔會另外存低你嘅銀碼。</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
