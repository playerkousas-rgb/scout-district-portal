import readline from 'readline';
import crypto from 'crypto';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function main() {
  console.log('===================================================');
  
  console.log('\n--- 第一部分：Teamup 日曆子日曆 ID 查詢 ---');
  const teamupKey = await ask('請輸入 Teamup API Key (或直接按 Enter 使用預設): ') || '4032acf1e6d917809aeb334a16dd0bca82297e8f0f65cd6ec32e0d92bc37bbd2';
  const teamupCalendarId = await ask('請輸入 Teamup Calendar ID (不能是 c/ 開頭的協作者連結，必須是分享連結的金鑰，例如 ks...): ');
  
  if (teamupCalendarId) {
    console.log('正在讀取 Teamup 子日曆列表...');
    try {
      const res = await fetch(`https://api.teamup.com/${teamupCalendarId}/subcalendars`, {
        headers: {
          'Teamup-Token': teamupKey,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (data.error) {
        console.error('❌ Teamup 讀取失敗:', data.error.message || data.error.title);
        console.log('提示: 請確認 Calendar ID 是否正確，且該分享連結不需登密碼。');
      } else if (data.subcalendars) {
        console.log('\n✅ 成功找到子日曆:');
        data.subcalendars.forEach(sub => {
          console.log(`- 名稱: ${sub.name} | ID: ${sub.id} | 顏色: ${sub.color}`);
        });
      }
    } catch (e) {
      console.error('❌ Teamup 讀取發生錯誤:', e.message);
    }
  } else {
    console.log('跳過 Teamup 查詢。');
  }

  console.log('\n--- 第二部分：TTLock 門鎖 ID 查詢 ---');
  const ttClientId = await ask('請輸入 TTLock Client ID: ');
  const ttClientSecret = await ask('請輸入 TTLock Client Secret: ');
  const ttUsername = await ask('請輸入 TTLock 用戶名 (lock2 帳號): ');
  const ttPassword = await ask('請輸入 TTLock 密碼: ');
  
  rl.close();

  if (ttClientId && ttClientSecret && ttUsername && ttPassword) {
    const passwordMD5 = crypto.createHash('md5').update(ttPassword).digest('hex');
    console.log('正在登入 TTLock...');
    
    try {
      const tokenRes = await fetch('https://api.ttlock.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: ttClientId,
          client_secret: ttClientSecret,
          username: ttUsername,
          password: passwordMD5,
          grant_type: 'password',
          redirect_uri: 'https://skwscout.org.hk'
        })
      });
      
      const tokenData = await tokenRes.json();
      
      if (tokenData.errcode) {
        console.error('❌ TTLock 登入失敗:', tokenData);
      } else {
        const accessToken = tokenData.access_token;
        console.log('✅ TTLock 登入成功');
        
        const lockRes = await fetch(`https://api.ttlock.com/v3/lock/list?clientId=${ttClientId}&accessToken=${accessToken}&pageNo=1&pageSize=20&date=${Date.now()}`);
        const lockData = await lockRes.json();
        
        if (!lockData.list || lockData.list.length === 0) {
          console.error('❌ 找不到任何門鎖，請確認你的帳號中已新增門鎖');
        } else {
          console.log(`\n✅ 成功找到 ${lockData.list.length} 個鎖:\n`);
          lockData.list.forEach((lock, i) => {
            console.log(`${i+1}. 名稱: ${lock.lockName}`);
            console.log(`   Lock ID: ${lock.lockId}`);
            console.log(`   MAC: ${lock.lockMac}`);
            console.log(`   已連接網關: ${lock.hasGateway ? '是' : '否 (需要網關才能遠端建密碼)'}`);
            console.log('');
          });
        }
      }
    } catch (e) {
      console.error('❌ TTLock 讀取發生錯誤:', e.message);
    }
  } else {
    console.log('跳過 TTLock 查詢。');
  }
  
  console.log('\n===================================================');
  console.log('設定完畢，請將以上取得的 ID 填入環境變數。');
}

main().catch(console.error);