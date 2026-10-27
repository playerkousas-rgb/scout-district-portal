'use client';
/**
 * 🧭 旅團資料面板（v4.32.0 起嵌入「旅團」合併卡 /troop 的「旅團資料」分頁）
 * 只處理可公開予成員系統的旅團資料（權限行 troopDirectory）。
 * 🔒 私隱旅團聯絡已搬去「聯絡簿」的旅團分頁，並由 troopContacts 權限行獨立控制。
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TroopDirectoryBoard, UserSession } from '@/lib/types';
import TroopDirectoryEditor from './TroopDirectoryEditor';

export default function TroopDirectoryPanel({ session }: { session: UserSession }) {
  const [board, setBoard] = useState<TroopDirectoryBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const r = await api.getTroopDirectoryBoard(session.token);
      if (r.ok && r.data) setBoard(r.data);
      else setError(r.error || '讀取失敗；請確認 GS 已更新至 v4.32.0、執行 setupSheets() 並重新部署。');
    } catch { setError('連線失敗，請稍後再試。'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session]);

  return (
    <>
      <p className="page-sub">旅團公開資料：有「旅團資料」👁 可查看、✏️ 可修改（權限喺「⚙️ 權限／角色管理」設定）</p>
      {error && <div role="alert" className="err">{error}</div>}
      {message && <div role="status" className="success">{message}</div>}
      {loading
        ? <div className="center"><div className="spinner" /></div>
        : board && (
          <TroopDirectoryEditor
            board={board} canEdit={board.permissionsVersion === 1 && board.canEdit} token={session.token}
            reload={load} flash={setMessage} setError={setError}
          />
        )}
    </>
  );
}
