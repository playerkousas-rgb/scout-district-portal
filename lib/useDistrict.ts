'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  DistrictCode, getDistrictInfo, getStoredDistrictCode, isDistrictCode,
  setStoredDistrictCode, withDistrictParam,
} from './district';

export function useDistrict() {
  const searchParams = useSearchParams();
  const [storedCode, setStoredCode] = useState<DistrictCode | null>(null);

  useEffect(() => {
    const q = searchParams.get('d');
    if (isDistrictCode(q)) {
      setStoredDistrictCode(q);
      setStoredCode(q);
      return;
    }
    setStoredCode(getStoredDistrictCode());
  }, [searchParams]);

  const districtCode = useMemo(() => {
    const q = searchParams.get('d');
    if (isDistrictCode(q)) return q;
    return storedCode;
  }, [searchParams, storedCode]);

  const district = useMemo(() => getDistrictInfo(districtCode), [districtCode]);
  // v4.5.0：穩定引用——好多頁面把 withDistrict 放入 useEffect 依賴（例如 useRequireCard），
  // 每次 render 都換新 function 會令 effect 無限重跑（不停 getCards）。
  const withDistrict = useCallback((path: string) => withDistrictParam(path, districtCode), [districtCode]);

  return {
    districtCode,
    district,
    hasDistrict: !!districtCode,
    withDistrict,
  };
}
