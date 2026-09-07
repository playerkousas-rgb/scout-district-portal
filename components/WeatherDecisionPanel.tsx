'use client';
/**
 * 天氣決策面板（意外／應變 → 🌦 天氣決策 分頁）
 * ─────────────────────────────────────────────────────────────────────
 * 1. 自動拉天文台「現正生效警告」(warnsum)
 * 2. 揀活動類別（戶內／戶外／海上）→ 即刻見到 ✅ 如常 / ⚠️ 留意 / ⛔ 取消 + 點解
 * 3. AQHI 天文台 API 冇提供 → 人手揀（連結去 aqhi.gov.hk）
 * 4. 「模擬」：無警告時可以試按某個警告，預先睇吓活動點處理（唔會影響真實資料）
 * 全部規則出自 活動指引通告 04/2018 表一（青少年活動；成人活動可酌情）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ACTIVITY_KINDS, AQHI_PAGE, AQHI_RULES, HKO_WARNING_PAGE, VERDICT_EMOJI, VERDICT_LABEL, WEATHER_RULES,
  decide, fetchWarnsum, matchRules, type ActiveWarning, type ActivityKind, type MatchedWarning,
} from '@/lib/weatherDecision';

function fmt(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function WeatherDecisionPanel() {
  const [live, setLive] = useState<ActiveWarning[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [kind, setKind] = useState<ActivityKind>('outdoor');
  const [aqhi, setAqhi] = useState('');
  const [sim, setSim] = useState<string[]>([]); // 模擬中嘅規則 id

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const w = await fetchWarnsum();
      setLive(w); setFetchedAt(new Date());
    } catch {
      setError('未能連接天文台（可能係網絡限制）。你可以用下方「模擬」按鈕對照，或直接開天文台網頁。');
      setLive(prev => prev || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const simulating = sim.length > 0;
  const warnings: ActiveWarning[] = useMemo(() => {
    if (simulating) return WEATHER_RULES.filter(r => sim.includes(r.id)).map(r => r.demo);
    return live || [];
  }, [live, sim, simulating]);
  const matched: MatchedWarning[] = useMemo(() => matchRules(warnings), [warnings]);
  const decision = useMemo(() => decide(matched, kind, aqhi || undefined), [matched, kind, aqhi]);
  const all = useMemo(() => ACTIVITY_KINDS.map(k => ({ k, d: decide(matched, k.id, aqhi || undefined) })), [matched, aqhi]);

  function toggleSim(id: string) {
    setSim(prev => {
      // 同一組（風球／暴雨／火災）只留一個
      const group = (x: string) => x.startsWith('tc') ? 'tc' : x.startsWith('rain') ? 'rain' : x.startsWith('fire') ? 'fire' : x;
      const g = group(id);
      const rest = prev.filter(p => p !== id && group(p) !== g);
      return prev.includes(id) ? prev.filter(p => p !== id) : [...rest, id];
    });
  }

  return (
    <>
      <div className={`wx-hero ${decision.verdict}`}>
        <div className="wx-hero-top">
          <div>
            <p className="wx-kicker">{simulating ? '🧪 模擬模式（唔係真實警告）' : '香港天文台 · 現正生效警告'}</p>
            <h2>{VERDICT_EMOJI[decision.verdict]} {decision.headline}</h2>
            <p className="wx-sub">
              {warnings.length
                ? warnings.map(w => matchRules([w])[0].rule ? `${matchRules([w])[0].rule!.emoji} ${w.name}` : `• ${w.name}`).join('　')
                : '現時冇任何天氣警告生效'}
              {fetchedAt && !simulating && <small>　· 於 {fmt(fetchedAt.toISOString())} 查詢</small>}
            </p>
          </div>
          <div className="wx-hero-actions">
            <button type="button" className="mini-btn" onClick={load} disabled={loading}>{loading ? '更新中…' : '🔄 重新查詢'}</button>
            <a className="mini-btn" href={HKO_WARNING_PAGE} target="_blank" rel="noopener">天文台警告頁 ↗</a>
          </div>
        </div>

        <div className="wx-kinds" role="tablist">
          {all.map(({ k, d }) => (
            <button key={k.id} type="button" role="tab" aria-selected={kind === k.id}
              className={`wx-kind ${d.verdict} ${kind === k.id ? 'on' : ''}`} onClick={() => setKind(k.id)} title={k.hint}>
              <b>{k.label}</b>
              <span>{VERDICT_EMOJI[d.verdict]} {VERDICT_LABEL[d.verdict]}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <div className="err" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="inc-two">
        <section className="info-card">
          <div className="section-head"><div><h3>📋 點解咁決定（{ACTIVITY_KINDS.find(k => k.id === kind)?.label}）</h3><p>活動指引通告 04/2018 表一 · 活動開始前 3 小時起至活動完結</p></div></div>
          {decision.reasons.length === 0 && decision.unknown.length === 0 && (
            <ul className="wx-reasons">
              <li className="go"><span className="v">✅</span><div><b>冇警告生效</b><small>如常進行；出發前 3 小時再查一次，活動期間留意天氣變化（1.2／1.5 條）</small></div></li>
            </ul>
          )}
          <ul className="wx-reasons">
            {decision.reasons.map((r, i) => (
              <li key={i} className={r.verdict}>
                <span className="v">{VERDICT_EMOJI[r.verdict]}</span>
                <div><b>{r.emoji} {r.label} → {VERDICT_LABEL[r.verdict]}</b><small>{r.note}</small></div>
              </li>
            ))}
            {decision.unknown.map((w, i) => (
              <li key={`u${i}`} className="caution">
                <span className="v">ℹ️</span>
                <div><b>{w.name}</b><small>04/2018 表一冇列明呢類警告；請按活動性質及天文台建議酌情處理。</small></div>
              </li>
            ))}
          </ul>
          <div className="wx-must">
            <b>無論取消與否都要做：</b>
            <ul>
              <li>用電話／WhatsApp／電郵通知所有參加者及工作人員（1.3 條）</li>
              <li>取消而未能通知所有人：如天氣及交通許可，領袖仍須到集合地點照顧已到者，安排安全回家（1.4 條）</li>
              <li>警告生效期間已在途中／現場者：留在安全地方直至警告解除，並設法通知家人</li>
              <li>就算冇警告，天氣明顯轉壞都可彈性延期／取消（1.5 條）；只有成人參加嘅活動可酌情，但須事前通知參加者（2.2 條）</li>
            </ul>
          </div>
        </section>

        <section className="info-card">
          <div className="section-head"><div><h3>😷 空氣質素（AQHI）</h3><p>天文台 API 冇提供，請開 aqhi.gov.hk 查現時指數再揀</p></div></div>
          <div className="wx-aqhi">
            <button type="button" className={`mini-btn ${aqhi === '' ? 'on' : ''}`} onClick={() => setAqhi('')}>≤ 6 正常</button>
            {AQHI_RULES.map(a => (
              <button key={a.id} type="button" className={`mini-btn ${aqhi === a.id ? 'on' : ''}`} onClick={() => setAqhi(a.id)}>{a.label}</button>
            ))}
            <a className="mini-btn" href={AQHI_PAGE} target="_blank" rel="noopener">查 AQHI ↗</a>
          </div>

          <div className="section-head" style={{ marginTop: 16 }}><div><h3>🧪 模擬：如果掛咗… 活動點處理？</h3><p>按一個或多個警告試吓（唔會改變真實資料）</p></div></div>
          <div className="wx-sim">
            {WEATHER_RULES.map(r => (
              <button key={r.id} type="button" className={`wx-chip ${sim.includes(r.id) ? 'on' : ''}`} onClick={() => toggleSim(r.id)}>
                {r.emoji} {r.short}
              </button>
            ))}
            {simulating && <button type="button" className="wx-chip clear" onClick={() => setSim([])}>✕ 清除模擬，返回實時</button>}
          </div>
        </section>
      </div>

      <section className="info-card">
        <div className="section-head"><div><h3>🗂 完整對照表（一眼睇晒）</h3><p>青少年活動；戶內活動仍須遵守場地／營地本身嘅惡劣天氣安排</p></div></div>
        <div className="mtx-scroll">
          <table className="perm-table inc-weather">
            <thead><tr><th style={{ textAlign: 'left' }}>警告</th><th>戶內</th><th>戶外</th><th>海上</th></tr></thead>
            <tbody>
              {WEATHER_RULES.map(r => (
                <tr key={r.id} className={matched.some(m => m.rule?.id === r.id) ? 'wx-active-row' : ''}>
                  <td style={{ textAlign: 'left', fontWeight: 700 }}>{r.emoji} {r.label}{matched.some(m => m.rule?.id === r.id) ? <span className="wx-now">生效中</span> : null}</td>
                  {(['indoor', 'outdoor', 'sea'] as ActivityKind[]).map(k => (
                    <td key={k} className={`w-${r.verdict[k] === 'go' ? 'ok' : r.verdict[k] === 'caution' ? 'warn' : 'cancel'}`} title={r.note[k]}>
                      {VERDICT_EMOJI[r.verdict[k]]} {VERDICT_LABEL[r.verdict[k]]}
                    </td>
                  ))}
                </tr>
              ))}
              {AQHI_RULES.map(a => (
                <tr key={a.id}>
                  <td style={{ textAlign: 'left', fontWeight: 700 }}>😷 {a.label}</td>
                  {(['indoor', 'outdoor', 'sea'] as ActivityKind[]).map(k => (
                    <td key={k} className={`w-${a.verdict[k] === 'go' ? 'ok' : a.verdict[k] === 'caution' ? 'warn' : 'cancel'}`} title={a.note}>
                      {VERDICT_EMOJI[a.verdict[k]]} {VERDICT_LABEL[a.verdict[k]]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fps-help">資料：香港童軍總會 活動指引通告 04/2018《惡劣天氣及空氣污染應變措施》表一；實時警告：香港天文台開放數據。此工具只係輔助，最終決定由活動負責領袖按實際情況作出。</p>
      </section>
    </>
  );
}
