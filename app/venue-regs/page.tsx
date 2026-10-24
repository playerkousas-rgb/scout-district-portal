'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRequireCard } from '@/lib/cardAccess';
import { canApproveHq } from '@/lib/accountRoles';
import type {
  BackendHealthInfo,
  UserSession,
  Venue,
  VenueBooking,
  VenueLockConfigInput,
  VenueLockConfigStatus,
  VenueLockInfo,
} from '@/lib/types';
import BackLink, { BackBar } from '@/components/BackLink';

const REQUIRED_GS_VERSION = '4.24.0';

const STATUS: Record<string, string> = {
  pending: '待批',
  approved: '已批',
  confirmed: '已確認（未設鎖）',
  rejected: '已拒絕',
  cancelled: '已取消',
};

const PWD_MODE_LABELS: Record<string, string> = {
  phone4: '申請人電話頭 4 位（撞碼自動試尾 4 → +1）',
  phone4tail: '申請人電話尾 4 位（撞碼自動試頭 4 → +1）',
  random: '隨機 6 位數字（防撞碼）',
};

const EMPTY_VENUE: Venue = { venueId: '', name: '', location: '', capacity: '', note: '', scienerLockId: '', active: 'TRUE' };
const EMPTY_BORROW = { venueId: '', name: '', phone: '', email: '', troop: '', purpose: '', startDate: '', endDate: '' };
const EMPTY_CFG_FORM: VenueLockConfigInput = {
  clientId: '',
  clientSecret: '',
  username: '',
  password: '',
  lockId: '',
  apiBase: '',
  pwdMode: 'phone4',
  ttlockDisabled: false,
  teamupApiKey: '',
  teamupCalendarKey: '',
  teamupPendingSub: '',
  teamupApprovedSub: '',
  teamupRejectedSub: '',
  notifyStaffEmail: '',
};

