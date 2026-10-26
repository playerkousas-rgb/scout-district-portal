'use client';
/**
 * 📨 旅團申請／邀請（v4.32.0）— 成員端「聯絡區會」提交的請求探訪／邀請出席。
 * 權限行：troopRequests（👁 睇、✏️ 改狀態／指派）。支部 ADC 後台只回自己支部＋全旅申請。
 * 探訪完成後照舊喺「探訪登記」入正式紀錄，呢度淨係跟進申請狀態。
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { VisitRequest, VisitRequestsBoard, VisitRequestStatus, VisitSection } from '@/lib/types';
import { SECTION_LABEL } from '@/lib/visits';

const STATUS_LABEL: Record<VisitRequestStatus, string> = {
  new: '🆕 新申請',
  accepted: '✅ 已接納',
  declined: '🙏 已婉拒',
  done: '🏁 已完成',
  cancelled: '🚫 已取消',
};
const STATUSES = Object.keys(STATUS_LABEL) as VisitRequestStatus[];

type Draft = { status: VisitRequestStatus; assignedTo: string; districtNote: string };

export default function VisitRequestsPanel({ token }: { token: string }) {
  const [board, setBoard] = useState<VisitRequestsBoard | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);

  async function load() {
    setLoading(true); setError('');
    try {
      const r = await api.getVisitRequests(token);
      if (r.ok && r.data) {
        setBoard(r.data);
        const d: Record<string, Draft> = {};
        r.data.requests.forEach(x => { d[x.id] = { status: x.status, assignedTo: x.assignedTo || '', districtNote: x.districtNote || '' }; });
        setDrafts(d);
      } else setError(r.error || '讀取失敗；請確認 GS 已更新至 v4.32.0、執行 setupSheets() 並重新部署。');
    } catch { setError('連線失敗，請稍後再試。'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  const unitLabel = (troop: string) => board?.units.find(u => u.troop === troop)?.label || `第 ${troop} 旅`;
  const canEdit = board?.canEdit === true;

  async function save(x: VisitRequest) {
    const d = drafts[x.id];
    if (!d) return;
    setBusy(x.id); setError('');
    const r = await api.setVisitRequestStatus(token, x.id, d);
    setBusy('');
    if (r.ok) { setMsg(`已更新 ${x.refCode} ✓`); await load(); }
    else setError(r.error || '儲存失敗');
  }

  if (loading) return <div className="center"><div className="spinner" /></div>;
  return (
    <>
      {error && <div role="alert" className="err">{error}</div>}
      {msg && <div role="status" className="success">{msg}</div>}
      {board && board.scopeSection && (
        <p className="fps-help">你負責{SECTION_LABEL[board.scopeSection as VisitSection]}支部，呢度只顯示該支部及全旅的申請。</p>
      )}
      <div className="info-card">
        <div className="section-head">
          <div>
            <h3>📨 旅團申請／邀請（{board?.requests.length ?? 0}）</h3>
            <p>成員系統「聯絡區會」提交。{canEdit ? '可改狀態、指派負責幹部及加區會備註。' : '你目前只有查閱權限。'}完成探訪後，請照舊喺「🗺 探訪登記」登記正式紀錄。</p>
          </div>
          <label className="aw-check">
            <input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} /> 只睇未完成
          </label>
        </div>
        {!board || board.requests.length === 0 ? <p className="empty">暫時未有申請／邀請</p> : (
          <div className="mtx-scroll">
            <table className="perm-table">
              <thead>
                <tr><th>編號／日期</th><th>類別</th><th>旅團</th><th>內容</th><th>聯絡回覆</th><th>狀態／跟進</th>{canEdit && <th></th>}</tr>
              </thead>
              <tbody>
                {board.requests
                  .filter(x => !onlyOpen || (x.status === 'new' || x.status === 'accepted'))
                  .map(x => {
                    const d = drafts[x.id] || { status: x.status, assignedTo: x.assignedTo || '', districtNote: x.districtNote || '' };
                    return (
                      <tr key={x.id}>
                        <td style={{ whiteSpace: 'nowrap' }}><b>{x.refCode}</b><div className="aw-note-sm">{String(x.createdAt || '').slice(0, 10)}</div></td>
                        <td style={{ whiteSpace: 'nowrap' }}>{x.type === 'invite' ? '🎉 邀請出席' : '🏕 請求探訪'}</td>
                        <td><b>{unitLabel(x.troop)}</b><div className="aw-note-sm">{x.section ? SECTION_LABEL[x.section as VisitSection] : '全旅'}</div></td>
                        <td>
                          {x.activityName && <b>{x.activityName}</b>}
                          <div>{x.purpose}</div>
                          {(x.preferredDate || x.location) && (
                            <div className="aw-note-sm">{[x.preferredDate, x.preferredTime, x.location].filter(Boolean).join(' · ')}{x.attendeeCount ? ` · ${x.attendeeCount} 人` : ''}</div>
                          )}
                        </td>
                        <td>
                          {x.wantReply
                            ? <>{x.contactName && <div>{x.contactName}</div>}<div className="aw-note-sm">{x.contactType}: {x.contact}</div></>
                            : <span className="aw-note-sm">（申請人表示不用回覆）</span>}
                        </td>
                        <td>
                          {canEdit ? (
                            <div style={{ display: 'grid', gap: 6, minWidth: 190 }}>
                              <select value={d.status} onChange={e => setDrafts(prev => ({ ...prev, [x.id]: { ...d, status: e.target.value as VisitRequestStatus } }))}>
                                {STATUSES.map(st => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
                              </select>
                              <input value={d.assignedTo} placeholder="負責幹部" onChange={e => setDrafts(prev => ({ ...prev, [x.id]: { ...d, assignedTo: e.target.value } }))} />
                              <input value={d.districtNote} placeholder="區會備註" onChange={e => setDrafts(prev => ({ ...prev, [x.id]: { ...d, districtNote: e.target.value } }))} />
                            </div>
                          ) : (
                            <>
                              <span className="vs-badge ok">{STATUS_LABEL[x.status]}</span>
                              {x.assignedTo && <div className="aw-note-sm">負責：{x.assignedTo}</div>}
                              {x.districtNote && <div className="aw-note-sm">{x.districtNote}</div>}
                            </>
                          )}
                        </td>
                        {canEdit && (
                          <td><button className="mini-btn" disabled={busy === x.id} onClick={() => save(x)}>{busy === x.id ? '儲存中…' : '儲存'}</button></td>
                        )}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
