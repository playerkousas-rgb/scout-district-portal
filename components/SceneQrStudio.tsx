'use client';
/**
 * 場景 QR 工作室（v4.20.0）
 * ═══════════════════════════════════════════════════════════════
 * 將整個 QR 融進區章／燈塔畫面，而唔係中間擺個 logo。
 *  - 內建刺繡區章、燈塔插畫；亦可上傳自己嘅圖（真實區章、相片、AI 圖）
 *  - 自動揀最夾底圖嘅 QR mask，逐像素重映射 → 圖案同 QR 合而為一
 *  - 3D 檢視：拖拽旋轉、浮雕高度、金屬/布章材質
 *  - 可以下載 STL 去 3D 打印（底板 + 凸起模組）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MODULE_SHAPES, SCENE_STYLES, analyzeScene, buildSceneStl, drawSceneQr,
  type ModuleShape, type SceneQrOptions, type SceneStyle,
} from '@/lib/sceneQr';
import { buildFpsPayload, checkAmount, checkReference, formatFileName } from '@/lib/fps';

type Feedback = { tone: 'success' | 'error' | 'info'; text: string } | null;
type SourceMode = 'fps' | 'text';
type Material = 'patch' | 'metal' | 'wood';

const BUILTIN_ART: { id: string; name: string; src: string }[] = [
  { id: 'badge', name: '刺繡區章', src: '/art/badge-lighthouse.jpg' },
  { id: 'poster', name: '燈塔黃昏', src: '/art/lighthouse-dusk.jpg' },
];

const MATERIALS: { id: Material; name: string; hint: string }[] = [
  { id: 'patch', name: '刺繡布章', hint: '啞光布面' },
  { id: 'metal', name: '金屬徽章', hint: '反光金屬' },
  { id: 'wood', name: '木牌', hint: '木紋質感' },
];

const STORAGE_KEY = 'portal_scene_qr_v1';

const DEFAULTS = {
  art: 'badge',
  style: 'badge' as SceneStyle,
  moduleShape: 'stitch' as ModuleShape,
  blend: 0.85,
  emboss: 0.65,
  material: 'patch' as Material,
  quiet: 3,
};

export default function SceneQrStudio({
  fpsAccount, initialAmount = '', initialReference = '',
}: {
  fpsAccount: { name: string; id: string };
  initialAmount?: string;
  initialReference?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef(0);

  const [source, setSource] = useState<SourceMode>('fps');
  const [amount, setAmount] = useState(initialAmount);
  const [reference, setReference] = useState(initialReference);
  const [text, setText] = useState('https://www.skwscout.org.hk');

  const [artId, setArtId] = useState(DEFAULTS.art);
  const [customArt, setCustomArt] = useState<HTMLImageElement | null>(null);
  const [customName, setCustomName] = useState('');
  const [style, setStyle] = useState<SceneStyle>(DEFAULTS.style);
  const [moduleShape, setModuleShape] = useState<ModuleShape>(DEFAULTS.moduleShape);
  const [blendPct, setBlendPct] = useState(Math.round(DEFAULTS.blend * 100));
  const [embossPct, setEmbossPct] = useState(Math.round(DEFAULTS.emboss * 100));
  const [material, setMaterial] = useState<Material>(DEFAULTS.material);
  const [quiet, setQuiet] = useState(DEFAULTS.quiet);
  const [maskMode, setMaskMode] = useState<'auto' | number>('auto');

  const [builtinImg, setBuiltinImg] = useState<HTMLImageElement | null>(null);
  const [working, setWorking] = useState<'download' | 'copy' | 'share' | 'stl' | ''>('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [spin, setSpin] = useState(true);
  const [angle, setAngle] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ax: number; ay: number } | null>(null);

  const fpsId = fpsAccount.id.trim();
  const amountCheck = useMemo(() => checkAmount(amount), [amount]);
  const referenceCheck = useMemo(() => checkReference(reference), [reference]);

  const payload = useMemo(() => {
    if (source === 'text') return text.trim();
    if (amountCheck.error || referenceCheck.error) return '';
    return buildFpsPayload(fpsId, amountCheck.value, referenceCheck.value);
  }, [source, text, amountCheck, referenceCheck, fpsId]);

  const art = customArt ?? builtinImg;

  // 載入內建圖
  useEffect(() => {
    if (customArt) return;
    const entry = BUILTIN_ART.find(a => a.id === artId) || BUILTIN_ART[0];
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { if (!cancelled) setBuiltinImg(img); };
    img.src = entry.src;
    return () => { cancelled = true; };
  }, [artId, customArt]);

  // 記住設定
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const v = JSON.parse(raw) as Partial<typeof DEFAULTS>;
      if (v.art) setArtId(v.art);
      if (v.style) setStyle(v.style);
      if (v.moduleShape) setModuleShape(v.moduleShape);
      if (typeof v.blend === 'number') setBlendPct(Math.round(v.blend * 100));
      if (typeof v.emboss === 'number') setEmbossPct(Math.round(v.emboss * 100));
      if (v.material) setMaterial(v.material);
      if (typeof v.quiet === 'number') setQuiet(v.quiet);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        art: artId, style, moduleShape, blend: blendPct / 100, emboss: embossPct / 100, material, quiet,
      }));
    } catch { /* ignore */ }
  }, [artId, style, moduleShape, blendPct, embossPct, material, quiet]);

  const options: SceneQrOptions = useMemo(() => ({
    text: payload || ' ',
    image: art,
    style,
    blend: blendPct / 100,
    emboss: embossPct / 100,
    moduleShape,
    ink: '#0a2a47',
    paper: '#f7f0dd',
    quiet,
    frame: true,
    corner: 0.1,
    titleZh: '',
    titleEn: '',
    caption: '',
    mask: maskMode,
  }), [payload, art, style, blendPct, embossPct, moduleShape, quiet, maskMode]);

  const analysis = useMemo(() => {
    if (!payload || !art) return null;
    try { return analyzeScene(payload, art, '#f7f0dd'); } catch { return null; }
  }, [payload, art]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const max = 1100;
    const size = Math.min(max, Math.max(560, Math.round(canvas.clientWidth * Math.min(2, window.devicePixelRatio || 1))));
    if (canvas.width !== size) canvas.width = size;
    if (canvas.height !== size) canvas.height = size;
    drawSceneQr(ctx, size, options, art);
  }, [options, art]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  // 3D 自動旋轉
  useEffect(() => {
    if (!spin) return;
    let raf = 0;
    const tick = () => {
      setAngle(a => ({ x: a.x, y: (a.y + 0.35) % 360 }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spin]);

  function exportCanvas(px = 1600) {
    const canvas = document.createElement('canvas');
    canvas.width = px; canvas.height = px;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('瀏覽器未能建立畫布。');
    drawSceneQr(ctx, px, options, art);
    return canvas;
  }

  function fileBase() {
    if (source === 'text') return 'scene-qr';
    return formatFileName(amountCheck.value || '', referenceCheck.value.replace(/\s+/g, '-')).replace(/\.png$/, '');
  }

  async function downloadPng() {
    setWorking('download');
    try {
      const blob = await new Promise<Blob | null>(r => exportCanvas(1600).toBlob(r, 'image/png'));
      if (!blob) throw new Error('未能建立圖片。');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${fileBase()}-scene.png`;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({ tone: 'success', text: '已下載 1600 × 1600 PNG。' });
    } catch (e) {
      setFeedback({ tone: 'error', text: e instanceof Error ? e.message : '下載失敗。' });
    } finally { setWorking(''); }
  }

  async function copyImage() {
    setWorking('copy');
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('此瀏覽器未支援直接複製圖片，請改用下載 PNG。');
      const blob = await new Promise<Blob | null>(r => exportCanvas(1600).toBlob(r, 'image/png'));
      if (!blob) throw new Error('未能建立圖片。');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setFeedback({ tone: 'success', text: '場景 QR 已複製。' });
    } catch (e) {
      setFeedback({ tone: 'error', text: e instanceof Error ? e.message : '複製失敗。' });
    } finally { setWorking(''); }
  }

  async function shareImage() {
    setWorking('share');
    try {
      const blob = await new Promise<Blob | null>(r => exportCanvas(1600).toBlob(r, 'image/png'));
      if (!blob) throw new Error('未能建立圖片。');
      const file = new File([blob], `${fileBase()}-scene.png`, { type: 'image/png' });
      const data = { title: '筲箕灣區場景 QR', files: [file] };
      if (typeof navigator.share !== 'function' || (navigator.canShare && !navigator.canShare(data))) throw new Error('此瀏覽器未支援圖片分享，請改用下載 PNG。');
      await navigator.share(data);
      setFeedback({ tone: 'success', text: '已開啟系統分享選單。' });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setFeedback({ tone: 'error', text: e instanceof Error ? e.message : '分享失敗。' });
    } finally { setWorking(''); }
  }

  function downloadStl() {
    setWorking('stl');
    try {
      const buf = buildSceneStl(options, { sizeMm: 100, baseMm: 3, reliefMm: 1.8, rimMm: 2.4 });
      const blob = new Blob([buf], { type: 'model/stl' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${fileBase()}-3d.stl`;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({ tone: 'success', text: '已下載 3D 打印檔（100 × 100 × 4.8mm）。可交去 3D 打印店，或用 Bambu／Prusa 切片。' });
    } catch (e) {
      setFeedback({ tone: 'error', text: e instanceof Error ? e.message : '未能生成 STL。' });
    } finally { setWorking(''); }
  }

  function pickArt(file: File | null) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { setFeedback({ tone: 'error', text: '請選擇 PNG、JPG 或 SVG。' }); return; }
    if (file.size > 8 * 1024 * 1024) { setFeedback({ tone: 'error', text: '圖片不可大於 8MB。' }); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => { setCustomArt(img); setCustomName(file.name); setFeedback({ tone: 'info', text: '已套用你嘅圖。記住下載前試掃一次。' }); };
      img.onerror = () => setFeedback({ tone: 'error', text: '未能讀取圖片。' });
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  const rotateFromDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setAngle({ x: Math.max(-70, Math.min(70, dragRef.current.ax - dy * 0.35)), y: dragRef.current.ay + dx * 0.4 });
  };

  // 3D 材質 CSS
  const materialStyle: Record<Material, { surface: string; edge: string; shadow: string }> = {
    patch: {
      surface: 'linear-gradient(160deg, #1a3c5e 0%, #0a2a47 55%, #07203a 100%)',
      edge: '#061a2e',
      shadow: 'rgba(0,0,0,.45)',
    },
    metal: {
      surface: 'linear-gradient(150deg, #e8d38a 0%, #c9a24a 30%, #8f6f22 55%, #e8d38a 80%, #b58f33 100%)',
      edge: '#7a5c15',
      shadow: 'rgba(0,0,0,.5)',
    },
    wood: {
      surface: 'repeating-linear-gradient(92deg, #a9744a 0 7px, #b9814f 7px 13px, #9c6a42 13px 22px)',
      edge: '#6b4526',
      shadow: 'rgba(0,0,0,.42)',
    },
  };
  const mat = materialStyle[material];
  const reliefScale = 0.6 + embossPct / 100 * 2.6;

  return (
    <div className="sceneqr">
      <div className="sceneqr-controls">
        <section className="info-card">
          <div className="section-head"><div><h3>1. QR 內容</h3></div></div>
          <div className="artqr-tabs" role="tablist" aria-label="QR 內容來源">
            <button type="button" role="tab" aria-selected={source === 'fps'} className={source === 'fps' ? 'active' : ''} onClick={() => setSource('fps')}>💳 FPS 收款</button>
            <button type="button" role="tab" aria-selected={source === 'text'} className={source === 'text' ? 'active' : ''} onClick={() => setSource('text')}>🔗 網址／文字</button>
          </div>
          {source === 'fps' ? (
            <>
              <div className="fps-account">
                <b>{fpsAccount.name}</b>
                <span>FPS ID：<code>{fpsId}</code></span>
              </div>
              <div className="fps-form-grid">
                <label className="fps-field">
                  <span>銀碼（留空＝付款人自填）</span>
                  <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" maxLength={13} placeholder="例：100" autoComplete="off" />
                </label>
                <label className="fps-field">
                  <span>參考編號（選填）</span>
                  <input value={reference} onChange={e => setReference(e.target.value)} maxLength={25} placeholder="例：CAMP-2026" autoComplete="off" />
                </label>
                <div className="fps-static-control">
                  <span>冇固定銀碼？</span>
                  <button type="button" className="mini-btn" onClick={() => setAmount('')}>清空銀碼（靜態）</button>
                </div>
              </div>
              {(amountCheck.error || referenceCheck.error) && (
                <div className="err fps-form-error" role="alert">{amountCheck.error || referenceCheck.error}</div>
              )}
            </>
          ) : (
            <label className="fps-field">
              <span>網址或文字</span>
              <input value={text} onChange={e => setText(e.target.value)} placeholder="https://…" maxLength={1200} autoComplete="off" />
            </label>
          )}
        </section>

        <section className="info-card">
          <div className="section-head"><div><h3>2. 底圖</h3><p>QR 會融入呢張圖嘅明暗同紋理。</p></div></div>
          <div className="sceneqr-arts">
            {BUILTIN_ART.map(a => (
              <button key={a.id} type="button"
                className={`sceneqr-art ${!customArt && artId === a.id ? 'active' : ''}`}
                onClick={() => { setCustomArt(null); setCustomName(''); setArtId(a.id); }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.src} alt={a.name} />
                <span>{a.name}</span>
              </button>
            ))}
            <button type="button" className={`sceneqr-art upload ${customArt ? 'active' : ''}`}
              onClick={() => fileRef.current?.click()}>
              {customArt
                ? <><img src={customArt.src} alt={customName} /><span>{customName.slice(0, 12)}</span></>
                : <><span className="sceneqr-art-plus">⬆️</span><span>上傳自己圖</span></>}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden
              onChange={e => { pickArt(e.target.files?.[0] || null); e.target.value = ''; }} />
          </div>
          <p className="fps-help">
            最佳效果：方形圖、中間有主體（燈塔／徽章）、背景唔好太雜。上傳嘅圖只留喺瀏覽器，唔會上傳。
          </p>
        </section>

        <section className="info-card">
          <div className="section-head"><div><h3>3. 融合方式</h3></div></div>
          <div className="artqr-label">風格</div>
          <div className="artqr-choices">
            {SCENE_STYLES.map(t => (
              <button key={t.id} type="button" className={`artqr-choice ${style === t.id ? 'active' : ''}`}
                onClick={() => setStyle(t.id)}>
                <b>{t.name}</b><small>{t.hint}</small>
              </button>
            ))}
          </div>

          <div className="artqr-label">模組形狀</div>
          <div className="artqr-tabs">
            {MODULE_SHAPES.map(m => (
              <button key={m.id} type="button" className={moduleShape === m.id ? 'active' : ''}
                onClick={() => setModuleShape(m.id)}>{m.name}</button>
            ))}
          </div>

          <div className="artqr-grid2">
            <label className="artqr-range">
              <span>融圖強度 <b>{blendPct}%</b></span>
              <input type="range" min={35} max={100} step={5} value={blendPct} onChange={e => setBlendPct(Number(e.target.value))} />
            </label>
            <label className="artqr-range">
              <span>浮雕高度 <b>{embossPct}%</b></span>
              <input type="range" min={0} max={100} step={5} value={embossPct} onChange={e => setEmbossPct(Number(e.target.value))} />
            </label>
          </div>
          <p className="fps-help">
            融圖強度越高 = 對比越強、越易掃；越低 = 圖案保留越多。建議 80–90%。
            {(blendPct < 75 || moduleShape !== 'square') && (
              <><br /><b style={{ color: '#b45309' }}>
                ⚠️ 低於 75% 或者用針腳／圓角模組時，複雜插畫底圖會較難掃——建議印大啲（5cm 以上）並先試掃。
              </b></>
            )}
          </p>

          <div className="artqr-grid2">
            <label className="fps-field">
              <span>靜區（白邊模組數）</span>
              <select value={quiet} onChange={e => setQuiet(Number(e.target.value))}>
                {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n} 格</option>)}
              </select>
            </label>
            <label className="fps-field">
              <span>QR mask</span>
              <select value={String(maskMode)} onChange={e => setMaskMode(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}>
                <option value="auto">自動（夾底圖）</option>
                {[0, 1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>Mask {n}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="info-card">
          <div className="section-head"><div><h3>4. 立體</h3><p>預覽 3D 效果，或下載 STL 去 3D 打印。</p></div></div>
          <div className="artqr-choices">
            {MATERIALS.map(m => (
              <button key={m.id} type="button" className={`artqr-choice ${material === m.id ? 'active' : ''}`}
                onClick={() => setMaterial(m.id)}>
                <b>{m.name}</b><small>{m.hint}</small>
              </button>
            ))}
          </div>
          <div className="sceneqr-3d-actions">
            <button type="button" className="btn-sm" disabled={!payload || Boolean(working)} onClick={downloadStl}>
              {working === 'stl' ? '生成中…' : '🧊 下載 STL（3D 打印）'}
            </button>
            <button type="button" className="btn-sm fps-secondary-btn" onClick={() => setSpin(s => !s)}>
              {spin ? '⏸ 停止旋轉' : '▶️ 自動旋轉'}
            </button>
            <button type="button" className="btn-sm fps-secondary-btn" onClick={() => setAngle({ x: 0, y: 0 })}>
              ↺ 重設視角
            </button>
          </div>
          <p className="fps-help">
            STL 尺寸：100 × 100 mm、底板 3 mm、模組凸起 1.8 mm、外圍圍邊 2.4 mm。
            打印用深色 PLA 最靚；想雙色可以換絲。
          </p>
        </section>
      </div>

      {/* 右：2D + 3D 預覽 */}
      <aside className="sceneqr-preview">
        <div className="sceneqr-stage"
          onPointerDown={e => { setSpin(false); dragRef.current = { x: e.clientX, y: e.clientY, ax: angle.x, ay: angle.y }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
          onPointerMove={rotateFromDrag}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerLeave={() => { dragRef.current = null; }}
        >
          <div className="sceneqr-3d"
            style={{
              transform: `rotateX(${angle.x}deg) rotateY(${angle.y}deg)`,
              ['--edge' as string]: mat.edge,
              ['--surface' as string]: mat.surface,
              ['--shadow' as string]: mat.shadow,
              ['--relief' as string]: `${reliefScale}`,
            }}>
            <div className="sceneqr-face">
              <canvas ref={canvasRef} className="sceneqr-canvas" aria-label="場景 QR 預覽" />
            </div>
            <div className="sceneqr-edge sceneqr-edge-b" />
            <div className="sceneqr-edge sceneqr-edge-l" />
            <div className="sceneqr-edge sceneqr-edge-r" />
            <div className="sceneqr-edge sceneqr-edge-t" />
          </div>
          {!payload && <div className="artqr-empty"><b>請先輸入 QR 內容</b><span>輸入銀碼或網址，就會即時生成。</span></div>}
          <div className="sceneqr-hint">拖拽旋轉 · 3D 預覽</div>
        </div>

        {analysis && (
          <div className="artqr-safety good">
            <div className="artqr-safety-head">
              <span>QR 版本 / 夾圖</span>
              <b>{analysis.count}×{analysis.count}</b>
            </div>
            <div className="artqr-meter"><i style={{ width: `${Math.round(analysis.score * 100)}%` }} /></div>
            <p>Mask {analysis.mask} · 夾圖分數 {Math.round(analysis.score * 100)} / 100</p>
            <p className="artqr-safety-meta">H 級容錯（30%）· 靜區 {quiet} 格 · 模組 {moduleShape === 'stitch' ? '刺繡針腳' : moduleShape === 'round' ? '圓角' : '方塊'}</p>
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
          <b>📌 掃描同印刷</b>
          <ul>
            <li>QR 已經 <b>H 級容錯（30%）</b>，圖案食咗一部分模組都讀得返。</li>
            <li>印前用<b>手機相機／銀行 App 實掃</b>；印細過 4cm 就要再試。</li>
            <li>三個定位眼同時序線已經鎖死全對比，唔會被圖案蓋過。</li>
            <li>3D 打印：深色 PLA 最易掃；打印完可以噴啞光透明漆減反光。</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
