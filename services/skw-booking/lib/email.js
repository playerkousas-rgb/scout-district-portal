/**
 * 發送 Email (用 Gmail SMTP)
 */
import nodemailer from 'nodemailer';

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  
  if (!user || !pass) {
    throw new Error('未設定 Gmail SMTP 環境變數 (GMAIL_USER, GMAIL_APP_PASSWORD)');
  }
  
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
}

// 解析事件 notes 中的欄位
export function parseEventNotes(notes) {
  if (!notes) return {};
  
  // Resilient Regular Expressions
  const phoneMatch = notes.match(/(?:電話|聯絡電話|手机|手機|Phone|Mobile)[:：\s]+([2-9]\d{7})/i) || notes.match(/([2-9]\d{7})/);
  const emailMatch = notes.match(/(?:電郵|電子郵件|郵箱|Email)[:：\s]+([\w.-]+@[\w.-]+\.\w+)/i) || notes.match(/([\w.-]+@[\w.-]+\.\w+)/);
  const nameMatch = notes.match(/(?:姓名|聯絡人|申請人|Name)[:：\s]+([^\n\r]+)/i);
  const peopleMatch = notes.match(/(?:人數|借用人數|People|Capacity)[:：\s]+(\d+)/i);
  const teamMatch = notes.match(/(?:旅團|旅|團號|Group|Team)[:：\s]+([^\n\r]+)/i);

return {
  phone: phoneMatch ? phoneMatch[1].trim() : '',
  email: emailMatch ? emailMatch[1].trim() : '',
  name: nameMatch ? nameMatch[1].trim() : '申請人',
  people: peopleMatch ? peopleMatch[1].trim() : '未提供',
  team: teamMatch ? teamMatch[1].trim() : ''   // 🆕
};
 }

// 發送待審批信給區職員
export async function sendApprovalRequest(event) {
  const info = parseEventNotes(event.notes);
  
  // 建立審批、拒絕、以及修訂的 URL
  const baseUrl = process.env.BASE_URL || `https://${process.env.VERCEL_URL}`;
  const approveUrl = `${baseUrl}/api/approve?eventId=${event.id}&token=${process.env.SECRET_TOKEN}`;
  const rejectUrl = `${baseUrl}/api/reject?eventId=${event.id}&token=${process.env.SECRET_TOKEN}`;
  
  // 3. 修訂連結：直接打開 Teamup 該事件的編輯視窗
  // Teamup 的特定事件連結格式為： https://teamup.com/日曆ID/?view=e&id=事件ID
  const modifyUrl = `https://teamup.com/${process.env.TEAMUP_CALENDAR_ID}/?view=e&id=${event.id}`;
  
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e4e8; border-radius: 8px;">
      <h2 style="color: #003366; text-align: center; margin-bottom: 30px; border-bottom: 2px solid #003366; padding-bottom: 10px;">🏕️ 區總部借用申請</h2>
      
      <p style="font-size: 16px; color: #333;">職員你好，收到一筆新的區總部借用申請，請進行審批：</p>
      
      <div style="background-color: #f6f8fa; border-left: 4px solid #003366; padding: 15px 20px; margin: 20px 0; border-radius: 0 4px 4px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 15px; color: #444;">
          <tr style="height: 30px;"><td style="width: 100px; font-weight: bold;">活動名稱:</td><td>${event.title}</td></tr>
          <tr style="height: 30px;"><td style="font-weight: bold;">申請人:</td><td>${info.name}</td></tr>
          <tr style="height: 30px;"><td style="font-weight: bold;">電話:</td><td>${info.phone || '未提供'}</td></tr>
          <tr style="height: 30px;"><td style="font-weight: bold;">電郵:</td><td>${info.email || '未提供'}</td></tr>
          <tr style="height: 30px;"><td style="font-weight: bold;">人數:</td><td>${info.people}</td></tr>
          <tr style="height: 30px;"><td style="font-weight: bold;">日期:</td><td>${new Date(event.start_dt).toLocaleString('zh-HK')}</td></tr>
          <tr style="height: 30px;"><td style="font-weight: bold;">至:</td><td>${new Date(event.end_dt).toLocaleString('zh-HK')}</td></tr>
        </table>
      </div>
      
      <div style="margin: 35px 0; text-align: center;">
        <a href="${approveUrl}" target="_blank" style="background-color: #2eb85c; color: white; padding: 14px 24px; text-decoration: none; border-radius: 6px; margin: 5px; display: inline-block; font-size: 15px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">✅ 一鍵批准</a>
        <a href="${modifyUrl}" target="_blank" style="background-color: #f9b115; color: white; padding: 14px 24px; text-decoration: none; border-radius: 6px; margin: 5px; display: inline-block; font-size: 15px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1); color: #3c3c3c;">✏️ 修改申請</a>
        <a href="${rejectUrl}" target="_blank" style="background-color: #e55353; color: white; padding: 14px 24px; text-decoration: none; border-radius: 6px; margin: 5px; display: inline-block; font-size: 15px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">❌ 拒絕申請</a>
      </div>
      
      <hr style="border: 0; border-top: 1px solid #e1e4e8; margin: 30px 0;" />
      
      <p style="color: #666; font-size: 12px; line-height: 1.5; text-align: center;">
        💡 <strong>如何修改申請？</strong><br/>
        如果申請時段有衝突或填寫有誤，點擊「✏️ 修改申請」將直接進入 Teamup 進行修改。<br/>
        <strong>修改並存檔後，直接返回本郵件點擊「✅ 一鍵批准」即可，系統會自動抓取你修訂後的最新內容（如新時間/新電話）來產生大門密碼！</strong>
      </p>
    </div>
  `;
  
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"筲箕灣區總部自動化系統" <${process.env.GMAIL_USER}>`,
    to: process.env.APPROVER_EMAIL,
    subject: `[待審批] ${info.name} - 申請借用區總部 (${new Date(event.start_dt).toLocaleDateString('zh-HK')})`,
    html
  });
}

