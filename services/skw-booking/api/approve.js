import { getEvent, approveEvent } from '../lib/teamup.js';
import { createPasscode } from '../lib/ttlock.js';
import { sendPasscodeToApplicant, parseEventNotes } from '../lib/email.js';
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
    // 1. 取得 Teamup 事件資料
    const event = await getEvent(eventId);
    if (!event || !event.event) {
      throw new Error('找不到該日曆事件，可能已被刪除');
    }
    const eventData = event.event;
    
    // 2. 解析申請人資料 (姓名、電郵、電話)
    const info = parseEventNotes(eventData.notes);
    
    const email = info.email;
    const name = info.name || '申請人';
    // 若無電話，則隨機生成一個 4 位數密碼作為備用
    const phone = info.phone || Math.floor(1000 + Math.random() * 9000).toString();
    const people = info.people || '未提供';
    
    if (!email) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>審批失敗</title>
        <style>body{font-family:sans-serif;text-align:center;padding:50px;background:#fff5f5}
        .card{background:white;padding:40px;border-radius:10px;max-width:500px;margin:auto;box-shadow:0 4px 10px rgba(0,0,0,0.1);border-top:5px solid #dc3545}
        h1{color:#dc3545} .btn{background:#6c757d;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:20px;}
        </style></head>
        <body>
          <div class="card">
            <h1>❌ 審批未完成</h1>
            <p><strong>原因：</strong>事件備忘錄（Notes）中找不到有效的「電郵地址」！</p>
            <p>系統無法自動寄送密碼。請先去 Teamup 補上電郵後再點擊審批，或手動處理此申請。</p>
            <p style="text-align:left; background:#f8f9fa; padding:10px; font-size:13px; font-family:monospace; color:#555;">
              <strong>備忘錄內容：</strong><br/>
              ${(eventData.notes || '無').replace(/\n/g, '<br/>')}
            </p>
            <a href="https://teamup.com/${process.env.TEAMUP_CALENDAR_ID}" target="_blank" class="btn">前往 Teamup 修改</a>
          </div>
        </body></html>
      `);
    }
    
    // 3. TTLock 建立密碼
    let passcodeResult;
    try {
      passcodeResult = await createPasscode({
        phone,
        startDate: eventData.start_dt,
        endDate: eventData.end_dt,
        name: `${name.substring(0, 10)} ${new Date(eventData.start_dt).toLocaleDateString('zh-HK')}`
      });
    } catch (ttError) {
      console.error('TTLock Error:', ttError);
      throw new Error(`TTLock 密碼建立失敗: ${ttError.message}。請確認 TTLock 網關是否連線，且該時段與密碼未重複。`);
    }
    
    // 4. Teamup 藍轉紅 (批准)
    await approveEvent(eventId, eventData);
    
    // 5. 發 Email 給申請人
    await sendPasscodeToApplicant({
      email,
      name,
      passcode: passcodeResult.passcode,
      startDate: passcodeResult.validFrom,
      endDate: passcodeResult.validTo,
      eventTitle: eventData.title
    });
    
    // 6. 寫入紀錄至 Google Sheets
    await logToGoogleSheet({
      status: 'Approved',
      eventId,
      name,
      phone,
      email,
      eventTitle: eventData.title,
      startDate: eventData.start_dt,
      endDate: eventData.end_dt,
      people,
      passcode: passcodeResult.passcode,
      team: info.team           // 🆕
    });
    
    // 準備 WhatsApp 送出內容
    const formattedStart = new Date(passcodeResult.validFrom).toLocaleString('zh-HK');
    const formattedEnd = new Date(passcodeResult.validTo).toLocaleString('zh-HK');
    const whatsappMessage = `🏕️ 筲箕灣區總部借用批准通知 🏕️\n\n你好 ${name}，你所申請的區總部借用【${eventData.title}】已獲批准！\n\n🔑 門鎖限時密碼：${passcodeResult.passcode}\n⏰ 有效時間：${formattedStart} 至 ${formattedEnd}\n\n*注意事項：*\n1. 密碼僅在有效時間內起作用。\n2. 使用完畢後，請關閉所有電源，確保大門鎖上並將垃圾帶走。\n\n香港童軍總會筲箕灣區 敬啟`;
    
    // 產生 WhatsApp 傳送連結 (香港手機 852)
    const cleanPhone = phone.startsWith('852') ? phone : `852${phone.replace(/\s+/g, '')}`;
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(whatsappMessage)}`;
    
    // 回應成功頁面
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>批准成功 - 區總部管理系統</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f0fdf4; text-align: center; padding: 30px 15px; margin: 0; }
          .card { background: white; padding: 40px 25px; border-radius: 12px; max-width: 550px; margin: auto; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #2eb85c; }
          h1 { color: #15803d; margin-top: 0; font-size: 26px; }
          .code-box { background: #f0fdf4; border: 2px dashed #bbf7d0; padding: 20px; border-radius: 8px; margin: 25px 0; }
          .code { font-size: 42px; font-weight: 800; letter-spacing: 6px; color: #166534; font-family: monospace; }
          .time-info { text-align: left; background: #f8f9fa; padding: 15px; border-radius: 6px; font-size: 14px; color: #4b5563; margin-top: 15px; line-height: 1.6; }
          .btn-group { display: flex; flex-direction: column; gap: 12px; margin-top: 30px; }
          .btn { display: inline-flex; align-items: center; justify-content: center; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold; transition: all 0.2s; border: none; cursor: pointer; }
          .btn-whatsapp { background: #25D366; color: white; }
          .btn-whatsapp:hover { background: #1ebd59; }
          .btn-close { background: #e5e7eb; color: #4b5563; }
          .btn-close:hover { background: #d1d5db; }
          .badge { background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge">自動化作業完成</span>
          <h1 style="margin-top:10px;">✅ 審批並授權成功</h1>
          <p><strong>${name}</strong> 的申請已順利處理！</p>
          
          <div class="code-box">
            <span style="font-size:13px; color:#15803d; font-weight:bold; display:block; margin-bottom:5px;">臨時開門密碼</span>
            <div class="code">${passcodeResult.passcode}</div>
            <div class="time-info">
              <strong>⏰ 密碼生效時間：</strong><br/>
              由：${formattedStart}<br/>
              至：${formattedEnd}
            </div>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">
            📧 系統已自動將密碼 Email 發送至：<br/><strong>${email}</strong>
          </p>
          
          <div class="btn-group">
            <a href="${whatsappUrl}" target="_blank" class="btn btn-whatsapp">
              💬 一鍵透過 WhatsApp 發送密碼
            </a>
            <button onclick="window.close();" class="btn btn-close">關閉此視窗</button>
          </div>
          
          <p style="color:#9ca3af; font-size:12px; margin-top:25px;">
            Teamup 已轉為紅色 (確認借用) | TTLock 限時密碼已成功寫入門鎖 | 統計數據已同步至 Google Sheet
          </p>
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
      .card{background:white;padding:40px;border-radius:10px;max-width:550px;margin:auto;box-shadow:0 4px 10px rgba(0,0,0,0.1);border-top:5px solid #dc3545;text-align:left;}
      h1{color:#dc3545;text-align:center;} pre{background:#f8f9fa;padding:15px;border-radius:5px;font-size:13px;overflow-x:auto;}
      .btn{display:block;background:#0070f3;color:white;padding:12px;text-align:center;text-decoration:none;border-radius:5px;font-weight:bold;margin-top:20px;}
      </style></head>
      <body>
        <div class="card">
          <h1>❌ 審批過程中出錯</h1>
          <p>很抱煙，在執行自動化處理時發生了以下錯誤：</p>
          <pre>${error.message}</pre>
          <p style="color:#666; font-size:14px;"><strong>排查建議：</strong><br/>
          1. 請確認 TTLock 網卡/網關是否正常連線。<br/>
          2. 請確認對應的環境變數是否正確。<br/>
          3. 如果是 Teamup 錯誤，請確認 API Key 與日曆 ID (非 c/ 開頭) 權限正確。</p>
          <a href="javascript:history.back()" class="btn">返回上一頁</a>
        </div>
      </body></html>
    `);
  }
}
