'use client';
/**
 * 📜 通告版面（v4.12.0）— 職員端預覽＋列印（傳統格式 PDF，例 2607）。
 * 節數表／班領導人／參加資格／費用＋FPS QR／名額／截止／報名辦法／
 * 服裝／備註／查詢／署名。列印即成 PDF 上載區網（即時數據列印時自動隱藏）。
 */
import { QRCodeCanvas } from 'qrcode.react';
import type { Circular } from '@/lib/types';
import { buildFpsPayload, checkAmount, normalizeFpsId } from '@/lib/fps';

export const CIRCULAR_CATEGORIES = ['訓練班', '活動', '服務', '比賽', '會議', '行政', '其他'];
export const CIRCULAR_SECTIONS = ['小童軍', '幼童軍', '童軍', '深資童軍', '樂行童軍', '領袖'];
export const CIRCULAR_STATUS_LABEL: Record<string, string> = {
  draft: '📝 草稿',
  published: '📢 已發佈',
  closed: '⛔ 已截止',
  archived: '🗄 已封存',
};

export interface CircularViewProps {
  circular: Circular;
  districtName: string;
  districtCode?: string;
  fpsAccount?: { name: string; id: string };
  memberPortalUrl?: string;
  /** 額外操作列（例如列印掣）— 列印時自動隱藏 */
  actions?: React.ReactNode;
}

function sessionsOf(c: Circular) {
  const s = c.sessions as unknown;
  if (Array.isArray(s)) return s.filter(r => r && (r.date || r.time || r.venue));
  return [];
}

function attachmentsOf(c: Circular) {
  const a = c.attachments as unknown;
  if (Array.isArray(a)) return a.filter(r => r && (r.label || r.url));
  return [];
}

