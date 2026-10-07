'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 共用表單防呆：
 * - 只保存尚未提交的表單文字到瀏覽器 localStorage；成功後立即清除
 * - 偵測重新整理／離開，避免填到一半遺失
 * - 草稿存在時讓使用者自行選擇回復或放棄，絕不自動覆蓋正在填的資料
 * - submit lock 在 React 的 busy state 生效前同步上鎖，避免連按造成重複寫入
 *
 * 不應把密碼、API Key 或完整附件 data URL 放進 snapshot。
 */
export type FormLeaf = string | number | boolean;
export type FormSnapshot = Record<string, FormLeaf | Record<string, FormLeaf>>;

export interface DraftEnvelope {
  t: number;
  v: FormSnapshot;
}

function nonEmpty(value: FormLeaf | Record<string, FormLeaf>): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.trim() !== '';
  return Object.values(value || {}).some((x) => nonEmpty(x));
}

/** 表單是否已有任何有意義輸入，用作離開提示及決定是否保存草稿。 */
export function isDirty(snapshot: FormSnapshot): boolean {
  return Object.values(snapshot).some(nonEmpty);
}

/**
 * localStorage 通常只有約 5 MB。萬一日後某頁誤傳大欄位，先嘗試完整保存；
 * 配額不足時自動移除超過 100 KB 的字串，保留文字內容，避免一個大欄位令整份草稿失效。
 */
function persist(key: string, envelope: DraftEnvelope): void {
  const full = JSON.stringify(envelope);
  if (full.length <= 3_500_000) {
    try { localStorage.setItem(key, full); return; } catch { /* fallback below */ }
  }

  const slim: FormSnapshot = {};
  for (const [field, value] of Object.entries(envelope.v)) {
    if (typeof value === 'string' && value.length > 100_000) continue;
    slim[field] = value;
  }
  try { localStorage.setItem(key, JSON.stringify({ t: envelope.t, v: slim })); } catch { /* storage unavailable */ }
}

export function useFormGuard(
  key: string,
  snapshot: FormSnapshot,
  apply: (saved: FormSnapshot) => void,
  opts: { active?: boolean } = {},
) {
  const active = opts.active ?? true;
  const [pending, setPending] = useState<DraftEnvelope | null>(null);
  const applyRef = useRef(apply);
  const hydratedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  applyRef.current = apply;

  // 開頁時只讀一次。等使用者選擇後才允許新輸入覆蓋舊草稿。
  useEffect(() => {
    if (!active) { hydratedRef.current = true; return; }
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const envelope = JSON.parse(raw) as DraftEnvelope;
        if (envelope && typeof envelope.t === 'number' && envelope.v && isDirty(envelope.v)) setPending(envelope);
      }
    } catch { /* corrupted/unavailable storage = no draft */ }
    hydratedRef.current = true;
  }, [key, active]);

  // 800 ms debounce prevents a write for every keystroke.
  useEffect(() => {
    if (!active || pending || !hydratedRef.current || !isDirty(snapshot)) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => persist(key, { t: Date.now(), v: snapshot }), 800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [key, active, pending, snapshot]);

  useEffect(() => {
    if (!active || pending || !isDirty(snapshot)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active, pending, snapshot]);

  const restore = useCallback(() => {
    if (pending) applyRef.current(pending.v);
    setPending(null);
  }, [pending]);

  const discard = useCallback(() => {
    setPending(null);
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  }, [key]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  }, [key]);

  return { pending, restore, discard, clearDraft };
}

/**
 * 喺同一個 browser event loop 立即鎖住非同步寫入，補足 setState 非同步更新的空窗。
 * 同一頁任何第二次 action 都會被略過，直到第一個 action 完成。
 */
export function useSubmitLock() {
  const lockedRef = useRef(false);
  return useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    if (lockedRef.current) return undefined;
    lockedRef.current = true;
    try { return await work(); }
    finally { lockedRef.current = false; }
  }, []);
}

/** 撳寫入前顯示重點摘要；取消便不作任何 API 呼叫。 */
export function confirmSubmit(summary: string): boolean {
  if (typeof window === 'undefined') return true;
  return window.confirm(summary);
}
