'use client';
/**
 * 🖨 新制直入列印（v4.14.0）— 12 張 Print 網頁版，直接列印 PDF。
 * 版式跟足工作簿 Print_ 分頁；通告複用 CircularView。
 */
import { useState } from 'react';
import CircularView from './CircularView';
import type { Circular, CoursePrintData } from '@/lib/types';
import {
  budgetTotals, circularSessions, courseLeader, hasNum, money, normDate,
  sessionDateLine, toNum, zhDate,
} from '@/lib/course-setup';

export const COURSE_PRINT_LIST = [
  { key: 'notice', label: '📜 通告' },
  { key: 'admit', label: '📋 取錄名單' },
  { key: 'pass', label: '🎓 合格名單' },
  { key: 'student', label: '👥 學員名單' },
  { key: 'attend', label: '✅ 出席紀錄' },
  { key: 'accept', label: '✉️ 接納通知書' },
  { key: 'staff', label: '🧑‍🏫 班職員名單' },
  { key: 'balance', label: '💵 收支紀錄' },
  { key: 'budget', label: '📊 財政預算' },
  { key: 'subsidy', label: '🏛️ 總會資助計劃' },
  { key: 'done', label: '📝 完成報告' },
  { key: 'cert', label: '📜 領取證書紀錄' },
] as const;
export type CoursePrintKey = (typeof COURSE_PRINT_LIST)[number]['key'];

interface Props {
  data: CoursePrintData;
  districtName: string;
  fpsAccount: { name: string; id: string };
  memberPortalUrl: string;
}

