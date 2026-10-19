'use client';
/**
 * 藝術 QR 工作室（v4.19.0）
 * ═══════════════════════════════════════════════════════════════
 * 將現有 QR（FPS 收款／網址／純文字）變成「童軍區章／燈塔」風格。
 * - 所有圖案用 Canvas 即時繪畫，唔使後端、唔使 AI 生成費
 * - QR 用 H 級（30%）容錯，中央徽章默認 20%，掃描穩陣
 * - 支援自訂中央徽章（上傳真實區章 PNG／JPG／SVG）
 * - 一鍵下載 1600px PNG，或者複製圖片貼落通告／WhatsApp
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ART_EMBLEMS, ART_MODULE_STYLES, ART_PALETTE_LIST, ART_TEMPLATES,
  buildQrMatrix, drawArtQr, qrSafetyHint,
  type ArtQrEmblem, type ArtQrModuleStyle, type ArtQrOptions, type ArtQrPalette, type ArtQrTemplate,
} from '@/lib/artQr';
import { buildFpsPayload, checkAmount, checkReference, formatFileName } from '@/lib/fps';

type Feedback = { tone: 'success' | 'error' | 'info'; text: string } | null;
type SourceMode = 'fps' | 'text';

const PRESET_TEXTS: { label: string; value: string }[] = [
  { label: '🌐 區會網站', value: 'https://www.skwscout.org.hk' },
];

const STORAGE_KEY = 'portal_art_qr_options_v1';

interface SavedOptions {
  template: ArtQrTemplate;
  palette: ArtQrPalette;
  moduleStyle: ArtQrModuleStyle;
  emblem: ArtQrEmblem;
  logoScale: number;
  artStrength: number;
  brandZh: string;
  brandEn: string;
  caption: string;
}

const DEFAULT_OPTIONS: SavedOptions = {
  template: 'lighthouse',
  palette: 'harbour',
  moduleStyle: 'rounded',
  emblem: 'auto',
  logoScale: 0.2,
  artStrength: 0.7,
  brandZh: '香港童軍總會 · 筲箕灣區',
  brandEn: 'SHAU KEI WAN DISTRICT · HONG KONG SCOUTS',
  caption: '掃碼付款 · SCAN TO PAY',
};

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
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);
  const [logoName, setLogoName] = useState('');
  const [logoScalePct, setLogoScalePct] = useState(20);
  const [artStrengthPct, setArtStrengthPct] = useState(70);

  const [working, setWorking] = useState<'download' | 'copy' | 'share' | ''>('');
  const [feedback, setFeedback] = useState<Feedback>(null);

  // 記住上次設定（唔記內容，保護私隱）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<SavedOptions>;
      setDesign(prev => ({ ...prev, ...saved }));
      if (typeof saved.logoScale === 'number') setLogoScalePct(Math.round(saved.logoScale * 100));
      if (typeof saved.artStrength === 'number') setArtStrengthPct(Math.round(saved.artStrength * 100));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...design, logoScale: logoScalePct / 100, artStrength: artStrengthPct / 100,
      }));
    } catch { /* ignore */ }
  }, [design, logoScalePct, artStrengthPct]);

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

  const options: ArtQrOptions = useMemo(() => ({
    text: payload || ' ',
    brandZh: design.brandZh,
    brandEn: design.brandEn,
    caption: design.caption,
    template: design.template,
    palette: design.palette,
    moduleStyle: design.moduleStyle,
    emblem: design.emblem,
    logoScale: logoScalePct / 100,
    artStrength: artStrengthPct / 100,
    logoImage,
  }), [payload, design, logoScalePct, artStrengthPct, logoImage]);

  const matrixInfo = useMemo(() => {
    if (!payload) return null;
    try {
      const m = buildQrMatrix(payload);
      return { count: m.count, bytes: new TextEncoder().encode(payload).length };
    } catch {
      return { count: 0, bytes: new TextEncoder().encode(payload).length };
    }
  }, [payload]);

  const safety = useMemo(
    () => (matrixInfo && matrixInfo.count ? qrSafetyHint(options, matrixInfo.bytes) : null),
    [matrixInfo, options],
  );

  const tooLong = matrixInfo?.count === 0;

  // ── 即時預覽 ───────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.round(canvas.clientWidth * scale) || 640;
    if (canvas.width !== size) canvas.width = size;
    if (canvas.height !== size) canvas.height = size;
    drawArtQr(ctx, size, options);
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
    drawArtQr(ctx, px, options);
    return canvas;
  }

  function fileBase() {
    if (source === 'text') return 'art-qr';
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
      a.download = `${fileBase()}-art.png`;
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
      setFeedback({ tone: 'success', text: '藝術 QR 圖片已複製，可直接貼到 WhatsApp、電郵或通告。' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '複製失敗。' });
    } finally { setWorking(''); }
  }

  async function shareImage() {
    setWorking('share');
    try {
      const blob = await new Promise<Blob | null>(resolve => exportCanvas(1600).toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('未能建立圖片。');
      const file = new File([blob], `${fileBase()}-art.png`, { type: 'image/png' });
      const data = { title: '筲箕灣區藝術 QR', text: design.caption || design.brandZh, files: [file] };
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

  // ── 上傳自訂徽章 ───────────────────────────────────────
  function pickLogo(file: File | null) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setFeedback({ tone: 'error', text: '請選擇 PNG、JPG 或 SVG 圖片。' });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setFeedback({ tone: 'error', text: '圖片不可大於 4MB。' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setLogoImage(img);
        setLogoName(file.name);
        setFeedback({ tone: 'info', text: '已套用自訂徽章。記住下載前先用銀行／相機 App 試掃一次。' });
      };
      img.onerror = () => setFeedback({ tone: 'error', text: '未能讀取圖片。' });
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    setLogoImage(null);
    setLogoName('');
    setFeedback({ tone: 'info', text: '已轉回內建徽章。' });
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
                同「FPS QR Code 製作」一樣，只係畫法唔同：QR 內容、CRC 全部照 HKICL 規格，銀行 App 照掃得。
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
          <div className="section-head"><div><h3>2. 風格</h3><p>全部即時預覽，唔啱可以慢慢轉。</p></div></div>

          <div className="artqr-label">主題</div>
          <div className="artqr-choices">
            {ART_TEMPLATES.map(t => (
              <button key={t.id} type="button" className={`artqr-choice ${design.template === t.id ? 'active' : ''}`}
                onClick={() => setDesign(d => ({ ...d, template: t.id }))}>
                <b>{t.name}</b><small>{t.hint}</small>
              </button>
            ))}
          </div>

          <div className="artqr-label">配色</div>
          <div className="artqr-swatches">
            {ART_PALETTE_LIST.map(p => (
              <button key={p.id} type="button" aria-label={p.name} title={p.name}
                className={`artqr-swatch ${design.palette === p.id ? 'active' : ''}`}
                onClick={() => setDesign(d => ({ ...d, palette: p.id }))}>
                <span className="artqr-swatch-dots">
                  {p.dots.map(c => <i key={c} style={{ background: c }} />)}
                </span>
                <small>{p.name}</small>
              </button>
            ))}
          </div>
          <p className="fps-help" style={{ marginTop: 4 }}>
            提示：列印用「海港藍金」對比最好；黑白影印機用「單色印刷」。
          </p>

          <div className="artqr-grid2">
            <label className="fps-field">
              <span>QR 方塊形狀</span>
              <select value={design.moduleStyle}
                onChange={e => setDesign(d => ({ ...d, moduleStyle: e.target.value as ArtQrModuleStyle }))}>
                {ART_MODULE_STYLES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="fps-field">
              <span>中央徽章</span>
              <select value={design.emblem} disabled={Boolean(logoImage)}
                onChange={e => setDesign(d => ({ ...d, emblem: e.target.value as ArtQrEmblem }))}>
                {ART_EMBLEMS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>

          <div className="artqr-grid2">
            <label className="artqr-range">
              <span>徽章大小 <b>{logoScalePct}%</b></span>
              <input type="range" min={12} max={26} step={1} value={logoScalePct}
                onChange={e => setLogoScalePct(Number(e.target.value))} />
            </label>
            <label className="artqr-range">
              <span>背景圖案 <b>{artStrengthPct}%</b></span>
              <input type="range" min={0} max={100} step={5} value={artStrengthPct}
                onChange={e => setArtStrengthPct(Number(e.target.value))} />
            </label>
          </div>

          <div className="artqr-logo">
            <div>
              <div className="artqr-label" style={{ marginTop: 0 }}>自訂中央徽章（可選）</div>
              <p className="fps-help" style={{ margin: '2px 0 8px' }}>
                上傳真實區章 PNG（建議正方形、透明底），就會取代內建圖案。
              </p>
            </div>
            <div className="artqr-logo-actions">
              <label className="btn-sm fps-secondary-btn artqr-upload">
                {logoName ? '更換圖片' : '⬆️ 上傳徽章'}
                <input type="file" accept="image/png,image/jpeg,image/svg+xml" hidden
                  onChange={e => { pickLogo(e.target.files?.[0] || null); e.target.value = ''; }} />
              </label>
              {logoName && (
                <button type="button" className="btn-sm fps-secondary-btn" onClick={clearLogo}>✕ 移除</button>
              )}
            </div>
            {logoName && <p className="artqr-filename">已套用：{logoName}</p>}
          </div>
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
          <canvas ref={previewRef} className="artqr-canvas" aria-label="藝術 QR 預覽" />
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
              版本 {matrixInfo?.count ? `QR v${matrixInfo.count}` : '—'} ·
              內容 {matrixInfo?.bytes ?? 0} bytes ·
              容錯級別 H（30%）
              {design.moduleStyle === 'diamond' ? ' · 菱形邊緣較斜，細張印刷要留意' : ''}
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
            <li>中央徽章愈大愈靚，但掃描愈難——20% 係平衡點，唔肯定就 18%。</li>
            <li>呢個工具會直接讀「FPS QR Code 製作」嘅區會戶口設定，唔會另外存低你嘅銀碼。</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
