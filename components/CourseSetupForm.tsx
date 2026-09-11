'use client';
/**
 * 🆕 新制直入表單（v4.14.0）— 成份開班設定喺區系統填（Input01／02／03＋通告人手格）。
 * 座標同 v4.13.0 工作簿模版一致；儲存→寫入班 Sheet。
 */
import type { CourseSetup, SetupExpenses } from '@/lib/types';
import { budgetTotals, money, SETUP_TRANSPORT_GROUPS } from '@/lib/course-setup';

interface Props {
  setup: CourseSetup;
  onChange: (s: CourseSetup) => void;
  /** 批核模式（v4.17.0）：收起唔准管理層改嘅部分（職員表／時間表） */
  hide?: { staff?: boolean; timetable?: boolean };
}

const inp: React.CSSProperties = { padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 };
const th: React.CSSProperties = { background: '#f1f5f9', fontSize: 12.5, padding: '5px 6px', textAlign: 'left', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: 2 };

function T(props: { value: string; onChange: (v: string) => void; width?: number; placeholder?: string; type?: string }) {
  return <input type={props.type || 'text'} value={props.value} placeholder={props.placeholder || ''}
    onChange={e => props.onChange(e.target.value)} style={{ ...inp, width: props.width || 110 }} />;
}
function A(props: { value: string; onChange: (v: string) => void; rows?: number; width?: string; placeholder?: string }) {
  return <textarea value={props.value} placeholder={props.placeholder || ''} rows={props.rows || 2}
    onChange={e => props.onChange(e.target.value)} style={{ ...inp, width: props.width || '100%' }} />;
}

