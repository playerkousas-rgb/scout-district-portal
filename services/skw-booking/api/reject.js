import { getEvent, rejectEvent } from '../lib/teamup.js';
import { sendRejectionToApplicant, parseEventNotes } from '../lib/email.js';
import { logToGoogleSheet } from '../lib/sheets.js';

export default async function handler(req, res) {
  const { eventId, token } = req.query;
  
  // 驗證安全憑證
  if (!token || token !== process.env.SECRET_TOKEN) {
    return res.status(401).send(`
      <div style="font-family:sans-serif; text-align:center; padding:50px;">
        <h1 style="color:#dc3545;">❌ 未授權存取</h1>
        <p>憑證無效或已過期，請勿直接存取此 API。</p>
      </div>
    `);
  }
  
  if (!eventId) {
    return res.status(400).send('缺少 eventId 參數');
  }
  
  try {
    // 1. 取得 Teamup 事件
    const event = await getEvent(eventId);
    if (!event || !event.event) {
      throw new Error('找不到該日曆事件，可能已被刪除');
    }
    const eventData = event.event;
    
    // 2. 解析申請人資料
    const info = parseEventNotes(eventData.notes);
    const email = info.email;
    const name = info.name || '申請人';
    const phone = info.phone || '';
    const people = info.people || '未提供';
    
    // 3. Teamup 更新為已拒絕 (更新標題或移動日曆)
    await rejectEvent(eventId, eventData);
    
    // 4. 發送拒絕信給申請人 (如果有電郵)
    if (email) {
      await sendRejectionToApplicant({
        email,
        name,
        eventTitle: eventData.title
      });
    }
    
    // 5. 寫入拒絕紀錄至 Google Sheets
    await logToGoogleSheet({
      status: 'Rejected',
      eventId,
      name,
      phone,
      email,
      eventTitle: eventData.title,
      startDate: eventData.start_dt,
      endDate: eventData.end_dt,
      people,
      passcode: 'N/A',
      team: info.team           // 🆕
    });
    
    // 6. 顯示拒絕成功頁面
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>申請已拒絕 - 區總部管理系統</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff5f5; text-align: center; padding: 40px 15px; margin: 0; }
          .card { background: white; padding: 40px 25px; border-radius: 12px; max-width: 500px; margin: auto; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #e55353; }
          h1 { color: #e55353; margin-top: 0; font-size: 24px; }
          .info-box { background: #f8f9fa; border: 1px solid #e1e4e8; padding: 15px; border-radius: 6px; margin: 20px 0; text-align: left; font-size: 14px; color: #4b5563; line-height: 1.6; }
          .btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: bold; background: #e5e7eb; color: #4b5563; border: none; cursor: pointer; margin-top: 20px; }
          .btn:hover { background: #d1d5db; }
          .badge { background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge">已完成處理</span>
          <h1 style="margin-top:10px;">❌ 申請已拒絕</h1>
          <p><strong>${name}</strong> 的區總部借用申請已被拒絕。</p>
          
          <div class="info-box">
            <strong>📋 申請資料摘要：</strong><br/>
            - 活動名稱：${eventData.title}<br/>
            - 申請人：${name}<br/>
            - 聯絡電郵：${email || '未提供'}
          </div>
          
          ${email ? `<p style="font-size: 14px; color: #6b7280;">📧 系統已自動發送「不獲批准」的通知信件至 <strong>${email}</strong>。</p>` : `<p style="font-size: 14px; color: #dc3545; font-weight:bold;">⚠️ 本事件沒有電郵地址，無法發送通知信，請手動聯絡申請人。</p>`}
          
          <button onclick="window.close();" class="btn">關閉此視窗</button>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error(error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>發生錯誤</title>
      <style>body{font-family:sans-serif;text-align:center;padding:50px;background:#fff5f5}
      .card{background:white;padding:40px;border-radius:10px;max-width:500px;margin:auto;box-shadow:0 4px 10px rgba(0,0,0,0.1);border-top:5px solid #dc3545;text-align:left;}
      h1{color:#dc3545;text-align:center;} pre{background:#f8f9fa;padding:15px;border-radius:5px;font-size:13px;overflow-x:auto;}
      .btn{display:block;background:#e55353;color:white;padding:12px;text-align:center;text-decoration:none;border-radius:5px;font-weight:bold;margin-top:20px;}
      </style></head>
      <body>
        <div class="card">
          <h1>❌ 拒絕處理過程中出錯</h1>
          <pre>${error.message}</pre>
          <a href="javascript:history.back()" class="btn">返回</a>
        </div>
      </body></html>
    `);
  }
}
