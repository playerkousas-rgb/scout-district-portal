'use client';
import { useEffect, useMemo, useState } from 'react';
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

  return {
    districtCode,
    district,
    hasDistrict: !!districtCode,
    withDistrict: (path: string) => withDistrictParam(path, districtCode),
  };
}
