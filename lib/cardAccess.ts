// 前端「卡片門禁」：跟後台 Perms 矩陣一致 —— 睇唔到嗰張卡 = 唔可以進入該功能頁。
// 就算有人直接打 URL（例如 /stock-regs），如果佢個角色對該卡冇 access，都 redirect 返主控台。
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api';
import { loadSession } from './session';
import { useDistrict } from './useDistrict';
import type { UserSession } from './types';

export type CardAccessCheck =
  | { status: 'allowed' }
  | { status: 'denied' }
  | { status: 'error'; error: string };

type GetCards = typeof api.getCards;

/**
 * 只有後台成功回傳卡片清單、而清單確實沒有此卡，才屬明確拒絕。
 * 連線失敗、API 錯誤或回應格式異常必須保留為 error，不能冒充無權限。
 * 注入 getCards 方便純邏輯測試；正式頁面預設使用現有 API proxy。
 */
export async function checkCardAccess(
  token: string,
  cardId: string,
  getCards: GetCards = api.getCards,
): Promise<CardAccessCheck> {
  try {
    const r = await getCards(token);
    if (r.ok && Array.isArray(r.data)) {
      return r.data.some(c => c.cardId === cardId) ? { status: 'allowed' } : { status: 'denied' };
    }
    return { status: 'error', error: r.error || '後台未能確認卡片權限，請稍後再試。' };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error && error.message
        ? `連線失敗：${error.message}`
        : '連線失敗，暫時未能確認卡片權限。',
    };
  }
}

/** 舊呼叫方維持 boolean 語義；需要分辨錯誤的頁面應使用 checkCardAccess。 */
export async function canAccessCard(token: string, cardId: string): Promise<boolean> {
  return (await checkCardAccess(token, cardId)).status === 'allowed';
}

interface CardAccessState {
  session: UserSession | null;
  checking: boolean;
  error: string;
  retry: () => void;
}

function useCardAccess(cardId: string, redirectOnError: boolean): CardAccessState {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const [session, setSession] = useState<UserSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setChecking(true);
    setError('');
    const s = loadSession();
    if (!s) {
      setChecking(false);
      router.replace(withDistrict('/'));
      return () => { cancelled = true; };
    }
    checkCardAccess(s.token, cardId).then(result => {
      if (cancelled) return;
      if (result.status === 'error') {
        setChecking(false);
        if (redirectOnError) router.replace(withDistrict('/'));
        else setError(result.error);
        return;
      }
      if (result.status === 'denied') {
        setChecking(false);
        router.replace(withDistrict('/'));
        return;
      }
      // 同一個 token 唔再換新 object（避免多餘 re-render）
      setSession(prev => (prev && prev.token === s.token ? prev : s));
      setChecking(false);
    });
    return () => { cancelled = true; };
  }, [router, withDistrict, cardId, attempt, redirectOnError]);

  return { session, checking, error, retry };
}

/**
 * 一般頁面門禁：未登入、明確無卡片，或（沿用舊行為）驗證失敗時回主控台。
 * 新頁面若需顯示可重試錯誤，應使用 useRequireCardAccess。
 */
export function useRequireCard(cardId: string): UserSession | null {
  return useCardAccess(cardId, true).session;
}

/**
 * DEBIT NOTE 等需要避免「 transient error 當無權限」的頁面：
 * 未登入／明確無卡仍會回主控台；API／連線錯誤則留頁顯示 error，並可 retry。
 */
export function useRequireCardAccess(cardId: string): CardAccessState {
  return useCardAccess(cardId, false);
}
