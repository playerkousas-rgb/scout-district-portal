'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { loadSession } from '@/lib/session';
import { useDistrict } from '@/lib/useDistrict';
import type { UserSession, PluginItem } from '@/lib/types';

export default function PluginsPage() {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const [session, setSession] = useState<UserSession | null>(null);
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [registryUrl, setRegistryUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function reload(token: string) {
    setLoading(true);
    try {
      const r = await api.getRegistry(token);
      if (r.ok && r.data) { setPlugins(r.data.plugins); setRegistryUrl(r.data.registryUrl); }
      else setError(r.error || '無法載入外掛名錄');
    } catch { setError('連線失敗：請確認 registry 網址可讀且後台已部署。'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace(withDistrict('/')); return; }
    if (!s.isAdmin) { router.replace(withDistrict('/')); return; }
    setSession(s); reload(s.token);
  }, [router, withDistrict]);

  async function install(p: PluginItem) {
    if (!session) return;
    setBusy(p.id); setMsg(''); setError('');
    try {
      const r = await api.installPlugin(session.token, p);
      if (r.ok) { setMsg(`已安裝「${p.title}」，可到權限管理設定誰可見。`); reload(session.token); }
      else setError(r.error || '安裝失敗');
    } catch { setError('連線失敗'); } finally { setBusy(''); }
  }
  async function uninstall(p: PluginItem) {
    if (!session || !confirm(`確定解除安裝「${p.title}」？`)) return;
    setBusy(p.id); setMsg(''); setError('');
    try {
      const r = await api.uninstallPlugin(session.token, p.id);
      if (r.ok) { setMsg(`已解除安裝「${p.title}」。`); reload(session.token); }
      else setError(r.error || '解除失敗');
    } catch { setError('連線失敗'); } finally { setBusy(''); }
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <span className="backlink" onClick={() => router.push(withDistrict('/'))}>← 返回主控台</span>
      <h1 className="page-title">🧩 外掛市集</h1>
      <p className="page-sub">官方外掛名錄（讀遠端轉駁器）。安裝後成為卡片，預設只有區總監可見，可到權限管理設定誰看得到。</p>
      {registryUrl && <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14, wordBreak: 'break-all' }}>來源：{registryUrl}</p>}
      {msg && <div className="ok-msg" style={{ marginBottom: 12 }}>{msg}</div>}
      {error && <div className="err" style={{ maxWidth: 560 }}>{error}</div>}
      {loading && <div className="center"><div className="spinner" /><div>載入中…</div></div>}
      {!loading && plugins.length === 0 && !error && (
        <div className="placeholder-box"><div className="big">🧩</div><p>目前沒有可用外掛，或 registry 尚未設定。</p></div>
      )}
      {!loading && plugins.length > 0 && (
        <div className="grid">
          {plugins.map(p => (
            <div key={p.id} className="card t-jump" style={{ cursor: 'default' }}>
              <span className="pill jump">外掛</span>
              <div className="ico">{p.icon}</div>
              <h3>{p.title}</h3>
              <div className="desc">{p.description}</div>
              <div style={{ marginTop: 6 }}>
                {p.needsDistrictBackend
                  ? <span className="ver" style={{ background: '#fff3e0', color: '#e65100' }}>需自建後台</span>
                  : <span className="ver" style={{ background: '#e8f5e9', color: '#2e7d32' }}>即插即用</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {p.version && <span className="ver">v{p.version}</span>}
                {p.embed && <span className="ver">無感</span>}
                {p.installed
                  ? <button className="mini-btn danger" disabled={busy === p.id} onClick={() => uninstall(p)} style={{ marginLeft: 'auto' }}>{busy === p.id ? '處理中…' : '解除安裝'}</button>
                  : <button className="mini-btn" disabled={busy === p.id} onClick={() => install(p)} style={{ marginLeft: 'auto' }}>{busy === p.id ? '安裝中…' : '➕ 安裝'}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
