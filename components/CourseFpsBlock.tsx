'use client';
/**
 * 訓練班收費 FPS QR（v4.3.0）
 * ─────────────────────────────────────────────────────────────
 * 由區會轉數快戶口（Config FPS_ACCOUNT_NAME / FPS_ACCOUNT_NUMBER）＋ 該班費用 fee
 * ＋ 參考編號（預設課程編號 courseNo）即時生成 QR。
 * 按「儲存 QR 到此班」會將 payload / 銀碼 / 參考 / 戶口寫入 CourseLinks，
 * 成員系統（member-portal）listCourseLinks 會拎到 fpsQrPayload 直接畫 QR 俾未交費者。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { CourseLink } from '@/lib/types';
import {
  FPS_ID_PATTERN, buildFpsPayload, checkAmount, checkReference, formatFileName, sanitizeReference,
} from '@/lib/fps';

type Account = { name: string; id: string; loaded: boolean };
type Feedback = { tone: 'success' | 'error' | 'info'; text: string } | null;

export type CourseFpsResult = Pick<CourseLink,
  'fpsQrPayload' | 'fpsAmount' | 'fpsReference' | 'fpsAccountName' | 'fpsAccountNumber' | 'fpsUpdatedAt'>;

export default function CourseFpsBlock({
  course, account, onSave, saving,
}: {
  course: CourseLink;
  account: Account;
  onSave: (r: CourseFpsResult) => Promise<void>;
  saving: boolean;
}) {
  const qrRef = useRef<HTMLDivElement>(null);
  const [amount, setAmount] = useState(String(course.fpsAmount || course.fee || ''));
  const [reference, setReference] = useState(
    course.fpsReference || sanitizeReference(course.courseNo || course.courseId),
  );
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [working, setWorking] = useState<'copy' | 'download' | ''>('');

  // 轉班／改費用時，重設預設值（已儲存嘅 QR 設定優先）
  useEffect(() => {
    setAmount(String(course.fpsAmount || course.fee || ''));
    setReference(course.fpsReference || sanitizeReference(course.courseNo || course.courseId));
    setFeedback(null);
  }, [course.courseId, course.fee, course.courseNo, course.fpsAmount, course.fpsReference]);

  const amountCheck = useMemo(() => checkAmount(amount), [amount]);
  const referenceCheck = useMemo(() => checkReference(reference), [reference]);
  const fpsId = account.id.trim();
  const accountError = account.loaded && !FPS_ID_PATTERN.test(fpsId)
    ? '收款帳戶不是有效的 7 或 9 位 FPS ID，請管理員檢查 Config 的 FPS_ACCOUNT_NUMBER。'
    : '';
  const formError = accountError || amountCheck.error || referenceCheck.error;
  const payload = useMemo(() => {
    if (!account.loaded || formError || !amountCheck.value) return '';
    return buildFpsPayload(fpsId, amountCheck.value, referenceCheck.value);
  }, [account.loaded, formError, fpsId, amountCheck.value, referenceCheck.value]);

  const savedPayload = course.fpsQrPayload || '';
  const dirty = Boolean(payload) && payload !== savedPayload;
  const feeMismatch = Boolean(amountCheck.value) && Boolean(course.fee) && Number(amountCheck.value) !== Number(course.fee);

  async function pngBlob(): Promise<Blob> {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) throw new Error('QR 碼仍在準備中，請稍候再試。');
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('未能建立 QR 圖片。');
    return blob;
  }
  async function download() {
    setWorking('download');
    try {
      const url = URL.createObjectURL(await pngBlob());
      const a = document.createElement('a');
      a.href = url; a.download = formatFileName(amountCheck.value, sanitizeReference(course.courseNo || course.courseId).replace(/\s+/g, '-'));
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({ tone: 'success', text: 'QR 圖片已開始下載。' });
    } catch (e) { setFeedback({ tone: 'error', text: e instanceof Error ? e.message : '下載失敗。' }); }
    finally { setWorking(''); }
  }
  async function copyImage() {
    setWorking('copy');
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('此瀏覽器未支援直接複製圖片，請改用下載 PNG。');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': await pngBlob() })]);
      setFeedback({ tone: 'success', text: 'QR 圖片已複製，可貼到通告／WhatsApp。' });
    } catch (e) { setFeedback({ tone: 'error', text: e instanceof Error ? e.message : '複製失敗。' }); }
    finally { setWorking(''); }
  }
  async function save() {
    if (!payload) return;
    await onSave({
      fpsQrPayload: payload,
      fpsAmount: amountCheck.value,
      fpsReference: referenceCheck.value,
      fpsAccountName: account.name,
      fpsAccountNumber: fpsId,
      fpsUpdatedAt: new Date().toISOString(),
    });
  }
  async function clear() {
    if (!confirm('移除此班已儲存嘅 FPS QR？成員系統會即時唔再顯示。')) return;
    await onSave({ fpsQrPayload: '', fpsAmount: '', fpsReference: '', fpsAccountName: '', fpsAccountNumber: '', fpsUpdatedAt: '' });
  }

  return (
    <div className="course-fps">
      <div className="section-head" style={{ marginBottom: 8 }}>
        <div>
          <h3 style={{ fontSize: 14 }}>💳 收費 FPS QR（成員系統顯示俾未交費者）</h3>
          <p>戶口：<b>{account.loaded ? account.name : '載入中…'}</b>{account.loaded && <> · FPS ID <code>{fpsId}</code></>}</p>
        </div>
        {savedPayload
          ? <span className="state on">已儲存 QR{course.fpsUpdatedAt ? ` · ${String(course.fpsUpdatedAt).slice(0, 10)}` : ''}</span>
          : <span className="state off">未儲存 QR</span>}
      </div>

      <div className="fps-form-grid">
        <label className="fps-field">
          <span>銀碼（港幣）＝ 學費</span>
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" maxLength={13} placeholder="例：120" />
        </label>
        <label className="fps-field">
          <span>參考編號（付款人 App 會顯示）</span>
          <input value={reference} onChange={e => setReference(e.target.value)} maxLength={25} placeholder="例：SKW-CUB-2026-01" />
        </label>
        <div className="fps-static-control">
          <span>參考編號預設＝課程編號</span>
          <button type="button" className="mini-btn" onClick={() => setReference(sanitizeReference(course.courseNo || course.courseId))}>用課程編號</button>
        </div>
      </div>
      {feeMismatch && <p className="fps-notice">⚠️ QR 銀碼（{amountCheck.value}）同課程費用 fee（{course.fee}）唔一致，請確認。</p>}
      {formError && <div className="err fps-form-error" role="alert">{formError}</div>}
      {!formError && !amountCheck.value && <p className="fps-help">請先填學費（fee），QR 會即時生成。</p>}

      {payload && (
        <div className="fps-result-grid" style={{ marginTop: 12 }}>
          <div className="fps-qr-column">
            <div ref={qrRef} className="fps-qr-frame" style={{ maxWidth: 260 }}>
              <QRCodeCanvas value={payload} size={512} level="M" marginSize={4} fgColor="#000000" bgColor="#ffffff" style={{ display: 'block', width: '100%', height: 'auto' }} />
            </div>
            <p className="fps-scan-note">發放前請用銀行 App 試掃一次，核對戶口、銀碼同參考編號。</p>
          </div>
          <div className="fps-result-actions">
            <div className="fps-payment-summary">
              <strong>HK$ {amountCheck.value}</strong>
              <span>收款：{account.name}</span>
              <span>FPS ID：{fpsId}</span>
              {referenceCheck.value && <span>參考：{referenceCheck.value}</span>}
              {course.title && <span>課程：{course.title}{course.courseNo ? `（${course.courseNo}）` : ''}</span>}
            </div>
            <div className="fps-action-grid">
              <button type="button" className="btn-sm" disabled={saving || !dirty} onClick={save}>
                {saving ? '儲存中…' : dirty ? '💾 儲存 QR 到此班' : '✓ 已是最新'}
              </button>
              <button type="button" className="btn-sm fps-secondary-btn" disabled={Boolean(working)} onClick={copyImage}>
                {working === 'copy' ? '複製中…' : '📋 複製 QR 圖片'}
              </button>
              <button type="button" className="btn-sm fps-secondary-btn" disabled={Boolean(working)} onClick={download}>
                {working === 'download' ? '下載中…' : '⬇️ 下載 PNG'}
              </button>
              {savedPayload && (
                <button type="button" className="btn-sm fps-secondary-btn" disabled={saving} onClick={clear}>🗑 移除已儲存 QR</button>
              )}
            </div>
            {dirty && savedPayload && <p className="fps-feedback info">此 QR 同已儲存版本唔同，記得按「儲存 QR 到此班」。</p>}
            {feedback && <p className={`fps-feedback ${feedback.tone}`} role="status">{feedback.text}</p>}
            <details className="fps-payload-details">
              <summary>查看 FPS QR 原始付款資料</summary>
              <textarea readOnly value={payload} rows={3} />
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
