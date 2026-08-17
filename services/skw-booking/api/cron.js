import { getPendingEvents, markAsApprovalSent } from '../lib/teamup.js';
import { sendApprovalRequest } from '../lib/email.js';

export default async function handler(req, res) {
  // 為了安全，可使用 AUTH 認證 header 或是 SECRET_TOKEN 作為查詢參數
  // 比如： /api/cron?token=YOUR_SECRET_TOKEN
  const { token } = req.query;
  const cronSecret = process.env.CRON_SECRET || process.env.SECRET_TOKEN;
  
  if (cronSecret && token !== cronSecret) {
    return res.status(401).json({ success: false, error: '未授權存取 Cron 任務' });
  }

  try {
    console.log('正在檢查 Teamup 待審批事件...');
    
    // 1. 取得所有在待審批子日曆中、且尚未發送過審批信的事件
    const pendingEvents = await getPendingEvents();
    console.log(`找到 ${pendingEvents.length} 個新申請事件。`);
    
    const processedEvents = [];
    
    // 2. 逐一處理
    for (const event of pendingEvents) {
      try {
        console.log(`正在發送審批信給職員：事件 ID ${event.id} - ${event.title}`);
        
        // A. 寄送 Email 給區職員 (APPROVER_EMAIL)
        await sendApprovalRequest(event);
        
        // B. 在 Teamup 日曆的 Event Notes 標記「[Approval Sent]」避免重複寄送
        await markAsApprovalSent(event);
        
        processedEvents.push({
          id: event.id,
          title: event.title,
          start: event.start_dt
        });
      } catch (eventError) {
        console.error(`處理事件 ${event.id} 時發生錯誤:`, eventError);
      }
    }
    
    return res.status(200).json({
      success: true,
      processedCount: processedEvents.length,
      processedEvents
    });
    
  } catch (error) {
    console.error('Cron 任務發生錯誤:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}