function dmy(iso: string): string {
  const m = String(iso || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : String(iso || '');
}
function todayZh(): string {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function CoursePrints({ data, districtName, fpsAccount, memberPortalUrl }: Props) {
  const [key, setKey] = useState<CoursePrintKey>('notice');
  const s = data.setup;
  const leader = courseLeader(s.staff);
  const leaderLine = leader ? `${(leader.name || '')}${(leader.title || '')}`.trim() : '';
  const leaderFull = leader ? `${leaderLine}${leader.qualification ? `（${leader.qualification}）` : ''}` : '';
  const datesLine = sessionDateLine(s.sessions);
  const venuesLine = Array.from(new Set(s.sessions.map(x => (x.venue || '').trim()).filter(Boolean))).join('、');
  const portal = (data.portalUrl || memberPortalUrl || '').trim();
  const t = budgetTotals(s);
  const staffNamed = s.staff.filter(x => x.name.trim());
  const portalTraining = portal ? (/\/training\/?$/.test(portal) ? portal : `${portal.replace(/\/+$/, '')}/training`) : '';

  /** 通告：設定 → Circular（複用 CircularView 列印） */
  function noticeCircular(): Circular {
    return {
      id: 'setup-preview', circularNo: s.fileNo, category: '訓練班', title: s.courseName,
      sections: s.section,
      sessions: circularSessions(s.sessions).slice(0, 4).map(x => ({
        date: x.displayDate || x.date, time: x.displayTime || x.time, venue: x.displayVenue || x.venue,
      })),
      leader: leaderFull, eligibility: s.eligibility, fee: s.fee, feeNote: s.feeNote,
      quota: s.quota, deadline: s.deadline,
      signupUrl: portalTraining,
      signupNote: portal ? `請於${districtName}成員系統訓練班版面填妥網上報名表（網址：${portalTraining}）` : '',
      uniform: s.uniform, remarks: s.remarks.filter(x => x.trim()).join('\n'),
      contactName: leader ? `${leaderLine}${leader.role ? `（${leader.role}）` : ''}` : '',
      contactEmail: leader?.email || '', contactPhone: leader?.phone || '',
      enquiryNote: s.publishDate ? `取錄名單將於${zhDate(s.publishDate)}或之前公佈。` : '',
      issueDate: normDate(s.issueDate) || s.issueDate,
      issuer: s.signer ? `區總監 ${s.signer}` : '區總監', signedBy: s.deputy,
      status: 'published',
      course: {
        courseId: s.courseId, title: s.courseName, fee: s.fee, deadline: s.deadline,
        quota: s.quota, filled: String(data.counts.admittedTotal),
      },
    };
  }

  function dualList(title: string, footnote: string) {
    const left = data.roster.slice(0, 17);
    const right = data.roster.slice(17, 34);
    return (
      <div className="course-print">
        <h2>{s.courseName}</h2>
        <h3 style={{ textAlign: 'center' }}>{title}</h3>
        <p style={{ textAlign: 'right', fontSize: 13 }}>日期：{todayZh()}</p>
        <table className="pt"><thead><tr>
          <th>編號</th><th>姓名</th><th>旅別</th><th>編號</th><th>姓名</th><th>旅別</th>
        </tr></thead><tbody>
          {Array.from({ length: Math.max(left.length, right.length, 1) }, (_, i) => (
            <tr key={i}>
              <td>{left[i]?.seq || ''}</td><td>{left[i]?.name || ''}</td><td>{left[i]?.troop || ''}</td>
              <td>{right[i]?.seq || ''}</td><td>{right[i]?.name || ''}</td><td>{right[i]?.troop || ''}</td>
            </tr>
          ))}
        </tbody></table>
        <p style={{ fontSize: 13, marginTop: 12 }}>{footnote}</p>
        <p className="psign">班領導人<br />{leaderLine}</p>
      </div>
    );
  }

  function renderPrint(): React.ReactNode {
    switch (key) {
      case 'notice':
        return <CircularView circular={noticeCircular()} districtName={districtName}
          fpsAccount={{ name: data.fpsName || fpsAccount.name, id: data.fpsId || fpsAccount.id }}
          memberPortalUrl={memberPortalUrl} />;
      case 'admit':
        return dualList('取錄名單',
          `請獲接納之學員按接納通知書上指示，準時到訓練班場地報到。如名單上沒有閣下之姓名，表示該申請未獲接納，本區會即時辦理退款並銷毀個人資料。如有任何疑問，請電郵至 ${leader?.email || ''} 或致電 ${leader?.phone || ''} 與本人聯絡。`);
      case 'pass':
        return dualList('合格名單', '尚未領取證書之學員，可於區會辦公時間前往區總部領取證書。');
      case 'student':
        return (
          <div className="course-print">
            <h2>{s.courseName}</h2>
            <h3 style={{ textAlign: 'center' }}>學員名單</h3>
            <table className="pt"><thead><tr>
              {['分組', '學員編號', '中文姓名', '性別', '旅團', '聯絡電話', '家長/監護人電話', '電郵地址'].map(h => <th key={h}>{h}</th>)}
            </tr></thead><tbody>
              {data.roster.map(r => (
                <tr key={r.seq}><td>{r.group}</td><td>{r.code}</td><td>{r.name}</td><td>{r.gender}</td>
                  <td>{r.troop}</td><td>{r.phone}</td><td>{r.parentPhone}</td><td>{r.email}</td></tr>
              ))}
              {!data.roster.length && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#64748b' }}>（暫無取錄學員）</td></tr>}
            </tbody></table>
          </div>
        );
      case 'attend': {
        const dates = s.sessions.map(x => x.date);
        return (
          <div className="course-print wide">
            <h2>{s.courseName}</h2>
            <h3 style={{ textAlign: 'center' }}>出席紀錄</h3>
            <table className="pt"><thead><tr>
              <th>分組</th><th>學員編號</th><th>中文姓名</th><th>英文姓名</th>
              {dates.map((d, i) => <th key={i}>{d ? dmy(d) : `（${i + 1}）`}</th>)}
            </tr></thead><tbody>
              {data.roster.map(r => (
                <tr key={r.seq}><td>{r.group}</td><td>{r.code}</td><td>{r.name}</td><td>{r.nameEn}</td>
                  {dates.map((_, i) => <td key={i}>&nbsp;</td>)}
                </tr>
              ))}
              {!data.roster.length && <tr><td colSpan={12} style={{ textAlign: 'center', color: '#64748b' }}>（暫無取錄學員）</td></tr>}
            </tbody></table>
          </div>
        );
      }
      case 'accept': {
        const first = circularSessions(s.sessions)[0];
        return (
          <div className="course-print">
            <p style={{ textAlign: 'right', fontSize: 13 }}>日期：{todayZh()}</p>
            <p>由：班領導人<br />致：各申請者<br />知會：訓練班職員</p>
            <h2>{s.courseName}</h2>
            <p>閣下申請參加上述之訓練班，現已被接納，請屆時準時出席為荷！</p>
            <table className="pt"><tbody>
              <tr><th style={{ width: 110 }}>日期</th><td>{first?.displayDate || (first ? dmy(first.date) : '')}</td></tr>
              <tr><th>報到時間</th><td>{s.acceptCheckin}</td></tr>
              <tr><th>地點</th><td>{first?.displayVenue || first?.venue || ''}</td></tr>
              <tr><th>服裝</th><td>整齊制服　旅巾／領帶<br />短褲／長褲（男）　裙褲／長褲／裙（女）</td></tr>
              <tr><th>攜帶物品</th><td>{s.acceptItems}</td></tr>
              <tr><th>其他</th><td>{s.acceptOthers}</td></tr>
              <tr><th>備註</th><td>{s.acceptNote}</td></tr>
            </tbody></table>
            <p style={{ fontSize: 13, marginTop: 12 }}>如有任何疑問，請電郵至 {leader?.email || ''} 或致電 {leader?.phone || ''} 與本人聯絡。</p>
            <p className="psign">班領導人<br />{leaderLine}</p>
          </div>
        );
      }
      case 'staff':
        return (
          <div className="course-print">
            <h2>{districtName}</h2>
            <h3 style={{ textAlign: 'center' }}>{s.courseName} — 班職員名單</h3>
            <p style={{ fontSize: 13 }}>舉辦日期：{datesLine}</p>
            <table className="pt"><thead><tr>
              {['職位', '姓名', '稱謂', '所屬單位 / 職銜'].map(h => <th key={h}>{h}</th>)}
            </tr></thead><tbody>
              {staffNamed.map((x, i) => (
                <tr key={i}><td>{x.role}</td><td>{x.name}</td><td>{x.title}</td><td>{x.unit}</td></tr>
              ))}
              {!staffNamed.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#64748b' }}>（未填職員）</td></tr>}
            </tbody></table>
          </div>
        );
      case 'balance': {
        const a = data.actuals;
        const feeIncome = toNum(s.fee) * data.counts.admittedTotal;
        const j21 = a[2] + a[1] + a[0] + a[3] + a[4] + a[5] + a[6] + a[7];
        const j25 = j21 + a[8];
        const m25 = feeIncome + toNum(s.financeApproved) + toNum(s.financeHqSubsidy);
        const m = (v: number) => (v ? money(v) : '');
        return (
          <div className="course-print">
            <h2>訓練班收支計算表<br /><small>STATEMENT OF INCOME AND EXPENDITURE FOR TRAINING COURSE</small></h2>
            <table className="pt"><tbody>
              <tr><th style={{ width: 170 }}>訓練班名稱 Course Name</th><td colSpan={3}>{s.courseName}</td></tr>
              <tr><th>班期 Date</th><td colSpan={3}>{datesLine}</td></tr>
              <tr><th>地點 Venue</th><td colSpan={3}>{venuesLine}</td></tr>
              <tr><th>班職員人數 No. of Staff</th><td>{staffNamed.length}</td><th>學員人數 No. of Candidates</th><td>{data.counts.admittedTotal}</td></tr>
            </tbody></table>
            <table className="pt" style={{ marginTop: 10 }}><thead><tr>
              <th colSpan={2}>支 出 EXPENDITURE</th><th colSpan={2}>收 入 INCOME</th>
            </tr></thead><tbody>
              <tr><td>i. 經常支出 Revenue Expenditure</td><td></td><td>i. 班費 Course Fee</td><td style={{ textAlign: 'right' }}>{m(feeIncome)}</td></tr>
              <tr><td>1. 膳食 Catering（茶點）</td><td style={{ textAlign: 'right' }}>{m(a[0])}</td><td>ii. 津貼 Subsidy</td><td style={{ textAlign: 'right' }}>{m(toNum(s.financeApproved))}</td></tr>
              <tr><td>　職員膳食 Staff／膳食津貼</td><td style={{ textAlign: 'right' }}>{m(a[2])}{a[1] ? `／${money(a[1])}` : ''}</td><td>iii. 其他 Others</td><td style={{ textAlign: 'right' }}>{m(toNum(s.financeHqSubsidy))}</td></tr>
              <tr><td>2. 住宿/租場 Lodging/Venue</td><td style={{ textAlign: 'right' }}>{m(a[3])}</td><td></td><td></td></tr>
              <tr><td>3. 交通 Transportation</td><td style={{ textAlign: 'right' }}>{m(a[4])}</td><td></td><td></td></tr>
              <tr><td>4. 行政 Administration</td><td style={{ textAlign: 'right' }}>{m(a[5])}</td><td></td><td></td></tr>
              <tr><td>5. 講義及快勞 Handouts &amp; File</td><td style={{ textAlign: 'right' }}>{m(a[6])}</td><td></td><td></td></tr>
              <tr><td>6. 其他 Others</td><td style={{ textAlign: 'right' }}>{m(a[7])}</td><td></td><td></td></tr>
              <tr><th>小計 Sub-total</th><th style={{ textAlign: 'right' }}>{m(j21)}</th><td></td><td></td></tr>
              <tr><td>ii. 資本支出 Capital Expenditure</td><td></td><td></td><td></td></tr>
              <tr><td>7. 設備 Equipment</td><td style={{ textAlign: 'right' }}>{m(a[8])}</td><td></td><td></td></tr>
              <tr><th>總支出 Total $</th><th style={{ textAlign: 'right' }}>{m(j25)}</th><th>總收入 Total</th><th style={{ textAlign: 'right' }}>{m(m25)}</th></tr>
              <tr><th colSpan={3}>盈餘／(不敷) Surplus/(Deficit)</th><th style={{ textAlign: 'right' }}>{m(m25 - j25)}</th></tr>
            </tbody></table>
            <table className="pt" style={{ marginTop: 10 }}><tbody>
              <tr><td>計算 Prepared by：</td><td>核對 Certified by：{leaderLine}</td></tr>
              <tr><td>姓名／職銜／日期：</td><td>姓名／職銜／日期：</td></tr>
              <tr><td colSpan={2}>認可 Approved by（區總監／副區總監）：　姓名／職銜／日期：</td></tr>
            </tbody></table>
          </div>
        );
      }
      case 'budget':
        return <BudgetPrint data={data} />;
      case 'subsidy': {
        const dates = s.sessions.map(x => x.date).filter(Boolean).sort();
        return (
          <div className="course-print wide">
            <p style={{ textAlign: 'right', fontSize: 12 }}>App. 附件2 (03/2025)</p>
            <h2>獲資助項目成績總表<br /><small>Result Sheet of Approved Subsidized Item（青少年成員及領袖適用）</small></h2>
            <table className="pt"><tbody>
              <tr><th>獲資助項目名稱</th><td>{s.courseName}</td><th>舉辦單位</th><td>{districtName}</td></tr>
              <tr><th>舉辦地點</th><td>{venuesLine}</td><th>開始／完成日期</th><td>{dates.length ? `${dmy(dates[0])} ／ ${dmy(dates[dates.length - 1])}` : ''}</td></tr>
              <tr><th>日數</th><td>{dates.length}</td><th>參加費用（原本費用）</th><td>{money(s.subsidyOrigFee)}</td></tr>
              <tr><th>負責人姓名</th><td>{leaderLine}</td><th>訓練職銜</th><td>{leader?.unit || ''}</td></tr>
              <tr><th>完成人數</th><td colSpan={3}>{data.counts.passed}</td></tr>
            </tbody></table>
            <table className="pt" style={{ marginTop: 8 }}><thead><tr>
              {['編號', '英文姓名', '中文姓名', '地域', '區', '旅號', '職位', '年齡', '證書編號', '半額', '全額', '備註'].map(h => <th key={h}>{h}</th>)}
            </tr></thead><tbody>
              {Array.from({ length: 30 }, (_, i) => {
                const r = (data.subsidyRows[i] || []) as unknown[];
                const c = (n: number) => String(r[n] ?? '').trim();
                return (
                  <tr key={i}><td>{i + 1}</td><td>{c(1)}</td><td>{c(2)}</td><td>{c(3)}</td><td>{c(4)}</td>
                    <td>{c(5)}</td><td>{c(6)}</td><td>{c(7)}</td><td>{c(8)}</td><td>{c(9)}</td><td>{c(10)}</td><td>{c(11)}</td></tr>
                );
              })}
            </tbody></table>
            <p className="psign">獲資助項目負責人簽署<br />日期：　　　　</p>
          </div>
        );
      }
      case 'done': {
        const rows = data.completion.length ? data.completion : data.roster.map(r => ({
          code: r.code, name: r.name, troopNo: r.troopNo, certNo: '', pass: '', failReason: '',
        }));
        const cc = data.counts;
        return (
          <div className="course-print">
            <h2>{s.courseName}</h2>
            <h3 style={{ textAlign: 'center' }}>訓練班完成報告</h3>
            <table className="pt"><tbody>
              <tr><th style={{ width: 170 }}>舉辦日期</th><td colSpan={3}>{datesLine}</td></tr>
              <tr><th>報班人數（本區）</th><td>{cc.appliedHome}</td><th>報班人數（他區）</th><td>{cc.appliedOther}</td></tr>
              <tr><th>接納人數（本區）</th><td>{cc.admittedHome}</td><th>接納人數（他區）</th><td>{cc.admittedOther}</td></tr>
              <tr><th>完成人數</th><td>{cc.completed}</td><th>合格人數</th><td>{cc.passed}</td></tr>
            </tbody></table>
            <table className="pt" style={{ marginTop: 8 }}><thead><tr>
              {['學員編號', '中文姓名', '旅號', '證書編號', '合格與否', '不合格原因'].map(h => <th key={h}>{h}</th>)}
            </tr></thead><tbody>
              {rows.map((r, i) => (
                <tr key={i}><td>{r.code}</td><td>{r.name}</td><td>{r.troopNo}</td><td>{r.certNo}</td><td>{r.pass}</td><td>{r.failReason}</td></tr>
              ))}
              {!rows.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#64748b' }}>（暫無學員）</td></tr>}
            </tbody></table>
          </div>
        );
      }
      case 'cert': {
        const rows = data.certRows.length ? data.certRows : data.roster.map(r => ({
          code: r.code, name: r.name, troopNo: r.troopNo, certNo: '', pickupDate: '', signed: '',
        }));
        return (
          <div className="course-print">
            <h3 style={{ textAlign: 'center' }}>領取證書紀錄</h3>
            <p style={{ fontSize: 13 }}>舉辦日期：{datesLine}　　班領導人：{leaderLine}</p>
            <table className="pt"><thead><tr>
              {['學員編號', '中文姓名', '旅號', '證書編號', '領取日期', '簽收'].map(h => <th key={h}>{h}</th>)}
            </tr></thead><tbody>
              {rows.map((r, i) => (
                <tr key={i}><td>{r.code}</td><td>{r.name}</td><td>{r.troopNo}</td><td>{r.certNo}</td><td>{r.pickupDate}</td><td>{r.signed}</td></tr>
              ))}
              {!rows.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#64748b' }}>（暫無學員）</td></tr>}
            </tbody></table>
          </div>
        );
      }
    }
  }

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {COURSE_PRINT_LIST.map(p => (
          <button key={p.key} className={key === p.key ? 'btn-sm' : 'mini-btn'} onClick={() => setKey(p.key)}>{p.label}</button>
        ))}
        <button className="btn-sm" style={{ marginLeft: 'auto' }} onClick={() => window.print()}>🖨 列印呢張（存 PDF）</button>
      </div>
      <p className="no-print muted" style={{ fontSize: 12 }}>出席紀錄／資助計劃／財政預算建議用橫向列印。數據截至 {data.pulledAt ? new Date(data.pulledAt).toLocaleString('zh-HK') : '—'}。</p>
      {renderPrint()}
    </div>
  );
}

/** 財政預算（總會預算表版式：預算欄＋修訂欄＋每位費用） */
function BudgetPrint({ data }: { data: CoursePrintData }) {
  const s = data.setup;
  const intake = toNum(s.expectedIntake);
  const staffN = toNum(s.expectedStaff);
  const rev = (row: number) => data.revised[String(row)] || '';
  const m = (v: number | string) => (hasNum(v) && toNum(v) ? money(v) : '');

  // 膳食明細（同 H6–H13 寫法）
  const mealCols = [
    { label: '1.1 早餐', get: (l: (typeof s.expenses.meals)[number]) => l.breakfast },
    { label: '1.2 午餐', get: (l: (typeof s.expenses.meals)[number]) => l.lunch },
    { label: '1.3 晚餐', get: (l: (typeof s.expenses.meals)[number]) => l.dinner },
    { label: '1.4 茶點', get: (l: (typeof s.expenses.meals)[number]) => l.snack },
    { label: '1.5 飲用水', get: (l: (typeof s.expenses.meals)[number]) => l.water },
  ];
  const mealRows = mealCols.map((mc, ci) => {
    const prices = s.expenses.meals.map(l => mc.get(l)).filter(hasNum).map(toNum);
    const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const heads = s.expenses.meals.map(l => {
      if (!hasNum(mc.get(l))) return 0;
      return l.who === '職員' ? staffN : l.who === '學員' ? intake : 0;
    }).filter(h => h > 0);
    const avgHead = heads.length ? heads.reduce((a, b) => a + b, 0) / heads.length : 0;
    const count = ci < 4 ? prices.length : 0;
    return { ...mc, price: avg, count, heads: avgHead, total: ci < 4 ? avg * prices.length * avgHead : avg * avgHead, row: [6, 7, 8, 9, 11][ci] };
  });
  const mealsSub = mealRows.reduce((a, r) => a + r.total, 0);

  // 租金明細
  const campQty = s.expenses.camp.map(l => l.qty).filter(hasNum).map(toNum);
  const campQty2 = s.expenses.camp.map(l => l.qty2).filter(hasNum).map(toNum);
  const campPrice = s.expenses.camp.map(l => l.price).filter(hasNum).map(toNum);
  const lodQty = s.expenses.lodging.map(l => l.qty).filter(hasNum).map(toNum);
  const lodQty2 = s.expenses.lodging.map(l => l.qty2).filter(hasNum).map(toNum);
  const lodPrice = s.expenses.lodging.map(l => l.price).filter(hasNum).map(toNum);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const campTotal = toNum(s.expenses.camp[0]?.qty) * toNum(s.expenses.camp[0]?.qty2) * toNum(s.expenses.camp[0]?.price)
    + toNum(s.expenses.camp[1]?.price) + toNum(s.expenses.camp[2]?.price);
  const lodTotal = toNum(s.expenses.lodging[0]?.qty) * toNum(s.expenses.lodging[0]?.qty2) * toNum(s.expenses.lodging[0]?.price)
    + toNum(s.expenses.lodging[1]?.price) + toNum(s.expenses.lodging[2]?.price);
  const venueTotal = toNum(s.expenses.venue[0]?.qty) * toNum(s.expenses.venue[0]?.price)
    + toNum(s.expenses.venue[1]?.price) + toNum(s.expenses.venue[2]?.price);

  const tr = s.expenses.transport.map(l => toNum(l.budget));
  const trSubs = [tr[0] + tr[1], tr[2] + tr[3], tr[4] + tr[5]];
  const qp = (lines: { qty: string; price: string }[]) => lines.map(l => toNum(l.qty) * toNum(l.price));
  const handT = qp(s.expenses.handouts), progT = qp(s.expenses.program),
    admT = qp(s.expenses.admin), suvT = qp(s.expenses.souvenir);
  const miscT = s.expenses.misc.reduce((a, l) => a + toNum(l.amount), 0);
  const progSub = sum(progT);
  const totalExp = mealsSub + venueTotal + campTotal + lodTotal + sum(trSubs) + sum(handT) + progSub + sum(admT) + sum(suvT) + miscT;
  const feeIncome = toNum(s.expectedFee) * intake;
  const totalInc = feeIncome + toNum(s.financeHqSubsidy);
  const perHead = (v: number) => (intake ? v / intake : 0);

  const R = (label: string, budget: React.ReactNode, row: number, extra?: React.ReactNode) => (
    <tr key={`${row}-${label}`}><td>{label}</td><td style={{ textAlign: 'right' }}>{budget}</td><td style={{ textAlign: 'right' }}>{rev(row) ? money(rev(row)) : ''}</td><td>{extra || ''}</td></tr>
  );

  return (
    <div className="course-print wide">
      <h2>{s.courseName}</h2>
      <h3 style={{ textAlign: 'center' }}>財政預算 BUDGET</h3>
      <table className="pt"><thead><tr><th>支出 Expenditure</th><th>預算 Estimated</th><th>修訂 Revised</th><th>備註</th></tr></thead>
        <tbody>
          <tr><th colSpan={4}>1. 膳食 Catering</th></tr>
          {mealRows.map(r => R(`${r.label}（單價 ${m(r.price)} × ${r.count || '—'}餐 × ${r.heads || '—'}人）`, m(r.total), r.row))}
          <tr><th>小計</th><th style={{ textAlign: 'right' }}>{m(mealsSub)}</th><th style={{ textAlign: 'right' }}>{rev(13) ? money(rev(13)) : ''}</th><th></th></tr>
          <tr><th colSpan={4}>2. 租金 Rent</th></tr>
          {R(`2.1 場租 Venue Charge`, m(venueTotal), 16)}
          {R(`2.2 露營 Camp（單價 ${m(avg(campPrice))} × ${m(sum(campQty))}晚 × ${m(avg(campQty2))}人）`, m(campTotal), 17)}
          {R(`2.3 住宿 Lodging（單價 ${m(avg(lodPrice))} × ${m(sum(lodQty))}晚 × ${m(avg(lodQty2))}人）`, m(lodTotal), 18)}
          <tr><th>小計</th><th style={{ textAlign: 'right' }}>{m(venueTotal + campTotal + lodTotal)}</th><th style={{ textAlign: 'right' }}>{rev(20) ? money(rev(20)) : ''}</th><th></th></tr>
          <tr><th colSpan={4}>3. 交通／運輸 Transportation</th></tr>
          {R('3.1 器材 Equipment', m(trSubs[0]), 23)}
          {R('3.2 職員 Staff', m(trSubs[1]), 24)}
          {R('3.3 學員 Candidate', m(trSubs[2]), 25)}
          <tr><th>小計</th><th style={{ textAlign: 'right' }}>{m(sum(trSubs))}</th><th style={{ textAlign: 'right' }}>{rev(26) ? money(rev(26)) : ''}</th><th></th></tr>
          <tr><th colSpan={4}>4. 講義／場刊 Handouts/Leaflets</th></tr>
          {s.expenses.handouts.map((l, i) => R(`4.${i + 1} ${l.item || ''}（${m(l.price)} × ${m(l.qty)}）`, m(handT[i]), 29 + i))}
          <tr><th>小計</th><th style={{ textAlign: 'right' }}>{m(sum(handT))}</th><th style={{ textAlign: 'right' }}>{rev(33) ? money(rev(33)) : ''}</th><th></th></tr>
          <tr><th colSpan={4}>5. 節目開支 Programme Expenses</th></tr>
          {s.expenses.program.map((l, i) => R(`5.${i + 1} ${l.item || ''}（${m(l.price)} × ${m(l.qty)}）`, m(progT[i]), 37))}
          <tr><th>小計</th><th style={{ textAlign: 'right' }}>{m(progSub)}</th><th style={{ textAlign: 'right' }}>{rev(37) ? money(rev(37)) : ''}</th><th></th></tr>
          <tr><th colSpan={4}>6. 行政 Administration</th></tr>
          {s.expenses.admin.map((l, i) => R(`6.${i + 1} ${l.item || ''}（${m(l.price)} × ${m(l.qty)}）`, m(admT[i]), 40 + i))}
          <tr><th>小計</th><th style={{ textAlign: 'right' }}>{m(sum(admT))}</th><th style={{ textAlign: 'right' }}>{rev(43) ? money(rev(43)) : ''}</th><th></th></tr>
          <tr><th colSpan={4}>7. 紀念品／獎品 Souvenir/Prize</th></tr>
          {R(`7.1 ${s.expenses.souvenir[0]?.item || ''}（${m(s.expenses.souvenir[0]?.price)} × ${m(s.expenses.souvenir[0]?.qty)}）`, m(suvT[0]), 46)}
          {R(`7.2 ${s.expenses.souvenir[1]?.item || ''}（${m(s.expenses.souvenir[1]?.price)} × ${m(s.expenses.souvenir[1]?.qty)}）`, m(suvT[1]), 49)}
          <tr><th>小計</th><th style={{ textAlign: 'right' }}>{m(sum(suvT))}</th><th style={{ textAlign: 'right' }}>{rev(51) ? money(rev(51)) : ''}</th><th></th></tr>
          <tr><th colSpan={4}>8. 其他 Misc.</th></tr>
          {R(s.expenses.misc.map(l => l.item).filter(Boolean).join('、') || '其他', m(miscT), 81)}
          <tr><th>總支出 Total Expenditure</th><th style={{ textAlign: 'right' }}>{m(totalExp)}</th><th style={{ textAlign: 'right' }}>{rev(83) ? money(rev(83)) : ''}</th><th></th></tr>
          <tr><th colSpan={4}>收入 Income</th></tr>
          {R(`1. 參加費用（${m(s.expectedFee)} × ${m(intake)}人）`, m(feeIncome), 87)}
          {R('2.1 總會津貼', m(toNum(s.financeHqSubsidy)), 90)}
          <tr><th>總收入 Total Income</th><th style={{ textAlign: 'right' }}>{m(totalInc)}</th><th style={{ textAlign: 'right' }}>{rev(93) ? money(rev(93)) : ''}</th><th></th></tr>
          <tr><th>項目批准總預算 Budget Approved</th><th style={{ textAlign: 'right' }}>{m(toNum(s.financeApproved))}</th><td></td><td></td></tr>
          <tr><th>是次活動申請津貼 Subsidy Required</th><th style={{ textAlign: 'right' }}>{m(totalExp - totalInc)}</th><td></td><td></td></tr>
        </tbody></table>
      <table className="pt" style={{ marginTop: 8 }}><thead><tr><th>每位費用 Breakdown（各項 ÷ {intake || '—'}人）</th><th>$</th></tr></thead>
        <tbody>
          {[['膳食', mealsSub], ['場租', venueTotal], ['露營＋住宿', campTotal + lodTotal], ['交通', sum(trSubs)],
            ['講義', sum(handT)], ['節目', progSub], ['行政', sum(admT)], ['紀念品', suvT[0]], ['獎品', suvT[1]], ['其他', miscT]]
            .map(([label, v]) => <tr key={label as string}><td>{label}</td><td style={{ textAlign: 'right' }}>{intake ? m(perHead(v as number)) : ''}</td></tr>)}
          <tr><th>合計</th><th style={{ textAlign: 'right' }}>{intake ? m(perHead(totalExp)) : ''}</th></tr>
          <tr><th>合計 − 收費（差額）</th><th style={{ textAlign: 'right' }}>{intake ? m(perHead(totalExp) - toNum(s.expectedFee)) : ''}</th></tr>
        </tbody></table>
      <table className="pt" style={{ marginTop: 8 }}><tbody>
        <tr><td>活動負責人簽署：　正楷姓名：　職位：　日期：</td></tr>
        <tr><td>審核 Checked by（ADC）：　正楷姓名：　日期：</td></tr>
        <tr><td>批准 Approved by（DDC）：　正楷姓名：　日期：</td></tr>
      </tbody></table>
    </div>
  );
}