export default function CircularView({ circular: c, districtName, districtCode, fpsAccount, memberPortalUrl, actions }: CircularViewProps) {
  const sessions = sessionsOf(c);
  const attachments = attachmentsOf(c);
  const feeCheck = checkAmount((c.fee || '').trim());
  const showFps = !feeCheck.error && !!feeCheck.value && !!normalizeFpsId(fpsAccount?.id);
  const fpsPayload = showFps
    ? buildFpsPayload(normalizeFpsId(fpsAccount?.id), feeCheck.value, `CR${String(c.circularNo || '').trim()}`.slice(0, 25))
    : '';
  const filled = c.course?.filled !== undefined && c.course?.filled !== '' ? Number(c.course.filled) : null;
  const quota = c.quota !== undefined && String(c.quota).trim() !== '' ? Number(c.quota) : null;
  const signupText = (c.signupUrl || '').trim()
    || (c.courseId && memberPortalUrl ? `${memberPortalUrl.replace(/\/+$/, '')}/training` : '');

  return (
    <article className="circular-paper">
      {c.status === 'closed' && (
        <div className="circular-closed-banner">⛔ 本通告已截止報名（只供查閱）</div>
      )}
      {c.status === 'archived' && (
        <div className="circular-closed-banner archived">🗄 本通告已封存（歷史紀錄，只供查閱）</div>
      )}

      <header className="circular-head">
        <div className="circular-kicker">{districtName || '童軍區'}通告</div>
        <h1 className="circular-title">{c.title}</h1>
        <div className="circular-meta">
          <span className="circular-no">第 {c.circularNo} 號</span>
          {c.category && <span className="role-chip">{c.category}</span>}
          {String(c.sections || '').split('、').filter(Boolean).map(s => (
            <span key={s} className="role-chip">{s}</span>
          ))}
          {c.issueDate && <span className="circular-date">發出日期：{c.issueDate}</span>}
        </div>
      </header>

      {sessions.length > 0 && (
        <table className="circular-sessions">
          <thead>
            <tr><th>日　期</th><th>時　間</th><th>地　點</th></tr>
          </thead>
          <tbody>
            {sessions.map((r, i) => (
              <tr key={i}><td>{r.date}</td><td>{r.time}</td><td>{r.venue}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <dl className="circular-fields">
        {c.leader && (
          <><dt>班領導人</dt><dd>{c.leader}</dd></>
        )}
        {c.eligibility && (
          <><dt>參加資格</dt><dd className="prewrap">{c.eligibility}</dd></>
        )}
        {(c.fee || c.originalFee || c.subsidyNote) && (
          <>
            <dt>費　用</dt>
            <dd>
              {c.fee && <div>活動費用港幣 <b>{c.fee}</b> 元正{c.originalFee ? `（原價港幣 ${c.originalFee} 元）` : ''}</div>}
              {c.subsidyNote && <div className="prewrap" style={{ marginTop: 4 }}>{c.subsidyNote}</div>}
              {showFps && fpsAccount && (
                <div className="circular-fps">
                  <div className="circular-fps-qr">
                    <QRCodeCanvas value={fpsPayload} size={512} level="M" marginSize={2} style={{ display: 'block', width: '100%', height: 'auto' }} />
                    <small>掃瞄付款</small>
                  </div>
                  <div className="circular-fps-info">
                    <div>轉數快繳付，帳戶識別碼 <b>{fpsAccount.id}</b></div>
                    <div className="fps-acct">{fpsAccount.name}</div>
                    <div>銀碼：<b>HK$ {feeCheck.value}</b></div>
                    <div>備註請註明【{c.title}】及【參加者姓名】</div>
                  </div>
                </div>
              )}
            </dd>
          </>
        )}
        {(c.quota || (filled !== null && !isNaN(filled))) && (
          <>
            <dt>名　額</dt>
            <dd>
              {c.quota ? `${c.quota} 人` : '—'}
              {filled !== null && !isNaN(filled) && (
                <span className="muted no-print">（已報名 {filled} 人{quota !== null && !isNaN(quota) && quota > 0 ? `，尚餘 ${Math.max(0, quota - filled)} 個名額` : ''}）</span>
              )}
            </dd>
          </>
        )}
        {c.deadline && (
          <><dt>截止日期</dt><dd>{c.deadline}</dd></>
        )}
        {(c.courseId || signupText) && (
          <>
            <dt>報名辦法</dt>
            <dd>
              <div>成員須前往成員系統訓練班頁填表報名{c.course?.title ? `（${c.course.title}）` : ''}：</div>
              {signupText && (
                <div>
                  <a href={signupText} target="_blank" rel="noopener noreferrer">{signupText} ↗</a>
                </div>
              )}
              {c.course && (c.course.deadline || c.course.quota) && (
                <div className="muted no-print" style={{ fontSize: 12, marginTop: 4 }}>
                  {c.course.deadline ? `該班截止：${c.course.deadline}` : ''}
                  {c.course.deadline && c.course.quota ? ' · ' : ''}
                  {c.course.quota ? `名額 ${c.course.filled || 0} / ${c.course.quota}` : ''}
                </div>
              )}
            </dd>
          </>
        )}
        {c.uniform && (
          <><dt>服　裝</dt><dd className="prewrap">{c.uniform}</dd></>
        )}
        {c.remarks && (
          <><dt>備　註</dt><dd className="prewrap">{c.remarks}</dd></>
        )}
        {(c.contactName || c.contactEmail || c.contactPhone || c.enquiryNote) && (
          <>
            <dt>查　詢</dt>
            <dd>
              {c.enquiryNote && <div className="prewrap" style={{ marginBottom: 4 }}>{c.enquiryNote}</div>}
              <div>
                {[c.contactName, c.contactPhone ? `電話 ${c.contactPhone}` : '', c.contactEmail].filter(Boolean).join(' · ')}
              </div>
              {c.contactEmail && (
                <div><a href={`mailto:${c.contactEmail}`}>{c.contactEmail}</a></div>
              )}
            </dd>
          </>
        )}
        {attachments.length > 0 && (
          <>
            <dt>附　件</dt>
            <dd>
              {attachments.map((a, i) => (
                <div key={i}>
                  {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer">{a.label || a.url} ↗</a> : (a.label || '')}
                </div>
              ))}
            </dd>
          </>
        )}
      </dl>

      {(c.issuer || c.signedBy) && (
        <div className="circular-sign">
          {c.issuer && <div>{c.issuer}</div>}
          {c.signedBy && <div>（{c.signedBy} 代行）</div>}
        </div>
      )}

      <footer className="circular-foot muted">
        {districtName}第 {c.circularNo} 號通告
        {c.publishedAt ? ` · 發佈於 ${c.publishedAt.slice(0, 10)}` : ''}
      </footer>

      {actions && <div className="circular-actions no-print">{actions}</div>}
    </article>
  );
}
