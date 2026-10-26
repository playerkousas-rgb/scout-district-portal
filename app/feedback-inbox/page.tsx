'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import BackLink, { BackBar } from '@/components/BackLink';
import { api } from '@/lib/api';
import { useRequireCardAccess } from '@/lib/cardAccess';
import type { DistrictFeedback } from '@/lib/types';

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' });
}

export default function FeedbackInboxPage() {
  const { session, checking, error: accessError, retry } = useRequireCardAccess('feedback', { redirectOnError: false });
  const [items, setItems] = useState<DistrictFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'opinion' | 'support'>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    const result = await api.getDistrictFeedback(session.token);
    setLoading(false);
    if (!result.ok || !Array.isArray(result.data)) {
      setError(result.error || '暫時未能載入意見，請稍後重試。');
      return;
    }
    setItems(result.data);
  }, [session]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const shown = useMemo(
    () => filter === 'all' ? items : items.filter(item => item.category === filter),
    [filter, items],
  );

  if (checking) return <div className="center"><div className="spinner" /></div>;
  if (!session) return (
    <><BackLink /><section className="info-card"><h2>無法驗證帳戶</h2><p role="alert">{accessError || '請重新登入後再試。'}</p><button className="btn-sm fps-secondary-btn" onClick={retry}>重試權限檢查</button></section></>
  );

  return (
    <>
      <BackLink />
      <h1 className="page-title">💬 你講我聽｜意見箱</h1>
      <p className="page-sub">一般意見及支援留言。DC 保密留言存放在獨立試算表，不會顯示於此列表。</p>

      <section className="info-card" aria-label="意見列表">
        <div className="section-head">
          <div><h3>一般留言</h3><p>共 {items.length} 則 · 留言內容及自願提供的聯絡資料僅供有權限的區務人員查閱。</p></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select aria-label="篩選留言類別" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
              <option value="all">全部類別</option>
              <option value="opinion">意見</option>
              <option value="support">需要支援</option>
            </select>
            <button className="btn-sm fps-secondary-btn" type="button" disabled={loading} onClick={() => setRefreshKey(x => x + 1)}>重新整理</button>
          </div>
        </div>

        {(accessError || error) && (
          <div className="fps-notice" role="alert">
            {accessError || error}
            <button className="btn-sm fps-secondary-btn" type="button" style={{ marginLeft: 10 }} onClick={() => { retry(); setRefreshKey(x => x + 1); }}>重試</button>
          </div>
        )}
        {loading ? <div className="center"><div className="spinner" /></div> : shown.length === 0 ? (
          <p className="fps-notice">{items.length ? '此類別暫無留言。' : '目前沒有一般留言。'}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="perm-table">
              <thead><tr><th>提交時間／編號</th><th>類別</th><th>留言</th><th>聯絡資料</th></tr></thead>
              <tbody>
                {shown.map(item => (
                  <tr key={item.id}>
                    <td style={{ minWidth: 170, textAlign: 'left' }}><b>{dateLabel(item.createdAt)}</b><br /><small>{item.refCode}</small></td>
                    <td>{item.category === 'support' ? '🧰 需要支援' : '💡 意見'}</td>
                    <td style={{ minWidth: 280, whiteSpace: 'pre-wrap', textAlign: 'left' }}>{item.message}</td>
                    <td style={{ minWidth: 180, textAlign: 'left' }}>
                      {item.wantReply ? <>
                        <b>{item.contactName || '希望回覆'}</b><br />
                        <small>{({ phone: '電話', email: '電郵', ig: 'Instagram', fb: 'Facebook' } as Record<string, string>)[item.contactType] || item.contactType}: {item.contact}</small>
                      </> : <span>不需要回覆</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <BackBar />
    </>
  );
}
