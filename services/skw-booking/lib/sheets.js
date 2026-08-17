/**
 * Google Sheets 統計日誌記錄器
 * 當審批成功或拒絕時，調用 Google Apps Script Web App 將資料寫入 Sheet 中
 */
export async function logToGoogleSheet({
  status, // 'Approved' | 'Rejected'
  eventId,
  name,
  phone,
  email,
  eventTitle,
  startDate,
  endDate,
  people,
  passcode = '',
  team = ''                  // 🆕
}) {
  const gasUrl = process.env.GAS_WEBAPP_URL;
  
  if (!gasUrl) {
    console.log('未設定 GAS_WEBAPP_URL，跳過寫入 Google Sheets。');
    return { success: true, message: 'Skipped' };
  }
  
  try {
    const payload = {
      timestamp: new Date().toLocaleString('zh-HK'),
      status,
      eventId,
      name,
      phone,
      email,
      eventTitle,
      startDate: new Date(startDate).toLocaleString('zh-HK'),
      endDate: new Date(endDate).toLocaleString('zh-HK'),
      people,
      passcode,
      team                    // 🆕
    };
    
    console.log(`正在發送紀錄至 Google Sheet... 事件 ID: ${eventId}`);
    
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const result = await res.text();
    console.log('Google Sheets 寫入結果:', result);
    return { success: true, response: result };
    
  } catch (error) {
    console.error('寫入 Google Sheets 時發生錯誤:', error.message);
    // 回報錯誤但不中斷整個審批流程
    return { success: false, error: error.message };
  }
}
