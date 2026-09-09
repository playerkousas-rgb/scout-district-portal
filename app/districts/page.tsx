'use client';
import { DISTRICT_LIST, getDistrictStatusLabel, getDistrictStatusColor } from '@/lib/district';
import { enterDemoRole } from '@/lib/demo/session';
import { DEMO_IDENTITIES } from '@/lib/demo/seed';

export default function DistrictsPage() {
  return (
    <>
      <h1 className="page-title">🌏 使用地區</h1>
      <p className="page-sub">已接入本平台的童軍區。每區各自獨立後台，資料互不相通。</p>
      <div className="info-card">
        {DISTRICT_LIST.map(d => (
          <div className="role-row" key={d.code}>
            <span className="rname">{d.name}</span>
            <span className="rcode">{d.code}</span>
            <span className="status-pill" style={{ background: getDistrictStatusColor(d.status) }}>
              {getDistrictStatusLabel(d.status)}
            </span>
            {d.note && <span style={{ fontSize: 12, color: '#64748b' }}>{d.note}</span>}
          </div>
        ))}
      </div>
      <div className="demo-entry" style={{ marginTop: 16 }}>
        <div className="demo-entry-head">
          <span className="demo-badge">🎭 模擬示範版</span>
          <span className="demo-entry-title">想睇下系統係咩樣？入嚟試下（唔使帳戶）</span>
        </div>
        <p className="demo-entry-desc">完整示範資料、全部功能任試，改動只存喺你嘅瀏覽器，唔會影響任何正式後台。以助理區總監（ADC）身份進入，示範版權限全開（成人獎勵提名唔喺示範範圍）。</p>
        <div className="demo-entry-roles">
          {DEMO_IDENTITIES.map(r => (
            <button
              key={r.key}
              type="button"
              className="demo-chip demo-entry-chip"
              style={{ borderColor: r.color }}
              onClick={() => { enterDemoRole(r.key); window.location.assign('/'); }}
              title={r.desc}
            >
              {r.icon} 以{r.label}示範
            </button>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: '#64748b' }}>想接入？請看「🧩 區接入」教學。</p>
    </>
  );
}
