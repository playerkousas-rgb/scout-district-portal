'use client';
/**
 * FPS QR → 區章／燈塔融合 QR（v5.0.0）
 * ═══════════════════════════════════════════════════════════════
 * 只做一件事：你入銀碼 → 出一個「本身已經係區章圖案」嘅 FPS 收款 QR。
 *   · QR 內容同標準 FPS QR 一模一樣（HKICL Common QR，含 CRC）
 *   · 改銀碼 → 新 QR，但幅區章構圖唔變
 *   · 深格／淺格明度範圍唔重疊，掃描器一定分得開
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ECL_OPTIONS, FULL_ART_SOURCES, MODULE_STYLES,
  drawFullArtQr, fullArtSafety, makeMatrix,
  type Ecl, type FullArtModuleStyle, type FullArtOptions, type FullArtSource,
} from '@/lib/artQrFull';
import { buildFpsPayload, checkAmount, checkReference, formatFileName } from '@/lib/fps';

type Feedback = { tone: 'success' | 'error' | 'info'; text: string } | null;

const STORE = 'portal_fps_art_v5';

interface Design {
  source: FullArtSource;
  ecl: Ecl;
  moduleStyle: FullArtModuleStyle;
  fusion: number;
  autoMask: boolean;
  caption: string;
}

const DEFAULT_DESIGN: Design = {
  source: 'badge',
  ecl: 'Q',
  moduleStyle: 'square',
  fusion: 0.9,
  autoMask: true,
  caption: '掃碼付款 · SCAN TO PAY',
};

export default function FpsArtQr({
  fpsAccount, initialAmount = '',
}: {
  fpsAccount: { name: string; id: string };
  initialAmount?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  const [amount, setAmount] = useState(initialAmount);
  const [reference, setReference] = useState('');
  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN);
  const [customImage, setCustomImage] = useState<HTMLImageElement | null>(null);
  const [customName, setCustomName] = useState('');
  const [working, setWorking] = useState<'download' | 'copy' | ''>('');
  const [feedback, setFeedback] = useState<Feedback>(null);

  // 記住外觀設定
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) setDesign(d => ({ ...d, ...(JSON.parse(raw) as Partial<Design>) }));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(design)); } catch { /* ignore */ }
  }, [design]);

  const amountCheck = useMemo(() => checkAmount(amount), [amount]);
  const referenceCheck = useMemo(() => checkReference(reference), [reference]);
  const fpsId = fpsAccount.id.trim();
  const formError = amountCheck.error || referenceCheck.error;

  const payload = useMemo(() => {
    if (formError) return '';
    return buildFpsPayload(fpsId, amountCheck.value, referenceCheck.value);
  }, [formError, fpsId, amountCheck.value, referenceCheck.value]);

  const options: FullArtOptions = useMemo(() => ({
    text: payload || ' ',
    source: design.source,
    customImage,
    fusion: design.fusion,
    ecl: design.ecl,
    autoMask: design.autoMask,
    moduleStyle: design.moduleStyle,
    quietZone: 4,
    paper: '#ffffff',
    caption: design.caption,
  }), [payload, design, customImage]);

  const info = useMemo(() => {
    if (!payload) return null;
    try {
      const m = makeMatrix(payload, design.ecl);
      return { version: m.version, size: m.size, bytes: new TextEncoder().encode(payload).length };
    } catch {
      return null;
    }
  }, [payload, design.ecl]);

  const safety = useMemo(
    () => (info ? fullArtSafety({ ...design, bytes: info.bytes }) : null),
    [info, design],
  );

  // 即時預覽
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.round((canvas.clientWidth || 480) * dpr);
    if (canvas.width !== size) canvas.width = size;
    if (canvas.height !== size) canvas.height = size;
    try {
      drawFullArtQr(ctx, size, options);
    } catch {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
    }
  }, [options]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  useEffect(() => {
    const onResize = () => render();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [render]);

  function exportPng(px = 1600): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = px; canvas.height = px;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('瀏覽器未能建立畫布。'));
      drawFullArtQr(ctx, px, options);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('未能建立圖片。'))), 'image/png');
    });
  }

  function fileName() {
    return formatFileName(amountCheck.value, referenceCheck.value.replace(/\s+/g, '-'))
      .replace(/\.png$/, '-art.png');
  }

  async function download() {
    setWorking('download');
    try {
      const blob = await exportPng();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({ tone: 'success', text: '已下載 1600×1600 PNG。' });
    } catch (e) {
      setFeedback({ tone: 'error', text: e instanceof Error ? e.message : '下載失敗。' });
    } finally { setWorking(''); }
  }

  async function copy() {
    setWorking('copy');
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('此瀏覽器未支援複製圖片，請用下載。');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': await exportPng() })]);
      setFeedback({ tone: 'success', text: '已複製，可貼落 WhatsApp／通告。' });
    } catch (e) {
      setFeedback({ tone: 'error', text: e instanceof Error ? e.message : '複製失敗。' });
    } finally { setWorking(''); }
  }

  function pickImage(file: File | null) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setFeedback({ tone: 'error', text: '請選 PNG／JPG／SVG。' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setCustomImage(img);
        setCustomName(file.name);
        setDesign(d => ({ ...d, source: 'custom' }));
        setFeedback({ tone: 'info', text: '已套用你嘅圖。深色圖案效果最好。' });
      };
      img.onerror = () => setFeedback({ tone: 'error', text: '讀唔到張圖。' });
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="fps-art">
      {/* 控制 */}
      <div className="fps-art-controls">
        <section className="info-card">
          <div className="section-head"><div><h3>1. 銀碼 → FPS QR</h3></div></div>
          <div className="fps-form-grid fps-art-grid">
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
          </div>
          {formError && <div className="err fps-form-error" role="alert">{formError}</div>}
          <p className="fps-help">
            收款 FPS ID <code>{fpsId}</code> · {amountCheck.value ? `固定銀碼 HK$ ${amountCheck.value}` : '靜態 QR（付款人自填）'}
            {referenceCheck.value && ` · 參考 ${referenceCheck.value}`}
          </p>
        </section>

        <section className="info-card">
          <div className="section-head"><div><h3>2. 圖案</h3><p>揀邊幅圖收埋落 QR 度。</p></div></div>

          <div className="fps-art-sources">
            {FULL_ART_SOURCES.map(s => (
              <button key={s.id} type="button"
                className={`fps-art-source ${design.source === s.id ? 'active' : ''}`}
                onClick={() => {
                  if (s.id === 'custom' && !customImage) {
                    document.getElementById('fps-art-upload')?.click();
                    return;
                  }
                  setDesign(d => ({ ...d, source: s.id }));
                }}>
                <b>{s.name}</b>
                <small>{s.id === 'custom' && customName ? customName : s.hint}</small>
              </button>
            ))}
          </div>
          <div className="fps-art-upload-row">
            <label className="btn-sm fps-secondary-btn fps-art-upload">
              ⬆️ 上傳你嘅區章圖
              <input id="fps-art-upload" type="file" accept="image/png,image/jpeg,image/svg+xml" hidden
                onChange={e => { pickImage(e.target.files?.[0] || null); e.target.value = ''; }} />
            </label>
            {customName && (
              <button type="button" className="mini-btn"
                onClick={() => { setCustomImage(null); setCustomName(''); setDesign(d => ({ ...d, source: 'badge' })); }}>
                移除
              </button>
            )}
          </div>

          <div className="fps-art-row">
            <label className="fps-field">
              <span>方塊形狀</span>
              <select value={design.moduleStyle}
                onChange={e => setDesign(d => ({ ...d, moduleStyle: e.target.value as FullArtModuleStyle }))}>
                {MODULE_STYLES.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className="fps-field">
              <span>容錯級別</span>
              <select value={design.ecl}
                onChange={e => setDesign(d => ({ ...d, ecl: e.target.value as Ecl }))}>
                {ECL_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.name} — {o.hint}</option>)}
              </select>
            </label>
          </div>

          <label className="fps-art-range">
            <span>圖案強度 <b>{Math.round(design.fusion * 100)}%</b>（愈高愈似圖，但愈難掃）</span>
            <input type="range" min={50} max={100} step={1}
              value={Math.round(design.fusion * 100)}
              onChange={e => setDesign(d => ({ ...d, fusion: Number(e.target.value) / 100 }))} />
          </label>

          <label className="fps-field" style={{ marginTop: 10 }}>
            <span>底部文字</span>
            <input value={design.caption} maxLength={32}
              onChange={e => setDesign(d => ({ ...d, caption: e.target.value }))} />
          </label>
        </section>
      </div>

      {/* 預覽 */}
      <aside className="fps-art-preview">
        <div className="fps-art-canvas-wrap">
          <canvas ref={canvasRef} className="fps-art-canvas" aria-label="融合 QR 預覽" />
        </div>

        <div className="fps-art-meta">
          <span>{amountCheck.value ? `HK$ ${amountCheck.value}` : '付款人自填銀碼'}</span>
          {info && <span>QR v{info.version} · {info.size} 模組 · {info.bytes} bytes</span>}
        </div>

        {safety && (
          <div className={`artqr-safety ${safety.tone}`}>
            <div className="artqr-safety-head"><span>掃描穩定度</span><b>{safety.score}</b></div>
            <div className="artqr-meter"><i style={{ width: `${safety.score}%` }} /></div>
            <p>{safety.label}</p>
          </div>
        )}

        <div className="fps-art-actions">
          <button type="button" className="btn-sm" disabled={!payload || Boolean(working)} onClick={download}>
            {working === 'download' ? '輸出中…' : '⬇️ 下載 PNG（1600px）'}
          </button>
          <button type="button" className="btn-sm fps-secondary-btn" disabled={!payload || Boolean(working)} onClick={copy}>
            {working === 'copy' ? '複製中…' : '📋 複製圖片'}
          </button>
        </div>
        {feedback && <p className={`fps-feedback ${feedback.tone}`} role="status">{feedback.text}</p>}

        <p className="fps-art-note">
          發放前請用銀行 App 試掃一次，核對戶口、銀碼同參考編號。
          改銀碼會生成新 QR，但區章構圖不變。
        </p>
      </aside>
    </div>
  );
}
