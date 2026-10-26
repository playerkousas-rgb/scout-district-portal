'use client';

import { useCallback, useEffect, useState } from 'react';
import BackLink, { BackBar } from '@/components/BackLink';
import { api } from '@/lib/api';
import { useRequireCardAccess } from '@/lib/cardAccess';
import type { DistrictFeedback } from '@/lib/types';

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' });
}

export default function DCFeedbackPage() {
  const { session, checking, error: accessError, retry } = useRequireCardAccess('dcFeedback', { redirectOnError: false });
  const [items, setItems] = useState<DistrictFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    const result = await api.getDCFeedback(session.token);
    setLoading(false);
    if (!result.ok || !Array.isArray(result.data)) {
      setError(result.error || '暫時未能載入保密留言，請稍後重試。');
      return;
    }
    setItems(result.data);
  }, [session]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  if (checking) return <div className="center"><div className="spinner" /></div>;
  if (!session) return (
    <><BackLink /><section className="info-card"><h2>無法驗證帳戶</h2><p role="alert">{accessError || '請重新登入後再試。'}</p><button className="btn-sm fps-secondary-btn" onClick={retry}>重試權限檢查</button></section></>
  );

  return (
    <>
      <BackLink />
      <h1 className="page-title">🔒 DC 保密留言</h1>
      <p className="page-sub">只限區總監查閱；系統超級管理員亦可存取。資料在主試算表的 DCConfidential 分頁；此限制不阻止主試算表其他檢視者直接讀取該分頁。</p>

      <section className="info-card" aria-label="DC 保密留言列表">
        <div className="section-head">
          <div><h3>只限區總監查閱</h3><p>共 {items.length} 則。請勿複製或轉發留言內容；如有通知電郵，電郵只含參考編號。</p></div>
          <button className="btn-sm fps-secondary-btn" type="button" disabled={loading} onClick={() => setRefreshKey(x => x + 1)}>重新整理</button>
        </div>

        {(accessError || error) && <div className="fps-notice" role="alert">
          {accessError || error}
          <button className="btn-sm fps-secondary-btn" type="button" style={{ marginLeft: 10 }} onClick={() => { retry(); setRefreshKey(x => x + 1); }}>重試</button>
        </div>}
        {loading ? <div className="center"><div className="spinner" /></div> : items.length === 0 ? (
          <p className="fps-notice">目前沒有 DC 保密留言。</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="perm-table">
              <thead><tr><th>提交時間／編號</th><th>類別</th><th>留言</th><th>聯絡資料</th></tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td style={{ minWidth: 170, textAlign: 'left' }}><b>{dateLabel(item.createdAt)}</b><br /><small>{item.refCode}</small></td>
                    <td>{item.category === 'support' ? '🧰 需要支援' : '💡 意見'}</td>
                    <td style={{ minWidth: 280, whiteSpace: 'pre-wrap', textAlign: 'left' }}>{item.message}</td>
                    <td style={{ minWidth: 180, textAlign: 'left' }}>
                      {item.wantReply ? <><b>{item.contactName || '希望回覆'}</b><br /><small>{({ phone: '電話', email: '電郵', ig: 'Instagram', fb: 'Facebook' } as Record<string, string>)[item.contactType] || item.contactType}: {item.contact}</small></> : '不需要回覆'}
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
