/**
 * TTLock Lock ID 自動抓取工具
 * 用法: node get-lock-id.js
 */
const readline = require('readline');
const crypto = require('crypto');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function main() {
  console.log('=== 筲箕灣區 TTLock 設定精靈 ===\n');
  
  const clientId = await ask('1. Client ID (open.ttlock.com 取得): ');
  const clientSecret = await ask('2. Client Secret: ');
  const username = await ask('3. TTLock 用戶名 (lock2.sciener.com): ');
  const password = await ask('4. TTLock 密碼: ');
  
  rl.close();
  
  // TTLock 需要 MD5 密碼
  const passwordMD5 = crypto.createHash('md5').update(password).digest('hex');
  
  console.log('\n正在登入 TTLock...');
  
  // 1. 取得 access token
  const tokenRes = await fetch('https://api.ttlock.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      username: username,
      password: passwordMD5,
      grant_type: 'password',
      redirect_uri: 'https://skwscout.org.hk'
    })
  });
  
  const tokenData = await tokenRes.json();
  
  if (tokenData.errcode) {
    console.error('❌ 登入失敗:', tokenData);
    console.error('\n常見原因:');
    console.error('- Client ID/Secret 錯誤');
    console.error('- 用戶名密碼錯誤 (用 lock2.sciener.com 的)');
    console.error('- 需先在 open.ttlock.com 綁定帳號');
    return;
  }
  
  const accessToken = tokenData.access_token;
  console.log('✅ 登入成功');
  
  // 2. 取得鎖列表
  const lockRes = await fetch(`https://api.ttlock.com/v3/lock/list?clientId=${clientId}&accessToken=${accessToken}&pageNo=1&pageSize=20&date=${Date.now()}`);
  const lockData = await lockRes.json();
  
  if (!lockData.list || lockData.list.length === 0) {
    console.error('❌ 找不到任何鎖，請確認你的帳號有權限');
    return;
  }
  
  console.log(`\n✅ 找到 ${lockData.list.length} 個鎖:\n`);
  
  lockData.list.forEach((lock, i) => {
    console.log(`${i+1}. 名稱: ${lock.lockName}`);
    console.log(`   Lock ID: ${lock.lockId}`);
    console.log(`   MAC: ${lock.lockMac}`);
    console.log(`   已連接網關: ${lock.hasGateway ? '是' : '否 (需要網關才能遠程建密碼)'}`);
    console.log('');
  });
  
  console.log('=== 請抄下 Lock ID 放到 Vercel 環境變數 TTLOCK_LOCK_ID ===');
}

main().catch(console.error);