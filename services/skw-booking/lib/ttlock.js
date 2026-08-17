/**
 * TTLock 密碼建立 (FIXED — 解決「設定密碼」卡住問題)
 * ================================================================
 * 文件: https://open.ttlock.com/doc/api/v3/keyboardPwd/add
 *
 * 這次修正了 4 個會令你卡在「設定密碼」的原因：
 *  1. 密碼長度：TTLock「時段密碼」(有 startDate/endDate) 必須 6~8 位，
 *     舊版用「電話頭 4 位」→ 只有 4 位會被 API 拒絕。
 *     → 預設改用 6 位 (可經 TTLOCK_PASSCODE_LENGTH 調整)。
 *  2. API 區域伺服器：TTLock 分區，舊版寫死 https://api.ttlock.com，
 *     帳號/鎖在別區 (EU/中國) 會登入或建碼失敗。
 *     → 用 TTLOCK_API_BASE 設定 (見下方 REGION_BASES)。
 *  3. 撞碼重試：4/6 位碼在香港極易重複，重疊時段撞碼會被 TTLock 拒絕。
 *     → 自動 +1 遞增重試，直到找到可用密碼。
 *  4. 未就緒也可先跑：設 TTLOCK_DISABLED=1 時跳過 TTLock，
 *     Teamup/Email/Sheet 仍會正常跑 (審批不中斷)，方便先聯調其餘流程。
 */
import crypto from 'crypto';

// TTLock 開放平台各區伺服器（視你帳號/鎖註冊在哪個 server，換成對應那個）
const REGION_BASES = {
  global: 'https://api.ttlock.com',      // 國際 / 通用
  eu:     'https://euapi.ttlock.com',    // 歐洲
  cn:     'https://cnopen.ttlock.com',   // 中國
};

function getApiBase() {
  const raw = process.env.TTLOCK_API_BASE || 'global';
  if (REGION_BASES[raw]) return REGION_BASES[raw];
  return raw.replace(/\/$/, ''); // 也接受自訂完整網址
}

let accessToken = null;
let tokenExpiry = 0;

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`未設定 TTLock 環境變數 ${name}`);
  return v;
}

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const clientId = requiredEnv('TTLOCK_CLIENT_ID');
  const clientSecret = requiredEnv('TTLOCK_CLIENT_SECRET');
  const username = requiredEnv('TTLOCK_USERNAME');
  const password = requiredEnv('TTLOCK_PASSWORD');
  const base = getApiBase();

  const passwordMD5 = crypto.createHash('md5').update(password).digest('hex');

  const res = await fetch(`${base}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      username,
      password: passwordMD5,
      grant_type: 'password'
    })
  });

  const data = await res.json();

  if (data.access_token) {
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (Number(data.expires_in || 7200) - 60) * 1000;
    return accessToken;
  }

  throw new Error(
    'TTLock 登入失敗 (確認 TTLOCK_CLIENT_ID/CLIENT_SECRET/USERNAME/PASSWORD 及區域 TTLOCK_API_BASE) '
    + JSON.stringify(data)
  );
}

// 從電話號碼產生一組「長度 TTLOCK_PASSCODE_LENGTH (預設6)」的基礎密碼。
// 取電話頭 N 位，不夠就用電話數字代入補足，保證是 N 位純數字。
function buildBasePasscode(phone) {
  const len = parseInt(process.env.TTLOCK_PASSCODE_LENGTH || '6', 10) || 6;
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= len) return digits.slice(0, len);
  let base = digits;
  let seed = parseInt(digits || '0', 10) || 0;
  while (base.length < len) {
    base += String((seed + base.length) % 10);
  }
  return base.slice(0, len);
}

// 密碼 +1（保持 N 位、補前導零），供撞碼重試用
function incrementCode(code) {
  const len = code.length;
  const n = (parseInt(code, 10) + 1) % Math.pow(10, len);
  return String(n).padStart(len, '0');
}

// 單次呼叫 TTLock 新增密碼；失敗拋出含 errcode 的錯誤
async function callAddPasscode({ lockId, token, clientId, passcode, name, start, end }) {
  const base = getApiBase();
  const params = {
    clientId,
    accessToken: token,
    lockId: String(lockId),
    keyboardPwd: passcode,
    keyboardPwdName: name.substring(0, 30),
    startDate: start.getTime().toString(),
    endDate: end.getTime().toString(),
    addType: '2', // 2 = 經網關 (遠端寫入)
    date: Date.now().toString()
  };

  const res = await fetch(`${base}/v3/keyboardPwd/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params)
  });

  const data = await res.json();

  if (data.keyboardPwdId || data.errcode === 0) {
    return { keyboardPwdId: data.keyboardPwdId, passcode };
  }

  const err = new Error(`建立密碼失敗 (錯誤碼 ${data.errcode}): ${data.errmsg || JSON.stringify(data)}`);
  err.errcode = data.errcode;
  throw err;
}

/**
 * 建立限時密碼。
 * 返回 { success, passcode, validFrom, validTo }。
 * 若 TTLOCK_DISABLED=1：不呼叫 TTLock，直接返回生成的密碼（模擬），
 * 讓整條審批流程（Teamup / Email / Sheet）不因 TTLock 未設定而中斷。
 */
export async function createPasscode({ phone, startDate, endDate, name }) {
  const disabled = process.env.TTLOCK_DISABLED === '1' || process.env.TTLOCK_DISABLED === 'true';
  const lockId = process.env.TTLOCK_LOCK_ID ? parseInt(process.env.TTLOCK_LOCK_ID) : NaN;

  const start = new Date(startDate);
  start.setMinutes(start.getMinutes() - 15); // 提早 15 分鐘生效
  const end = new Date(endDate);
  end.setMinutes(end.getMinutes() + 15);     // 延後 15 分鐘失效

  const passcode = buildBasePasscode(phone);

  if (disabled) {
    console.warn(`[TTLock] TTLOCK_DISABLED=1，跳過 TTLock，密碼採模擬值 ${passcode}。`);
    return { success: true, passcode, validFrom: start, validTo: end, simulated: true };
  }

  if (!lockId) throw new Error('未設定 TTLOCK_LOCK_ID 環境變數 (或 TTLOCK_DISABLED=1 以跳過)');

  const token = await getAccessToken();
  const clientId = requiredEnv('TTLOCK_CLIENT_ID');

  // 撞碼自動重試：同一鎖同一時段密碼不可重複，香港電話頭碼極易相撞。
  let candidate = passcode;
  let lastErr = null;
  const maxAttempts = parseInt(process.env.TTLOCK_RETRY || '8', 10);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const r = await callAddPasscode({ lockId, token, clientId, passcode: candidate, name, start, end });
      return { success: true, passcode: r.passcode, validFrom: start, validTo: end };
    } catch (e) {
      lastErr = e;
      console.warn(`[TTLock] 密碼 ${candidate} 失敗 (${e.errcode ?? e.message})，嘗試下一個…`);
      candidate = incrementCode(candidate);
    }
  }

  throw new Error(
    `TTLock 建碼多次失敗 (最後錯誤: ${lastErr && lastErr.message})。`
    + '請確認：1) 網關在線 2) TTLOCK_LOCK_ID 正確 3) 密碼長度設 6 位 (TTLOCK_PASSCODE_LENGTH) '
    + '4) 區域 TTLOCK_API_BASE 正確。或設 TTLOCK_DISABLED=1 先跳過 TTLock。'
  );
}
