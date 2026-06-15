'use client';
export default function DistrictUnavailableNotice({
  districtName,
  message,
}: {
  districtName?: string;
  message: string;
}) {
  return (
    <div className="notice-box">
      <div className="big">🚧</div>
      <h2>{districtName ? `${districtName}暫停服務` : '服務暫停'}</h2>
      <p style={{ color: '#64748b', fontSize: 14 }}>{message}</p>
    </div>
  );
}