// 發送已批准及密碼通知給申請人 (支援 CC 知會 Email)
export async function sendPasscodeToApplicant({ email, name, passcode, startDate, endDate, eventTitle }) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e4e8; border-radius: 8px;">
      <h2 style="color: #2eb85c; text-align: center; margin-bottom: 25px; border-bottom: 2px solid #2eb85c; padding-bottom: 10px;">✅ 區總部借用申請 - 已獲批准</h2>
      
      <p style="font-size: 16px; color: #333;">${name} 你好，</p>
      <p style="font-size: 15px; color: #555; line-height: 1.5;">你所申請的區總部借用 <strong>${eventTitle}</strong> 已經獲得批准。以下是你的場地門鎖臨時密碼：</p>
      
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 25px; text-align: center; margin: 25px 0;">
        <span style="display: block; font-size: 14px; color: #166534; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">門鎖限時密碼</span>
        <span style="display: block; font-size: 38px; font-weight: 800; color: #15803d; letter-spacing: 6px; margin: 15px 0; font-family: monospace;">${passcode}</span>
        <div style="font-size: 14px; color: #374151; line-height: 1.6; border-top: 1px dashed #bbf7d0; padding-top: 15px; margin-top: 15px; text-align: left;">
          <strong>密碼有效時間：</strong><br/>
          ⏱️ 開始：${new Date(startDate).toLocaleString('zh-HK')}<br/>
          ⏱️ 結束：${new Date(endDate).toLocaleString('zh-HK')}
        </div>
      </div>
      
      <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 25px 0; border-radius: 0 4px 4px 0; font-size: 14px; color: #78350f; line-height: 1.5;">
        <strong style="font-size: 15px;">⚠️ 借用守則與注意事項：</strong>
        <ol style="margin: 8px 0 0 20px; padding: 0;">
          <li>密碼僅在上述有效時間內起作用，提前或過期皆無法開門。</li>
          <li>使用完畢後，請確保所有電器（冷氣、燈光等）已關閉、垃圾清走，並將大門確實鎖上。</li>
          <li>如有任何緊急情況，請聯絡區職員。</li>
        </ol>
      </div>
      
      <p style="font-size: 14px; color: #666; text-align: center; margin-top: 40px; border-top: 1px solid #e1e4e8; padding-top: 15px;">
        香港童軍總會筲箕灣區 敬啟
      </p>
    </div>
  `;
  
  const mailOptions = {
    from: `"筲箕灣區總部" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `[已批准] 區總部借用申請 - 門鎖密碼為 ${passcode}`,
    html
  };
  
  // 如果設定了知會電郵，則加入 CC
  if (process.env.NOTIFICATION_EMAIL) {
    mailOptions.cc = process.env.NOTIFICATION_EMAIL;
  }
  
  const transporter = getTransporter();
  await transporter.sendMail(mailOptions);
}

// 發送拒絕通知給申請人 (支援 CC 知會 Email)
export async function sendRejectionToApplicant({ email, name, eventTitle }) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e4e8; border-radius: 8px;">
      <h2 style="color: #e55353; text-align: center; margin-bottom: 25px; border-bottom: 2px solid #e55353; padding-bottom: 10px;">❌ 區總部借用申請 - 未獲批准</h2>
      
      <p style="font-size: 16px; color: #333;">${name} 你好，</p>
      <p style="font-size: 15px; color: #555; line-height: 1.6;">感謝你對筲箕灣區總部場地的申請。</p>
      <p style="font-size: 15px; color: #555; line-height: 1.6;">很抱歉通知你，你所申請的區總部借用 <strong>${eventTitle}</strong> 由於時段衝突或場地維護等原因，<strong>本次申請未獲批准</strong>。</p>
      
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 25px 0; border-radius: 0 4px 4px 0; font-size: 14px; color: #991b1b; line-height: 1.5;">
        如有疑問，請電郵至 <a href="mailto:${process.env.GMAIL_USER}" style="color: #ef4444; text-decoration: underline;">${process.env.GMAIL_USER}</a> 或聯絡區職員查詢。
      </div>
      
      <p style="font-size: 14px; color: #666; text-align: center; margin-top: 40px; border-top: 1px solid #e1e4e8; padding-top: 15px;">
        香港童軍總會筲箕灣區 敬啟
      </p>
    </div>
  `;
  
  const mailOptions = {
    from: `"筲箕灣區總部" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `[未批准] 區總部借用申請通知 - ${eventTitle}`,
    html
  };
  
  // 如果設定了知會電郵，則加入 CC
  if (process.env.NOTIFICATION_EMAIL) {
    mailOptions.cc = process.env.NOTIFICATION_EMAIL;
  }
  
  const transporter = getTransporter();
  await transporter.sendMail(mailOptions);
}