function compareSemver(a?: string, b?: string): number {
  const pa = String(a || '0').replace(/-.*$/, '').split('.').map(n => Number(n) || 0);
  const pb = String(b || '0').replace(/-.*$/, '').split('.').map(n => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function buildWhatsAppPasscodeUrl(b: VenueBooking): string {
  const digits = String(b.phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const waPhone = digits.length === 8 ? `852${digits}` : digits;
  const venueLabel = b.venueName || b.venueId || '區總部';
  const timeText = `${b.startDate || ''}${b.endDate ? ` 至 ${b.endDate}` : ''}`;
  const text = [
    `你好 ${b.name || '申請人'}，你申請借用「${venueLabel}」已獲批准 ✅`,
    timeText ? `📅 時段：${timeText}` : '',
    b.refCode ? `📄 編號：${b.refCode}` : '',
    b.passcode ? `🔑 電子門鎖密碼：${b.passcode}#（輸入 ${b.passcode} 後按 # 開鎖，前後 15 分鐘內有效）` : '',
    '離開前請關妥冷氣電源、清走垃圾並鎖好大門。',
  ].filter(Boolean).join('\n');
  return `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
}

export default function VenueRegsPage() {
  const session = useRequireCard('venueReg');
  const hq = canApproveHq(session);

  const [bookings, setBookings] = useState<VenueBooking[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [health, setHealth] = useState<BackendHealthInfo | null>(null);
  const [cfgStatus, setCfgStatus] = useState<VenueLockConfigStatus | null>(null);
  const [cfgForm, setCfgForm] = useState<VenueLockConfigInput>({ ...EMPTY_CFG_FORM });
  const [showCfgPanel, setShowCfgPanel] = useState(false);
  const [cfgAutoOpened, setCfgAutoOpened] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [failedBooking, setFailedBooking] = useState<VenueBooking | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'other'>('all');
  const [vDraft, setVDraft] = useState<Venue>({ ...EMPTY_VENUE });
  const [editingVenue, setEditingVenue] = useState(false);
  const [locks, setLocks] = useState<VenueLockInfo[]>([]);
  const [lockHint, setLockHint] = useState('');
  const [showBorrow, setShowBorrow] = useState(false);
  const [borrow, setBorrow] = useState({ ...EMPTY_BORROW });
  const [editId, setEditId] = useState('');
  const [edit, setEdit] = useState({ ...EMPTY_BORROW });

  function applyCfgStatus(st: VenueLockConfigStatus) {
    setCfgStatus(st);
    setCfgForm(prev => ({
      ...prev,
      clientId: st.clientId || '',
      clientSecret: '',
      username: st.username || '',
      password: '',
      lockId: st.lockId || '',
      apiBase: st.apiBase || '',
      pwdMode: st.pwdMode || 'phone4',
      ttlockDisabled: !!st.ttlockDisabled,
      teamupApiKey: '',
      teamupCalendarKey: st.teamupCalendarKey || '',
      teamupPendingSub: st.teamupPendingSub || '',
      teamupApprovedSub: st.teamupApprovedSub || '',
      teamupRejectedSub: st.teamupRejectedSub || '',
      notifyStaffEmail: st.notifyStaffEmail || '',
    }));
    if (!cfgAutoOpened && !st.ttlockReady && !st.ttlockDisabled) {
      setShowCfgPanel(true);
      setCfgAutoOpened(true);
    }
  }

  async function load(s: UserSession) {
    setLoading(true);
    setError('');
    const tasks: [
      Promise<Awaited<ReturnType<typeof api.getVenueBookings>>>,
      Promise<Awaited<ReturnType<typeof api.listVenues>>>,
      Promise<Awaited<ReturnType<typeof api.health>>>,
      Promise<Awaited<ReturnType<typeof api.getVenueLockConfig>> | null>,
    ] = [
      api.getVenueBookings(s.token),
      api.listVenues(),
      api.health(),
      canApproveHq(s) ? api.getVenueLockConfig(s.token) : Promise.resolve(null),
    ];
    const [b, v, h, c] = await Promise.all(tasks);
    if (b.ok && b.data) setBookings(b.data);
    else setError(b.error || '無法載入借場申請');

    if (v.ok && v.data) {
      const list = v.data;
      setVenues(list);
      setBorrow(d => (d.venueId ? d : { ...d, venueId: list[0]?.venueId || '' }));
    }
    if (h.ok && h.data) setHealth(h.data);
    if (c && c.ok && c.data) applyCfgStatus(c.data);
    setLoading(false);
  }

  useEffect(() => {
    if (session) load(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function approveWithKey(b: VenueBooking, reissue = false) {
    if (!session) return;
    const label = reissue ? '補發／重製電子鎖匙' : '一鍵批准（寫入電子鎖＋電郵＋回傳）';
    const confirmText = reissue
      ? `確定為「${b.venueName || b.venueId} · ${b.name}」重新製作電子鎖匙、更新回傳記錄並寄出電郵？`
      : `確定一鍵批准「${b.venueName || b.venueId} · ${b.name}」？\n系統會即時連接電子鎖建立限時密碼、同步 Teamup 日曆、電郵申請人，並將密碼及鎖記錄編號回傳至表格。`;
    if (!confirm(confirmText)) return;

    setBusy(true);
    setError('');
    setMsg('');
    setFailedBooking(null);
    const r = await api.approveVenueBooking(session.token, b.id, reissue ? { reissue: true } : undefined);
    setBusy(false);

    if (r.ok && r.data) {
      const d = r.data;
      const code = d.passcode || d.password || '';
      const parts = [
        `${label}完成 ✓`,
        code ? `入場密碼：${code}#` : '',
        d.lockWritten && d.pwdRef ? `鎖匙記錄 #${d.pwdRef} 已回傳` : d.simulated ? '模擬密碼模式' : '',
        d.teamupSynced ? 'Teamup 已轉紅' : '',
        d.emailSent ? `已電郵至 ${d.emailTo}` : '',
        d.warn ? `提示：${d.warn}` : '',
      ].filter(Boolean);
      setMsg(parts.join(' · '));
      await load(session);
    } else {
      setError(r.error || `${label}失敗`);
      setFailedBooking(b);
    }
  }

  async function approveWithFallback(b: VenueBooking) {
    if (!session) return;
    if (!confirm('注意：備用隨機密碼唔會自動寫入實體電子鎖（申請人未能直接用該碼開鎖，除非你手動設鎖或稍後點「補發電子鎖匙」）。確定先批出？')) return;
    setBusy(true);
    setError('');
    setMsg('');
    const r = await api.approveVenueBooking(session.token, b.id, { allowFallback: true, reissue: true });
    setBusy(false);
    if (r.ok && r.data) {
      setFailedBooking(null);
      setMsg(`已按備用模式批核 ✓ 備用碼：${r.data.passcode || r.data.password}（電子鎖修復後可隨時點「🔑 補發電子鎖匙」正式寫入）`);
      await load(session);
    } else {
      setError(r.error || '備用批核失敗');
    }
  }

  async function confirmOnly(b: VenueBooking) {
    if (!session) return;
    setBusy(true);
    setError('');
    setMsg('');
    setFailedBooking(null);
    const r = await api.confirmVenueBooking(session.token, b.id);
    setBusy(false);
    if (r.ok) {
      setMsg(
        '已確認借用（未設鎖）✓' +
          (r.data?.teamupEventId ? ` · Teamup #${r.data.teamupEventId}` : '') +
          (r.data?.warn ? `（${r.data.warn}）` : ''),
      );
      await load(session);
    } else setError(r.error || '確認失敗');
  }

  async function reject(b: VenueBooking) {
    if (!session) return;
    if (!confirm(`拒絕「${b.venueName || b.venueId} · ${b.name}」？申請人會收到拒絕通知電郵。`)) return;
    setBusy(true);
    setError('');
    setMsg('');
    const r = await api.rejectVenueBooking(session.token, b.id);
    setBusy(false);
    if (r.ok) {
      setMsg('已拒絕申請 ✓');
      await load(session);
    } else setError(r.error || '拒絕失敗');
  }

  async function cancel(b: VenueBooking) {
    if (!session) return;
    if (!confirm(`取消「${b.venueName || b.venueId} · ${b.name}」？`)) return;
    setBusy(true);
    setError('');
    setMsg('');
    const r = await api.setVenueBookingStatus(session.token, b.id, 'cancelled');
    setBusy(false);
    if (r.ok) {
      setMsg('已取消申請 ✓');
      await load(session);
    } else setError(r.error || '取消失敗');
  }

  function startEdit(b: VenueBooking) {
    setEditId(b.id);
    setEdit({
      venueId: b.venueId || venues[0]?.venueId || '',
      name: b.name || '',
      phone: b.phone || '',
      email: b.email || '',
      troop: b.troop || '',
      purpose: b.purpose || '',
      startDate: String(b.startDate || '').replace(' ', 'T').slice(0, 16),
      endDate: String(b.endDate || '').replace(' ', 'T').slice(0, 16),
    });
  }

  async function saveEdit() {
    if (!session || !editId) return;
    if (!edit.name.trim() || !edit.phone.trim() || !edit.startDate || !edit.endDate) {
      setError('編輯：姓名、電話、起訖時間必填');
      return;
    }
    setBusy(true);
    setError('');
    setMsg('');
    const r = await api.updateVenueBooking(session.token, editId, {
      venueId: edit.venueId,
      name: edit.name.trim(),
      phone: edit.phone.trim(),
      email: edit.email.trim(),
      troop: edit.troop.trim(),
      purpose: edit.purpose.trim(),
      startDate: edit.startDate,
      endDate: edit.endDate,
    });
    setBusy(false);
    if (r.ok) {
      setMsg('申請資料已更新 ✓（如已改時段，可點「🔑 補發／重製鎖匙」更新門鎖有效時間）');
      setEditId('');
      await load(session);
    } else setError(r.error || '更新失敗');
  }

  async function createBorrow() {
    if (!session) return;
    if (!borrow.venueId || !borrow.name.trim() || !borrow.phone.trim() || !borrow.startDate || !borrow.endDate) {
      setError('借用：場地、姓名、電話、起訖時間必填');
      return;
    }
    setBusy(true);
    setError('');
    setMsg('');
    const r = await api.submitVenueRequest({
      venueId: borrow.venueId,
      name: borrow.name.trim(),
      phone: borrow.phone.trim(),
      email: borrow.email.trim(),
      troop: borrow.troop.trim(),
      purpose: borrow.purpose.trim() || '區職員代借',
      startDate: borrow.startDate,
      endDate: borrow.endDate,
      agreeRules: 'TRUE',
    });
    setBusy(false);
    if (r.ok) {
      const ref = r.data?.refCode || '';
      const warn = r.data?.warn || '';
      setMsg(`已建立借用申請${ref ? ' ' + ref : ''} ✓${warn ? '（' + warn + '）' : ''}`);
      setBorrow({ ...EMPTY_BORROW, venueId: venues[0]?.venueId || '' });
      setShowBorrow(false);
      await load(session);
    } else setError(r.error || '建立失敗');
  }

  async function saveLockConfig(bindLockToVenues = false) {
    if (!session) return;
    setBusy(true);
    setError('');
    setMsg('');
    const r = await api.saveVenueLockConfig(session.token, {
      ...cfgForm,
      bindLockToVenues,
    });
    setBusy(false);
    if (r.ok && r.data) {
      applyCfgStatus(r.data);
      const boundNote = r.data.boundVenues ? `，並已同步 Lock ID 至 ${r.data.boundVenues} 個啟用場地` : '';
      setMsg(`通通鎖與日曆設定已純文字寫入 Google Sheet Config ✓${boundNote}`);
      await load(session);
    } else {
      setError(r.error || '儲存設定失敗（請確認後端 Code.gs 已升級至 v4.24.0）');
    }
  }

  async function saveAndTestLocks() {
    if (!session) return;
    setBusy(true);
    setError('');
    setMsg('');
    setLockHint('');
    const saveRes = await api.saveVenueLockConfig(session.token, { ...cfgForm });
    if (!saveRes.ok || !saveRes.data) {
      setBusy(false);
      setError(saveRes.error || '儲存通通鎖設定失敗（請確認後端 Code.gs 已升級至 v4.24.0）');
      return;
    }
    applyCfgStatus(saveRes.data);
    const lockRes = await api.getLockList(session.token);
    setBusy(false);
    if (!lockRes.ok || !lockRes.data) {
      setError(lockRes.error || '設定已儲存，但通通鎖登入或讀鎖失敗，請核對 ①～④ 四項資料');
      return;
    }
    setLocks(lockRes.data.locks || []);
    setLockHint(
      `已接通通通鎖伺服器：${lockRes.data.apiBase}` +
        (lockRes.data.configuredLockId ? ` · 目前預設 Lock ID：${lockRes.data.configuredLockId}` : ' · 請點下方「⚡ 一鍵設為預設門鎖」完成最後一步'),
    );
    setMsg(`通通鎖連通成功 ✓ 讀到 ${lockRes.data.locks?.length || 0} 把門鎖！請點下方「⚡ 一鍵設為預設門鎖＋同步場地」。`);
    await load(session);
  }

  async function loadLocks() {
    if (!session) return;
    setBusy(true);
    setError('');
    setLockHint('');
    const r = await api.getLockList(session.token);
    setBusy(false);
    if (!r.ok || !r.data) {
      setError(r.error || '讀取鎖列表失敗（請先在「電子鎖連線設定」填妥 SCIENER 帳密）');
      setShowCfgPanel(true);
      return;
    }
    setLocks(r.data.locks || []);
    setLockHint(
      `已接通伺服器：${r.data.apiBase}` +
        (r.data.configuredLockId ? ` · 目前預設 Lock ID：${r.data.configuredLockId}` : ' · 尚未設定預設 SCIENER_LOCK_ID'),
    );
    setMsg(`成功讀到 ${r.data.locks?.length || 0} 把電子鎖 ✓ 請點「⚡ 一鍵設為預設門鎖」完成綁定。`);
  }

  async function bindLockEverywhere(lockId: string | number) {
    if (!session) return;
    const idStr = String(lockId).trim();
    setCfgForm(f => ({ ...f, lockId: idStr }));
    if (!hq) {
      setVDraft(d => ({ ...d, scienerLockId: idStr }));
      setMsg(`已填入下方場地表單 Lock ID：${idStr}`);
      return;
    }
    setBusy(true);
    setError('');
    setMsg('');
    const r = await api.saveVenueLockConfig(session.token, {
      lockId: idStr,
      bindLockToVenues: true,
    });
    setBusy(false);
    if (r.ok && r.data) {
      applyCfgStatus(r.data);
      setMsg(`已綁定預設門鎖 Lock ID #${idStr}${r.data.boundVenues ? `（並同步至 ${r.data.boundVenues} 個場地）` : ''} ✓ 現可使用「⚡ 一鍵批准」！`);
      await load(session);
    } else {
      setVDraft(d => ({ ...d, scienerLockId: idStr }));
      setError(r.error || `未能自動寫入 Config，請手動喺 Google Sheet Config 新增 key=SCIENER_LOCK_ID、value=${idStr}`);
    }
  }

  function fillLockToVenueDraft(id: string | number) {
    setVDraft(d => ({ ...d, scienerLockId: String(id) }));
    setMsg(`已填入下方場地表單 Lock ID：${id}（按「儲存場地」生效）`);
  }

  function startEditVenue(v: Venue) {
    setEditingVenue(true);
    setVDraft({
      venueId: v.venueId || '',
      name: v.name || '',
      location: v.location || '',
      capacity: String(v.capacity || ''),
      note: v.note || '',
      scienerLockId: String(v.scienerLockId || ''),
      active: v.active || 'TRUE',
    });
  }

  async function saveVenue() {
    if (!session) return;
    setError('');
    setMsg('');
    if (!vDraft.venueId.trim() || !vDraft.name.trim()) {
      setError('場地代碼與名稱必填');
      return;
    }
    setBusy(true);
    const r = await api.saveVenue(session.token, vDraft);
    setBusy(false);
    if (r.ok) {
      setMsg(editingVenue ? '場地設定已更新 ✓' : '新場地已儲存 ✓');
      setVDraft({ ...EMPTY_VENUE });
      setEditingVenue(false);
      await load(session);
    } else setError(r.error || '儲存場地失敗');
  }

  async function delVenue(v: Venue) {
    if (!session || !confirm(`確定刪除場地「${v.name}」？`)) return;
    const r = await api.deleteVenue(session.token, v.venueId);
    if (r.ok) {
      setMsg('場地已刪除 ✓');
      await load(session);
    } else setError(r.error || '刪除失敗');
  }

  function copyCode(code: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setMsg(`已複製入場密碼 ${code} ✓`);
    }
  }

  if (!session) return <div className="center"><div className="spinner" /></div>;

  const backendVersion = cfgStatus?.version || health?.version || '';
  const gsNeedsUpgrade = !!backendVersion && compareSemver(backendVersion, REQUIRED_GS_VERSION) < 0;
  const pendingN = bookings.filter(b => String(b.status || 'pending').toLowerCase() === 'pending').length;
  const approvedN = bookings.filter(b => {
    const s = String(b.status || '').toLowerCase();
    return s === 'approved' || s === 'confirmed';
  }).length;

  const filteredBookings = bookings.filter(b => {
    const s = String(b.status || 'pending').toLowerCase();
    if (statusFilter === 'pending') return s === 'pending';
    if (statusFilter === 'approved') return s === 'approved' || s === 'confirmed';
    if (statusFilter === 'other') return s !== 'pending' && s !== 'approved' && s !== 'confirmed';
    return true;
  });

  const lockCredsOk = cfgStatus ? cfgStatus.clientIdSet && cfgStatus.clientSecretSet && cfgStatus.usernameSet && cfgStatus.passwordSet : !!health?.ttlockConfigured;
  const lockIdOk = cfgStatus ? cfgStatus.lockIdSet : !!health?.lockIdSet;
  const ttlockDisabled = cfgStatus ? cfgStatus.ttlockDisabled : !!health?.ttlockDisabled;

  return (
    <>
      <BackLink />
      <h1 className="page-title">🏛 場地借用審批（一鍵製鎖匙＋回傳）</h1>
      <p className="page-sub">
        申請人於 member-portal 填表 → Google Sheet <code>VenueBookings</code> ＋ Teamup「申請中」。
        {hq
          ? ' 點「⚡ 一鍵批准」即自動連接電子鎖寫入限時密碼、轉紅 Teamup 日曆、電郵申請人，並將密碼及鎖記錄編號回傳至本頁與 Sheet。'
          : ' 你可以確認（唔設鎖）、編輯、拒絕；一鍵製作電子鎖匙需 DDC 或以上權限。'}
      </p>

      {gsNeedsUpgrade && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #f59e0b',
            borderLeft: '5px solid #d97706',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 14,
            fontSize: 13.5,
            lineHeight: 1.65,
            color: '#78350f',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <b>⚠️ Google Sheet 後端 Code.gs 版本較舊（目前 v{backendVersion}，一鍵製鎖匙及回傳需 v{REQUIRED_GS_VERSION}）</b>
            <a
              href="/downloads/Code.gs.txt"
              download="Code.gs.txt"
              className="btn-sm"
              style={{ textDecoration: 'none', background: '#d97706', color: '#fff' }}
            >
              ⬇ 下載最新 Code.gs（v{REQUIRED_GS_VERSION}）
            </a>
          </div>
          <ol style={{ margin: '8px 0 0 18px', padding: 0 }}>
            <li>打開區會 Google Sheet →「擴充功能 → Apps Script」，以最新 <code>Code.gs</code> 全選貼上覆蓋並儲存（<b>零資料流失</b>，不動現有分頁記錄）。</li>
            <li>頂部函式選 <code>setupSheets</code> 按「執行」（自動補齊回傳欄 <code>passcode</code> / <code>pwdRef</code>，唔清空舊資料）。</li>
            <li>右上「部署 → 管理部署項目 → 鉛筆編輯 → 版本選<b>新版本</b> → 部署」（切勿按新增部署，保持原 <code>/exec</code> 網址不變）。</li>
          </ol>
        </div>
      )}

      {error && (
        <div className="err" style={{ marginBottom: 12 }}>
          <div>{error}</div>
          {failedBooking && hq && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="mini-btn" disabled={busy} onClick={() => setShowCfgPanel(true)}>
                ⚙️ 打開電子鎖設定排查
              </button>
              <button className="mini-btn" disabled={busy} onClick={loadLocks}>
                🔍 測試連線並讀取門鎖
              </button>
              <button className="mini-btn" disabled={busy} onClick={() => confirmOnly(failedBooking)}>
                ✅ 先僅確認借用（修好門鎖後再補發鎖匙）
              </button>
              <button className="mini-btn danger" disabled={busy} onClick={() => approveWithFallback(failedBooking)}>
                ⚠️ 改用備用隨機碼批核（不寫入實體鎖）
              </button>
            </div>
          )}
        </div>
      )}
      {msg && <div className="success">✓ {msg}</div>}

      {/* 電子鎖與回傳就緒診斷＋一頁式設定 */}
      <section className="info-card" style={{ borderLeft: '4px solid #2563eb' }}>
        <div className="section-head">
          <div>
            <h3>🔌 一鍵審批・電子鎖・回傳 連線狀態</h3>
            <p>保持現有密碼規則（預設申請人電話頭 4 位）；批核後即時回傳密碼、鎖記錄 ID 及 Teamup 事件 ID。</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="mini-btn" disabled={busy} onClick={loadLocks}>🔍 測試讀取門鎖</button>
            {hq && (
              <button className="btn-sm" onClick={() => setShowCfgPanel(v => !v)}>
                {showCfgPanel ? '收起連線設定' : '⚙️ 電子鎖與日曆設定'}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <span className={`state ${backendVersion && !gsNeedsUpgrade ? 'on' : 'off'}`}>
            後端：{backendVersion ? `v${backendVersion}` : '檢查中'} {!gsNeedsUpgrade && backendVersion ? '✓' : ''}
          </span>
          <span className={`state ${ttlockDisabled ? '' : lockCredsOk ? 'on' : 'off'}`}>
            {ttlockDisabled
              ? '電子鎖：模擬模式（跳過寫鎖）'
              : lockCredsOk
              ? `電子鎖帳密：已設定${cfgStatus?.usernameMasked ? ` (${cfgStatus.usernameMasked})` : ''} ✓`
              : '電子鎖帳密：未設定 ⚠️'}
          </span>
          <span className={`state ${lockIdOk ? 'on' : 'off'}`}>
            {lockIdOk
              ? `門鎖綁定：${cfgStatus?.lockId ? `#${cfgStatus.lockId}` : `場地已綁 (${cfgStatus?.venuesWithLockCount || 1})`} ✓`
              : '門鎖 Lock ID：未綁定 ⚠️'}
          </span>
          <span className="state on">
            密碼規則：{cfgStatus?.pwdMode || 'phone4'}
          </span>
          <span className={`state ${(cfgStatus ? cfgStatus.teamupReady : health?.teamupConfigured) ? 'on' : ''}`}>
            Teamup：{(cfgStatus ? cfgStatus.teamupReady : health?.teamupConfigured) ? '已接通 ✓' : '未設定（選填）'}
          </span>
          {cfgStatus && (
            <span className={`state ${cfgStatus.sheetHasPasscodeCol && cfgStatus.sheetHasPwdRefCol ? 'on' : ''}`}>
              Sheet 回傳欄：{cfgStatus.sheetHasPasscodeCol && cfgStatus.sheetHasPwdRefCol ? 'passcode + pwdRef 就緒 ✓' : '儲存設定時自動補齊'}
            </span>
          )}
        </div>

        {showCfgPanel && hq && (
          <div style={{ marginTop: 14, padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <details open={!lockCredsOk} style={{ marginBottom: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px', fontSize: 13, lineHeight: 1.7, color: '#1e3a8a' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
                📖 通通鎖（TTLock）冇一個叫「API Key」嘅掣！點樣搵齊下面 ①～④ 四格？（點開睇逐步教學）
              </summary>
              <div style={{ marginTop: 8 }}>
                <div>
                  <b>【第 1 步：去「通通鎖開放平台」網站攞 ① App ID 同 ② App Secret】</b>
                  <ol style={{ margin: '4px 0 8px 18px', padding: 0 }}>
                    <li>
                      用電腦打開官方開放平台：
                      <a href="https://open.ttlock.com" target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8', fontWeight: 600, marginLeft: 4 }}>
                        https://open.ttlock.com ↗
                      </a>
                      （如用中國內地版「科技俠 App」先改去 <code>open.sciener.com</code>；香港用「TTLock 通通鎖 App」一律去 <code>open.ttlock.com</code>）。
                    </li>
                    <li>右上角點 <b>Register（註冊）</b> 開一個「開發者帳號」（注意：呢個網站同手機 App 帳號係獨立分開嘅，要喺網站新註冊一次）。</li>
                    <li>登入後點右上角 <b>Console（控制台）→ App Management（應用管理）→ Create Application（創建應用）</b>，名稱隨意填（例：<code>SKW Scout HQ</code>），提交審核。</li>
                    <li>審核通過（Status = Approved）後點入該應用，複製入面嘅 <b><code>App ID</code>（即 <code>client_id</code>）→ 貼入下面 ①</b>，同埋 <b><code>App Secret</code>（即 <code>client_secret</code>）→ 貼入下面 ②</b>。</li>
                  </ol>
                </div>
                <div>
                  <b>【第 2 步：填你平時手機開「TTLock 通通鎖 App」管區總部把鎖嗰個帳密 → 填 ③ 同 ④】</b>
                  <ul style={{ margin: '4px 0 8px 18px', padding: 0 }}>
                    <li><b>切勿填剛才開放平台網站個密碼！</b>③ 同 ④ 係填<b>手機通通鎖 App 入面睇到區總部把鎖（最高管理員）嗰個登入電話／電郵同密碼</b>。</li>
                    <li>香港電話註冊請連 <code>852</code> 填（例：<code>85291234567</code>）；同時打開手機 App 左側選單「<b>網關 Gateway</b>」確認區總部個 WiFi 網關（G2）顯示<b>在線</b>。</li>
                  </ul>
                </div>
                <div>
                  <b>【第 3 步：⑤ 門鎖 Lock ID 唔使自己搵】</b>
                  <div>填好 ①～④ 後直接撳下面藍色掣 <b>「🚀 儲存並即刻測試通通鎖連線＆讀取門鎖」</b>，系統就會自動撈出把鎖嘅數字 ID 俾你一鍵綁定！</div>
                </div>
              </div>
            </details>

            <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 10 }}>
              💡 此處儲存會以<b>純文字格式（@）</b>寫入 Google Sheet <code>Config</code>（唔怕 <code>+852</code> 或前導 <code>0</code> 被食走）；私密欄如顯示「已設定」，留空即保留原值。
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                <span><b>① 開放平台 App ID</b>（<code>client_id</code> / <code>SCIENER_CLIENT_ID</code>）</span>
                <input
                  placeholder="喺 open.ttlock.com 應用詳情複製 32 位 App ID"
                  value={cfgForm.clientId || ''}
                  onChange={e => setCfgForm({ ...cfgForm, clientId: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                <span>
                  <b>② 開放平台 App Secret</b>（<code>client_secret</code>）{' '}
                  {cfgStatus?.clientSecretSet ? <em style={{ color: '#15803d' }}>（已設定，留空保留）</em> : <em style={{ color: '#dc2626' }}>（未設定）</em>}
                </span>
                <input
                  type="password"
                  placeholder={cfgStatus?.clientSecretSet ? '已設定（如需更換先填）' : '喺 open.ttlock.com 應用詳情複製 App Secret'}
                  value={cfgForm.clientSecret || ''}
                  onChange={e => setCfgForm({ ...cfgForm, clientSecret: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                <span><b>③ 手機「通通鎖 App」管鎖帳號</b>（<code>SCIENER_USERNAME</code>）</span>
                <input
                  placeholder="例：85291234567 或電郵（手機 App 登入帳，非網站帳）"
                  value={cfgForm.username || ''}
                  onChange={e => setCfgForm({ ...cfgForm, username: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                <span>
                  <b>④ 手機「通通鎖 App」登入密碼</b>{' '}
                  {cfgStatus?.passwordSet ? <em style={{ color: '#15803d' }}>（已設定，留空保留）</em> : <em style={{ color: '#dc2626' }}>（未設定）</em>}
                </span>
                <input
                  type="password"
                  placeholder={cfgStatus?.passwordSet ? '已設定（如需更換先填）' : '填手機 App 明文密碼（後台自動轉 MD5）'}
                  value={cfgForm.password || ''}
                  onChange={e => setCfgForm({ ...cfgForm, password: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                <span><b>⑤ 大門 Lock ID</b>（自動讀出，毋須手搵）</span>
                <input
                  placeholder="填好 ①～④ 點下方「測試連線＆讀鎖」自動撈出"
                  value={cfgForm.lockId || ''}
                  onChange={e => setCfgForm({ ...cfgForm, lockId: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                <span><b>伺服器區域</b>（預設自動跨區探測）</span>
                <select value={cfgForm.apiBase || ''} onChange={e => setCfgForm({ ...cfgForm, apiBase: e.target.value })}>
                  <option value="">自動跨區偵測（推薦：自動試 euapi / api.ttlock / sciener）</option>
                  <option value="https://euapi.ttlock.com">通通鎖國際／香港區（euapi.ttlock.com）</option>
                  <option value="https://api.ttlock.com">通通鎖全球區（api.ttlock.com）</option>
                  <option value="https://api.sciener.com">科技俠 Sciener（api.sciener.com）</option>
                  <option value="https://cnapi.ttlock.com">通通鎖中國內地（cnapi.ttlock.com）</option>
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                <span><b>入場密碼規則</b>（<code>PWD_MODE</code>）</span>
                <select value={cfgForm.pwdMode || 'phone4'} onChange={e => setCfgForm({ ...cfgForm, pwdMode: e.target.value })}>
                  {Object.entries(PWD_MODE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>{k} — {label}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                <span><b>新借場申請通知電郵</b>（選填）</span>
                <input
                  placeholder="例：hq@skwscout.org.hk"
                  value={cfgForm.notifyStaffEmail || ''}
                  onChange={e => setCfgForm({ ...cfgForm, notifyStaffEmail: e.target.value })}
                />
              </label>
            </div>

            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#334155' }}>
                📅 第二步（通通鎖連通後先搞）：Teamup 日曆設定（選填）
              </summary>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginTop: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                  <span>
                    <b>TEAMUP_API_KEY</b> {cfgStatus?.teamupApiKeySet ? <em style={{ color: '#15803d' }}>（已設定）</em> : ''}
                  </span>
                  <input
                    type="password"
                    placeholder={cfgStatus?.teamupApiKeySet ? '已設定（留空保留）' : 'Teamup API Key'}
                    value={cfgForm.teamupApiKey || ''}
                    onChange={e => setCfgForm({ ...cfgForm, teamupApiKey: e.target.value })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                  <span><b>TEAMUP_CALENDAR_KEY</b>（ks... 讀寫金鑰）</span>
                  <input
                    placeholder="例：ks9abcdef123456"
                    value={cfgForm.teamupCalendarKey || ''}
                    onChange={e => setCfgForm({ ...cfgForm, teamupCalendarKey: e.target.value })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                  <span><b>TEAMUP_PENDING_SUBCAL_ID</b>（申請中子日曆 ID）</span>
                  <input
                    placeholder="數字 ID"
                    value={cfgForm.teamupPendingSub || ''}
                    onChange={e => setCfgForm({ ...cfgForm, teamupPendingSub: e.target.value })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                  <span><b>TEAMUP_APPROVED_SUBCAL_ID</b>（已批准子日曆 ID）</span>
                  <input
                    placeholder="數字 ID"
                    value={cfgForm.teamupApprovedSub || ''}
                    onChange={e => setCfgForm({ ...cfgForm, teamupApprovedSub: e.target.value })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                  <span><b>TEAMUP_REJECTED_SUBCAL_ID</b>（已拒絕子日曆 ID，選填）</span>
                  <input
                    placeholder="數字 ID（選填）"
                    value={cfgForm.teamupRejectedSub || ''}
                    onChange={e => setCfgForm({ ...cfgForm, teamupRejectedSub: e.target.value })}
                  />
                </label>
              </div>
            </details>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12.5, color: '#475569' }}>
              <input
                type="checkbox"
                checked={!!cfgForm.ttlockDisabled}
                onChange={e => setCfgForm({ ...cfgForm, ttlockDisabled: e.target.checked })}
              />
              暫時停用實體寫鎖（<code>ttlockDisabled=TRUE</code>，僅供無網關時測試電郵與回傳流程）
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button className="btn-sm" disabled={busy} onClick={saveAndTestLocks}>
                🚀 儲存並即刻測試通通鎖連線＆讀取門鎖
              </button>
              <button className="mini-btn" disabled={busy} onClick={() => saveLockConfig(false)}>
                💾 僅儲存設定
              </button>
              <button className="mini-btn" disabled={busy || !cfgForm.lockId} onClick={() => saveLockConfig(true)}>
                💾 儲存並將 Lock ID 同步至所有啟用場地
              </button>
            </div>
          </div>
        )}

        {lockHint && <p className="page-sub" style={{ marginTop: 10, marginBottom: 4 }}>{lockHint}</p>}
        {!!locks.length && (
          <div style={{ marginTop: 8 }}>
            {locks.map(l => (
              <div key={String(l.lockId)} className="user-row" style={{ flexWrap: 'wrap' }}>
                <div className="user-identity">
                  <b>{l.name || '未命名電子鎖'}</b>
                  <span className="rcode">Lock ID #{l.lockId}</span>
                  <span>
                    MAC {l.mac || '—'}
                    {l.electricQuantity !== undefined ? ` · 電量 ${l.electricQuantity}%` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`state ${l.hasGateway ? 'on' : 'off'}`}>
                    {l.hasGateway ? '🟢 已接 WiFi Gateway（可遠端寫鎖）' : '🟠 未偵測到 Gateway（遠端寫鎖需網關在線）'}
                  </span>
                  <button className="btn-sm" disabled={busy} onClick={() => bindLockEverywhere(l.lockId)}>
                    ⚡ 一鍵設為預設門鎖＋同步場地
                  </button>
                  <button className="mini-btn" onClick={() => fillLockToVenueDraft(l.lockId)}>
                    填入下方場地表單
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 申請審批列表 */}
      <section className="info-card" style={{ borderLeft: '4px solid #dc2626' }}>
        <div className="section-head">
          <div>
            <h3>申請審批與回傳紀錄 <small>({bookings.length} · 待批 {pendingN} · 已批 {approvedN})</small></h3>
            <p>一鍵批准會即時寫入電子鎖限時密碼（前後 15 分鐘緩衝）、寄出入場密碼電郵，並回傳鎖匙記錄編號。</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn-sm" onClick={() => setShowBorrow(v => !v)}>{showBorrow ? '收起代借表' : '＋ 職員代借'}</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {([
            ['all', `全部 (${bookings.length})`],
            ['pending', `待批 (${pendingN})`],
            ['approved', `已批／已確認 (${approvedN})`],
            ['other', '已拒絕／已取消'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              className={statusFilter === key ? 'btn-sm' : 'mini-btn'}
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {showBorrow && (
          <div className="account-form" style={{ marginBottom: 16, padding: 12, background: '#f8fafc', borderRadius: 10 }}>
            <select value={borrow.venueId} onChange={e => setBorrow({ ...borrow, venueId: e.target.value })}>
              <option value="">選擇場地 *</option>
              {venues.map(v => <option key={v.venueId} value={v.venueId}>{v.name}</option>)}
            </select>
            <input placeholder="姓名 *" value={borrow.name} onChange={e => setBorrow({ ...borrow, name: e.target.value })} />
            <input placeholder="電話 *" value={borrow.phone} onChange={e => setBorrow({ ...borrow, phone: e.target.value })} />
            <input placeholder="電郵" value={borrow.email} onChange={e => setBorrow({ ...borrow, email: e.target.value })} />
            <input placeholder="旅團" value={borrow.troop} onChange={e => setBorrow({ ...borrow, troop: e.target.value })} />
            <input placeholder="用途" value={borrow.purpose} onChange={e => setBorrow({ ...borrow, purpose: e.target.value })} />
            <input type="datetime-local" value={borrow.startDate} onChange={e => setBorrow({ ...borrow, startDate: e.target.value })} />
            <input type="datetime-local" value={borrow.endDate} onChange={e => setBorrow({ ...borrow, endDate: e.target.value })} />
            <button className="btn-sm" disabled={busy} onClick={createBorrow}>建立借用申請</button>
          </div>
        )}

        {loading ? (
          <div className="small-loading">載入中…</div>
        ) : filteredBookings.length === 0 ? (
          <p className="empty">此分類暫無申請。可用右上「＋ 職員代借」建立測試或代借單。</p>
        ) : (
          filteredBookings.map(b => {
            const st = String(b.status || 'pending').toLowerCase();
            const isPending = st === 'pending';
            const isApprovedLike = st === 'approved' || st === 'confirmed';
            const hasRealKey = !!b.passcode && !!b.pwdRef && b.pwdRef !== 'SIMULATED';
            const waUrl = b.passcode ? buildWhatsAppPasscodeUrl(b) : '';

            return (
              <article key={b.id} className="user-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div className="user-identity" style={{ minWidth: 240 }}>
                  <b>{b.venueName || b.venueId}</b>
                  <span>
                    {b.name}
                    {b.phone ? ` · 📞 ${b.phone}` : ''}
                    {b.email ? ` · ✉️ ${b.email}` : ''}
                    {b.troop ? ` · ${b.troop}` : ''}
                  </span>
                  <span>🕒 {b.startDate}{b.endDate ? ` → ${b.endDate}` : ''} · {b.purpose || '—'}</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {b.refCode && <span className="rcode">{b.refCode}</span>}
                    {b.teamupEventId && <span className="rcode">📅 Teamup #{b.teamupEventId}</span>}
                    {b.pwdRef && b.pwdRef !== 'SIMULATED' && <span className="rcode">🔒 鎖記錄 #{b.pwdRef}</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {isApprovedLike && b.passcode && hasRealKey && (
                    <span className="state on" style={{ letterSpacing: 1 }}>
                      🔑 電子鎖密碼 {b.passcode}# ✓
                    </span>
                  )}
                  {isApprovedLike && b.passcode && !hasRealKey && (
                    <span className="state" style={{ background: '#fef3c7', color: '#92400e', letterSpacing: 1 }}>
                      🔑 備用／模擬碼 {b.passcode}（未寫入鎖）
                    </span>
                  )}
                  {isApprovedLike && !b.passcode && (
                    <span className="state">📋 僅確認（未發密碼）</span>
                  )}

                  <span className={`state ${isApprovedLike ? 'on' : isPending ? '' : 'off'}`}>
                    {STATUS[st] || b.status}
                  </span>

                  <div className="user-actions" style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                    {isPending && hq && (
                      <>
                        <button className="btn-sm" disabled={busy} onClick={() => approveWithKey(b, false)}>
                          ⚡ 一鍵批准（製鎖匙＋回傳）
                        </button>
                        <button className="mini-btn" disabled={busy} onClick={() => confirmOnly(b)}>
                          ✅ 僅確認（唔設鎖）
                        </button>
                      </>
                    )}
                    {isPending && !hq && (
                      <button className="mini-btn" disabled={busy} onClick={() => confirmOnly(b)}>
                        ✅ 確認（唔設鎖）
                      </button>
                    )}

                    {isApprovedLike && hq && !hasRealKey && (
                      <button className="btn-sm" disabled={busy} onClick={() => approveWithKey(b, true)}>
                        🔑 補發電子鎖匙
                      </button>
                    )}
                    {isApprovedLike && hq && hasRealKey && (
                      <button className="mini-btn" disabled={busy} onClick={() => approveWithKey(b, true)}>
                        🔄 重製鎖匙
                      </button>
                    )}

                    {b.passcode && (
                      <button className="mini-btn" onClick={() => copyCode(b.passcode!)}>
                        📋 複製密碼
                      </button>
                    )}
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mini-btn"
                        style={{ textDecoration: 'none' }}
                      >
                        💬 WhatsApp 密碼
                      </a>
                    )}

                    {(isPending || isApprovedLike) && (
                      <button className="mini-btn" disabled={busy} onClick={() => startEdit(b)}>
                        ✎ 編輯
                      </button>
                    )}
                    {st !== 'rejected' && (
                      <button className="mini-btn danger" disabled={busy} onClick={() => reject(b)}>
                        ✕ 拒絕
                      </button>
                    )}
                    {st !== 'cancelled' && (
                      <button className="mini-btn" disabled={busy} onClick={() => cancel(b)}>
                        ↩ 取消
                      </button>
                    )}
                  </div>
                </div>

                {editId === b.id && (
                  <div className="account-form" style={{ width: '100%', marginTop: 8, padding: 10, background: '#fffbeb', borderRadius: 10 }}>
                    <select value={edit.venueId} onChange={e => setEdit({ ...edit, venueId: e.target.value })}>
                      {venues.map(v => <option key={v.venueId} value={v.venueId}>{v.name}</option>)}
                    </select>
                    <input placeholder="姓名 *" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
                    <input placeholder="電話 *" value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} />
                    <input placeholder="電郵" value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} />
                    <input placeholder="旅團" value={edit.troop} onChange={e => setEdit({ ...edit, troop: e.target.value })} />
                    <input placeholder="用途" value={edit.purpose} onChange={e => setEdit({ ...edit, purpose: e.target.value })} />
                    <input type="datetime-local" value={edit.startDate} onChange={e => setEdit({ ...edit, startDate: e.target.value })} />
                    <input type="datetime-local" value={edit.endDate} onChange={e => setEdit({ ...edit, endDate: e.target.value })} />
                    <button className="btn-sm" disabled={busy} onClick={saveEdit}>儲存修改</button>
                    <button className="mini-btn" onClick={() => setEditId('')}>取消編輯</button>
                  </div>
                )}

                {b.reviewedAt && (
                  <div style={{ width: '100%', fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                    審批回傳：{b.reviewer || '系統'} @ {b.reviewedAt}
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>

      {/* 場地清單與個別場地門鎖綁定 */}
      <section className="info-card">
        <div className="section-head">
          <div>
            <h3>場地清單與門鎖對應</h3>
            <p>如不同房間有獨立電子鎖，可於個別場地填寫專屬 Lock ID；留空則自動使用 Config 預設 <code>SCIENER_LOCK_ID</code>。</p>
          </div>
          <button className="mini-btn" disabled={busy} onClick={loadLocks}>讀取鎖列表</button>
        </div>

        <div className="account-form" style={{ flexWrap: 'wrap', display: 'flex', gap: 8 }}>
          <input
            placeholder="代碼 *（例 HQ）"
            value={vDraft.venueId}
            disabled={editingVenue}
            onChange={e => setVDraft({ ...vDraft, venueId: e.target.value })}
            style={{ width: 130 }}
          />
          <input
            placeholder="名稱 *（例 區總部 1704 室）"
            value={vDraft.name}
            onChange={e => setVDraft({ ...vDraft, name: e.target.value })}
            style={{ width: 200 }}
          />
          <input
            placeholder="位置"
            value={vDraft.location || ''}
            onChange={e => setVDraft({ ...vDraft, location: e.target.value })}
            style={{ width: 170 }}
          />
          <input
            placeholder="容量"
            value={vDraft.capacity || ''}
            onChange={e => setVDraft({ ...vDraft, capacity: e.target.value })}
            style={{ width: 80 }}
          />
          <input
            placeholder="Sciener Lock ID（選填）"
            value={vDraft.scienerLockId || ''}
            onChange={e => setVDraft({ ...vDraft, scienerLockId: e.target.value })}
            style={{ width: 165 }}
          />
          <button className="btn-sm" disabled={busy} onClick={saveVenue}>
            {editingVenue ? '💾 更新場地' : '＋ 新增場地'}
          </button>
          {editingVenue && (
            <button
              className="mini-btn"
              onClick={() => {
                setEditingVenue(false);
                setVDraft({ ...EMPTY_VENUE });
              }}
            >
              取消
            </button>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          {venues.map(v => (
            <div key={v.venueId} className="user-row" style={{ flexWrap: 'wrap' }}>
              <div className="user-identity">
                <b>{v.name}</b>
                <span className="rcode">{v.venueId}</span>
                <span>
                  {v.location || '—'}
                  {v.capacity ? ` · 容納 ${v.capacity}` : ''}
                  {v.scienerLockId
                    ? ` · 🔒 專屬鎖 #${v.scienerLockId}`
                    : cfgStatus?.lockId
                    ? ` · 🔒 共用預設鎖 #${cfgStatus.lockId}`
                    : ' · ⚠️ 未綁鎖'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="mini-btn" onClick={() => startEditVenue(v)}>✎ 編輯</button>
                <button className="mini-btn danger" onClick={() => delVenue(v)}>刪除</button>
              </div>
            </div>
          ))}
          {!venues.length && <p className="empty">尚未有場地。</p>}
        </div>
      </section>
      <BackBar />
    </>
  );
}
