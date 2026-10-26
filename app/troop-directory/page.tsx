'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import type { TroopDirectoryBoard } from '@/lib/types';
import TroopDirectoryEditor from '@/components/TroopDirectoryEditor';
import BackLink, { BackBar } from '@/components/BackLink';

export default function TroopDirectoryPage() {
  const session = useRequireCard('troopDirectory');
  const [board, setBoard] = useState<TroopDirectoryBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function load() {
    if (!session) return;
    setLoading(true); setError('');
    try {
      const r = await api.getTroopDirectoryBoard(session.token);
      if (r.ok && r.data) setBoard(r.data);
      else setError(r.error || '讀取失敗；請確認 GS 已更新至 v4.31.0、執行 setupSheets() 並重新部署。');
    } catch { setError('連線失敗，請稍後再試。'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session]);
  if (!session) return <div className="center"><div className="spinner" /></div>;
  return <>
    <BackLink />
    <h1 className="page-title">🧭 旅團資料</h1>
    <p className="page-sub">區幹部均可查看 · ADC 或以上可修改 · 與旅團探訪權限分開</p>
    {error && <div role="alert" className="err">{error}</div>}
    {message && <div role="status" className="success">{message}</div>}
    {loading ? <div className="center"><div className="spinner" /></div> : board && <TroopDirectoryEditor
      board={board} canEdit={board.permissionsVersion === 1 && board.canEdit} token={session.token}
      reload={load} flash={setMessage} setError={setError}
    />}
    <BackBar />
  </>;
}
