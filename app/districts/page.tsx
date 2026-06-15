'use client';
import { DISTRICT_LIST, getDistrictStatusLabel, getDistrictStatusColor } from '@/lib/district';
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
      <p style={{ fontSize: 12.5, color: '#64748b' }}>想接入？請看「🧩 區接入」教學。</p>
    </>
  );
}
