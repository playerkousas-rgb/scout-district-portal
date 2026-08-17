// 前端「卡片門禁」：跟後台 Perms 矩陣一致 —— 睇唔到嗰張卡 = 唔可以進入該功能頁。
// 就算有人直接打 URL（例如 /stock-regs），如果佢個角色對該卡冇 access，都 redirect 返主控台。
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api';
import { loadSession } from './session';
import { useDistrict } from './useDistrict';
import type { UserSession } from './types';

export async function canAccessCard(token: string, cardId: string): Promise<boolean> {
  try {
    const r = await api.getCards(token);
    if (r.ok && r.data) return r.data.some(c => c.cardId === cardId);
    return false;
  } catch {
    return false;
  }
}

/**
 * 頁面門禁 hook：登入 → 檢查該角色對指定 card 有冇 access。
 * - 未登入 → redirect 主控台
 * - 睇唔到嗰張卡 → redirect 主控台
 * 通過先返回 session。
 */
export function useRequireCard(cardId: string): UserSession | null {
  const router = useRouter();
  const { withDistrict } = useDistrict();
  const [session, setSession] = useState<UserSession | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace(withDistrict('/')); return; }
    canAccessCard(s.token, cardId).then(ok => {
      if (!ok) { router.replace(withDistrict('/')); return; }
      setSession(s);
    });
  }, [router, withDistrict, cardId]);

  return session;
}
