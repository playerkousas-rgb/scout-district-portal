/**
 * Teamup API 控制
 */
const TEAMUP_KEY = process.env.TEAMUP_API_KEY;
const CALENDAR_ID = process.env.TEAMUP_CALENDAR_ID;

const headers = {
  'Teamup-Token': TEAMUP_KEY,
  'Content-Type': 'application/json'
};

// 取得待審批事件 (屬於待審批 subcalendar 且沒有 [Approval Sent] 標記的事件)
export async function getPendingEvents() {
  const now = new Date();
  // 查詢過去 3 天到未來 90 天的事件
  const start = new Date(now.getTime() - 3 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const end = new Date(now.getTime() + 90 * 24 * 3600 * 1000).toISOString().split('T')[0];
  
  const res = await fetch(`https://api.teamup.com/${CALENDAR_ID}/events?startDate=${start}&endDate=${end}`, {
    headers
  });
  
  const data = await res.json();
  
  if (!data.events) {
    console.error('Teamup API Error: No events returned', data);
    return [];
  }
  
  const pendingSubId = parseInt(process.env.TEAMUP_PENDING_SUB_ID);
  
  // 篩選出屬於 pending 庫、且 notes 內沒有 [Approval Sent] 標記的事件
  return data.events.filter(e => {
    const isPendingSub = e.subcalendar_ids && e.subcalendar_ids.includes(pendingSubId);
    const hasSentTag = e.notes && e.notes.includes('[Approval Sent]');
    return isPendingSub && !hasSentTag;
  });
}

// 標記某個事件已發送審批信 (避免重複發送)
export async function markAsApprovalSent(event) {
  const updatedNotes = `${event.notes || ''}\n\n[Approval Sent] - 審批郵件已於 ${new Date().toLocaleString('zh-HK')} 發送`;
  
  const res = await fetch(`https://api.teamup.com/${CALENDAR_ID}/events/${event.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      subcalendar_ids: event.subcalendar_ids,
      title: event.title,
      notes: updatedNotes
    })
  });
  
  return res.json();
}

// 批准事件：將子日曆從「待審批 (藍色)」轉為「確認借用 (紅色)」
export async function approveEvent(eventId, eventData) {
  const approvedSubId = parseInt(process.env.TEAMUP_APPROVED_SUB_ID);
  
  // 清理 notes 中的標記，並加上批准時間
  let cleanNotes = eventData.notes || '';
  cleanNotes = cleanNotes.replace('[Approval Sent]', '').trim();
  
  const updatedNotes = `${cleanNotes}\n\n✅ 已批准於 ${new Date().toLocaleString('zh-HK')}\n密碼已自動生成並發送`;
  
  const update = {
    subcalendar_ids: [approvedSubId],
    title: eventData.title.replace('申請', '').replace('【申請】', '').trim() + ' (已批准)',
    notes: updatedNotes
  };
  
  const res = await fetch(`https://api.teamup.com/${CALENDAR_ID}/events/${eventId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(update)
  });
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Teamup 批准更新失敗: ${errText}`);
  }
  
  return res.json();
}

// 拒絕事件：將標題改為已拒絕，或者移到已拒絕子日曆
export async function rejectEvent(eventId, eventData) {
  let cleanNotes = eventData.notes || '';
  cleanNotes = cleanNotes.replace('[Approval Sent]', '').trim();
  
  const updatedNotes = `${cleanNotes}\n\n❌ 已拒絕於 ${new Date().toLocaleString('zh-HK')}`;
  
  const update = {
    subcalendar_ids: eventData.subcalendar_ids, // 保持在原日曆或如果設定了拒絕子日曆可以移過去
    title: eventData.title.replace('申請', '').replace('【申請】', '').trim() + ' (已拒絕)',
    notes: updatedNotes
  };
  
  // 如果有設定 REJECTED_SUB_ID，就移過去
  if (process.env.TEAMUP_REJECTED_SUB_ID) {
    update.subcalendar_ids = [parseInt(process.env.TEAMUP_REJECTED_SUB_ID)];
  }
  
  const res = await fetch(`https://api.teamup.com/${CALENDAR_ID}/events/${eventId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(update)
  });
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Teamup 拒絕更新失敗: ${errText}`);
  }
  
  return res.json();
}

export async function getEvent(eventId) {
  const res = await fetch(`https://api.teamup.com/${CALENDAR_ID}/events/${eventId}`, { headers });
  if (!res.ok) {
    throw new Error(`無法取得 Teamup 事件: ${res.statusText}`);
  }
  return res.json();
}