export default function CourseSetupForm({ setup: s, onChange, hide }: Props) {
  const set = <K extends keyof CourseSetup>(k: K, v: CourseSetup[K]) => onChange({ ...s, [k]: v });
  const setExp = (k: keyof SetupExpenses, v: SetupExpenses[keyof SetupExpenses]) =>
    onChange({ ...s, expenses: { ...s.expenses, [k]: v } });
  const t = budgetTotals(s);

  const secStyle: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', marginBottom: 12, background: '#fff' };
  const hStyle: React.CSSProperties = { margin: '0 0 8px', fontSize: 15, cursor: 'pointer', userSelect: 'none' };

  return (
    <div>
      {/* ── A. 基本資料 ── */}
      <details open style={secStyle}>
        <summary style={hStyle}>📋 A. 基本資料（Input01 頭段）</summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <label>班名* <T value={s.courseName} onChange={v => set('courseName', v)} width={260} placeholder="例：第2屆急救工作坊" /></label>
          <label>屆別 <T value={s.edition} onChange={v => set('edition', v)} width={50} /></label>
          <label>支部 <T value={s.section} onChange={v => set('section', v)} width={90} placeholder="童軍／領袖…" /></label>
          <label>專章 <T value={s.badge} onChange={v => set('badge', v)} width={110} /></label>
          <label>自定義名稱 <T value={s.customName} onChange={v => set('customName', v)} width={130} /></label>
          <label>形式-1 <T value={s.form1} onChange={v => set('form1', v)} width={90} /></label>
          <label>形式-2 <T value={s.form2} onChange={v => set('form2', v)} width={90} /></label>
          <label>預計收生 <T value={s.expectedIntake} onChange={v => set('expectedIntake', v)} width={60} /></label>
          <label>預計收費$ <T value={s.expectedFee} onChange={v => set('expectedFee', v)} width={70} /></label>
          <label>預計職員 <T value={s.expectedStaff} onChange={v => set('expectedStaff', v)} width={60} /></label>
        </div>
        <div style={{ marginTop: 8 }}>
          <b style={{ fontSize: 13 }}>預算日期（最多 9 行）</b>
          <table><tbody>
            {s.budgetDates.map((d, i) => (
              <tr key={i}>
                <td style={td}><T type="date" value={d.date} onChange={v => { const a = [...s.budgetDates]; a[i] = { ...a[i], date: v }; set('budgetDates', a); }} width={130} /></td>
                <td style={td}><T value={d.time} onChange={v => { const a = [...s.budgetDates]; a[i] = { ...a[i], time: v }; set('budgetDates', a); }} width={130} placeholder="0000 - 2359" /></td>
                <td style={td}><T value={d.venue} onChange={v => { const a = [...s.budgetDates]; a[i] = { ...a[i], venue: v }; set('budgetDates', a); }} width={160} placeholder="場地" /></td>
                <td style={td}>{s.budgetDates.length > 1 && <button className="mini-btn" onClick={() => set('budgetDates', s.budgetDates.filter((_, j) => j !== i))}>✕</button>}</td>
              </tr>
            ))}
          </tbody></table>
          {s.budgetDates.length < 9 && <button className="mini-btn" onClick={() => set('budgetDates', [...s.budgetDates, { date: '', time: '', venue: '' }])}>＋ 加日期</button>}
        </div>
      </details>

      {/* ── B. 預算 ── */}
      <details style={secStyle}>
        <summary style={hStyle}>💰 B. 預算開支（Input01）— 總支出 ${money(t.total)}・總收入 ${money(t.income)}・申請津貼 ${money(t.subsidy)}</summary>
        <b style={{ fontSize: 13 }}>1. 膳食（8 行；小計 ${money(t.meals)}）</b>
        <div style={{ overflowX: 'auto' }}><table>
          <thead><tr>{['日期', '時間', '早餐$', '午餐$', '晚餐$', '茶點$', '飲用水$', '職員/學員'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{s.expenses.meals.map((l, i) => (
            <tr key={i}>
              <td style={td}><T type="date" value={l.date} width={125} onChange={v => { const a = [...s.expenses.meals]; a[i] = { ...a[i], date: v }; setExp('meals', a); }} /></td>
              <td style={td}><T value={l.time} width={90} onChange={v => { const a = [...s.expenses.meals]; a[i] = { ...a[i], time: v }; setExp('meals', a); }} /></td>
              {(['breakfast', 'lunch', 'dinner', 'snack', 'water'] as const).map(f => (
                <td key={f} style={td}><T value={l[f]} width={60} onChange={v => { const a = [...s.expenses.meals]; a[i] = { ...a[i], [f]: v }; setExp('meals', a); }} /></td>
              ))}
              <td style={td}><select value={l.who} onChange={e => { const a = [...s.expenses.meals]; a[i] = { ...a[i], who: e.target.value }; setExp('meals', a); }} style={inp}>
                <option value="">—</option><option value="職員">職員</option><option value="學員">學員</option>
              </select></td>
            </tr>
          ))}</tbody>
        </table></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8 }}>
          {([['venue', '2.1 場租', t.venue, ['數量', '', '單價$']], ['camp', '2.2 露營', t.camp, ['日/晚數', '人數', '價格$']], ['lodging', '2.3 住宿', t.lodging, ['晚數', '房數', '價格$']]] as const).map(([k, label, sub, cols]) => (
            <div key={k}>
              <b style={{ fontSize: 13 }}>{label}（小計 ${money(sub)}）</b>
              <table><thead><tr>{['地點', '時段/營期', ...cols].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{(s.expenses[k] as { place: string; period: string; qty: string; qty2: string; price: string }[]).map((l, i) => (
                  <tr key={i}>
                    <td style={td}><T value={l.place} width={110} onChange={v => { const a = [...s.expenses[k]]; a[i] = { ...a[i], place: v }; setExp(k, a as never); }} /></td>
                    <td style={td}><T value={l.period} width={80} onChange={v => { const a = [...s.expenses[k]]; a[i] = { ...a[i], period: v }; setExp(k, a as never); }} /></td>
                    <td style={td}><T value={l.qty} width={55} onChange={v => { const a = [...s.expenses[k]]; a[i] = { ...a[i], qty: v }; setExp(k, a as never); }} /></td>
                    {k !== 'venue' && <td style={td}><T value={l.qty2} width={55} onChange={v => { const a = [...s.expenses[k]]; a[i] = { ...a[i], qty2: v }; setExp(k, a as never); }} /></td>}
                    <td style={td}><T value={l.price} width={65} onChange={v => { const a = [...s.expenses[k]]; a[i] = { ...a[i], price: v }; setExp(k, a as never); }} /></td>
                  </tr>
                ))}</tbody></table>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <b style={{ fontSize: 13 }}>3. 交通（小計 ${money(t.transport)}）</b>
          <table><tbody>{s.expenses.transport.map((l, i) => (
            <tr key={i}>
              <td style={{ ...td, fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{SETUP_TRANSPORT_GROUPS[i]}</td>
              <td style={td}><T value={l.route} width={280} placeholder="日期／路線／車種" onChange={v => { const a = [...s.expenses.transport]; a[i] = { ...a[i], route: v }; setExp('transport', a); }} /></td>
              <td style={td}>$<T value={l.budget} width={80} onChange={v => { const a = [...s.expenses.transport]; a[i] = { ...a[i], budget: v }; setExp('transport', a); }} /></td>
            </tr>
          ))}</tbody></table>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8 }}>
          {([['handouts', '4. 講義', t.handouts], ['program', '5. 節目', t.program], ['admin', '6. 行政', t.admin], ['souvenir', '7. 紀念品', t.souvenir]] as const).map(([k, label, sub]) => (
            <div key={k}>
              <b style={{ fontSize: 13 }}>{label}（小計 ${money(sub)}）</b>
              <table><thead><tr>{['項目', '數量', '單價$'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{(s.expenses[k] as { item: string; qty: string; price: string }[]).map((l, i) => (
                  <tr key={i}>
                    <td style={td}><T value={l.item} width={150} onChange={v => { const a = [...s.expenses[k]]; a[i] = { ...a[i], item: v }; setExp(k, a as never); }} /></td>
                    <td style={td}><T value={l.qty} width={55} onChange={v => { const a = [...s.expenses[k]]; a[i] = { ...a[i], qty: v }; setExp(k, a as never); }} /></td>
                    <td style={td}><T value={l.price} width={65} onChange={v => { const a = [...s.expenses[k]]; a[i] = { ...a[i], price: v }; setExp(k, a as never); }} /></td>
                  </tr>
                ))}</tbody></table>
            </div>
          ))}
          <div>
            <b style={{ fontSize: 13 }}>8. 其他（小計 ${money(t.misc)}）</b>
            <table><thead><tr>{['註明', '金額$'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{s.expenses.misc.map((l, i) => (
                <tr key={i}>
                  <td style={td}><T value={l.item} width={150} onChange={v => { const a = [...s.expenses.misc]; a[i] = { ...a[i], item: v }; setExp('misc', a); }} /></td>
                  <td style={td}><T value={l.amount} width={80} onChange={v => { const a = [...s.expenses.misc]; a[i] = { ...a[i], amount: v }; setExp('misc', a); }} /></td>
                </tr>
              ))}</tbody></table>
          </div>
        </div>
      </details>

      {/* ── C. 班資料 ── */}
      <details open style={secStyle}>
        <summary style={hStyle}>📅 C. 班資料（Input02）</summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <label>名額 <T value={s.quota} onChange={v => set('quota', v)} width={60} /></label>
          <label>收費$ <T value={s.fee} onChange={v => set('fee', v)} width={70} /></label>
          <label>職員人數 <T value={s.staffCount} onChange={v => set('staffCount', v)} width={60} /></label>
          <label>截止報名 <T type="date" value={s.deadline} onChange={v => set('deadline', v)} width={130} /></label>
          <label>最遲公佈取錄 <T type="date" value={s.publishDate} onChange={v => set('publishDate', v)} width={130} /></label>
          <label>常駐職員 <T value={s.residentStaff} onChange={v => set('residentStaff', v)} width={60} /></label>
        </div>
        <b style={{ fontSize: 13 }}>活動日期及場地（8 行；剔 ✓上通告＋填通告顯示嗰節先出通告）</b>
        <div style={{ overflowX: 'auto' }}><table>
          <thead><tr>{['日期', '跨日', '時間', '場地', '✓上通告', '通告顯示日期', '通告顯示時間', '通告顯示地點'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{s.sessions.map((x, i) => (
            <tr key={i}>
              <td style={td}><T type="date" value={x.date} width={125} onChange={v => { const a = [...s.sessions]; a[i] = { ...a[i], date: v }; set('sessions', a); }} /></td>
              <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={x.spanNext} onChange={e => { const a = [...s.sessions]; a[i] = { ...a[i], spanNext: e.target.checked }; set('sessions', a); }} /></td>
              <td style={td}><T value={x.time} width={110} onChange={v => { const a = [...s.sessions]; a[i] = { ...a[i], time: v }; set('sessions', a); }} /></td>
              <td style={td}><T value={x.venue} width={130} onChange={v => { const a = [...s.sessions]; a[i] = { ...a[i], venue: v }; set('sessions', a); }} /></td>
              <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={x.show} onChange={e => { const a = [...s.sessions]; a[i] = { ...a[i], show: e.target.checked }; set('sessions', a); }} /></td>
              <td style={td}><T value={x.displayDate} width={170} placeholder="2026年10月9日（星期五）" onChange={v => { const a = [...s.sessions]; a[i] = { ...a[i], displayDate: v }; set('sessions', a); }} /></td>
              <td style={td}><T value={x.displayTime} width={150} onChange={v => { const a = [...s.sessions]; a[i] = { ...a[i], displayTime: v }; set('sessions', a); }} /></td>
              <td style={td}><T value={x.displayVenue} width={120} onChange={v => { const a = [...s.sessions]; a[i] = { ...a[i], displayVenue: v }; set('sessions', a); }} /></td>
            </tr>
          ))}</tbody>
        </table></div>
        <b style={{ fontSize: 13 }}>職員資料（20 行）</b>
        {!hide?.staff && (
        <div style={{ overflowX: 'auto' }}><table>
          <thead><tr>{['職位', '姓名', '稱謂', '所屬單位/職銜', '資格標註', '電話', '電郵'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{s.staff.map((st, i) => (
            <tr key={i}>
              {(['role', 'name', 'title', 'unit', 'qualification', 'phone', 'email'] as const).map((f, fi) => (
                <td key={f} style={td}><T value={st[f]} width={[100, 90, 60, 150, 120, 100, 160][fi]}
                  onChange={v => { const a = [...s.staff]; a[i] = { ...a[i], [f]: v }; set('staff', a); }} /></td>
              ))}
            </tr>
          ))}</tbody>
        </table></div>
        )}
        {hide?.staff && <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>🔒 職員表喺批核模式唔准改（要改請叫 CL 喺訓練班系統度改）。</p>}
      </details>

      {/* ── D. 時間表 ── */}
      {!hide?.timetable && (
      <details style={secStyle}>
        <summary style={hStyle}>🕒 D. 時間表（Input03；日期地點時間自動跟 Input02）</summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {s.timetable.map((g, gi) => (
            <div key={gi} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
              <b style={{ fontSize: 13 }}>第 {gi + 1} 節（跟 Input02 第 {gi + 1} 行）</b>
              <div style={{ margin: '6px 0' }}><label>服裝 <T value={g.clothing} onChange={v => { const a = [...s.timetable]; a[gi] = { ...a[gi], clothing: v }; set('timetable', a); }} width={150} /></label></div>
              <table><thead><tr>{['需時(分)', '項目', '負責人'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{g.flows.map((f, i) => (
                  <tr key={i}>
                    <td style={td}><T value={f.mins} width={60} onChange={v => { const a = [...s.timetable]; const fl = [...a[gi].flows]; fl[i] = { ...fl[i], mins: v }; a[gi] = { ...a[gi], flows: fl }; set('timetable', a); }} /></td>
                    <td style={td}><T value={f.item} width={180} onChange={v => { const a = [...s.timetable]; const fl = [...a[gi].flows]; fl[i] = { ...fl[i], item: v }; a[gi] = { ...a[gi], flows: fl }; set('timetable', a); }} /></td>
                    <td style={td}><T value={f.owner} width={100} onChange={v => { const a = [...s.timetable]; const fl = [...a[gi].flows]; fl[i] = { ...fl[i], owner: v }; a[gi] = { ...a[gi], flows: fl }; set('timetable', a); }} /></td>
                  </tr>
                ))}</tbody></table>
            </div>
          ))}
        </div>
      </details>
      )}

      {/* ── E. 通告內文 ── */}
      <details open style={secStyle}>
        <summary style={hStyle}>📜 E. 通告內文（Print_通告人手格；其餘自動帶入）</summary>
        <div style={{ display: 'grid', gap: 8 }}>
          <label>參加資格<A value={s.eligibility} onChange={v => set('eligibility', v)} placeholder="如：已宣誓及持有有效紀錄冊之支部成員" /></label>
          <label>費用說明<A value={s.feeNote} onChange={v => set('feeNote', v)} placeholder="金額＋包括咩＋原價／資助" /></label>
          <label>服裝<T value={s.uniform} onChange={v => set('uniform', v)} width={260} placeholder="如：整齊童軍制服" /></label>
          <div><b style={{ fontSize: 13 }}>備註（6 行）</b>
            {s.remarks.map((r, i) => (
              <div key={i} style={{ marginTop: 4 }}><A value={r} rows={1} onChange={v => { const a = [...s.remarks]; a[i] = v; set('remarks', a); }} /></div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <label>檔案編號 <T value={s.fileNo} onChange={v => set('fileNo', v)} width={90} placeholder="區會編" /></label>
            <label>發出日期 <T value={s.issueDate} onChange={v => set('issueDate', v)} width={150} placeholder="2026年9月1日" /></label>
            <label>區總監視名 <T value={s.signer} onChange={v => set('signer', v)} width={110} /></label>
            <label>代行 <T value={s.deputy} onChange={v => set('deputy', v)} width={110} /></label>
          </div>
        </div>
      </details>

      {/* ── F. 接納＋財政＋交收 ── */}
      <details style={secStyle}>
        <summary style={hStyle}>📨 F. 接納通知書＋財政＋交收</summary>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <label>報到時間 <T value={s.acceptCheckin} onChange={v => set('acceptCheckin', v)} width={150} /></label>
            <label>攜帶物品 <T value={s.acceptItems} onChange={v => set('acceptItems', v)} width={200} /></label>
          </div>
          <label>接納通知書其他<A value={s.acceptOthers} onChange={v => set('acceptOthers', v)} rows={1} /></label>
          <label>接納通知書備註<A value={s.acceptNote} onChange={v => set('acceptNote', v)} rows={1} /></label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <label>批准總預算$ <T value={s.financeApproved} onChange={v => set('financeApproved', v)} width={90} /></label>
            <label>總會津貼$ <T value={s.financeHqSubsidy} onChange={v => set('financeHqSubsidy', v)} width={90} /></label>
            <label>資助前原價$ <T value={s.subsidyOrigFee} onChange={v => set('subsidyOrigFee', v)} width={90} /></label>
            <label>班領導人電郵（自動分享班 Sheet） <T value={s.clEmail} onChange={v => set('clEmail', v)} width={200} placeholder="cl@…" /></label>
          </div>
        </div>
      </details>
    </div>
  );
}
