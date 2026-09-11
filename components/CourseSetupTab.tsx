'use client';
/**
 * 🎓 訓練班分頁切換（v4.17.0）
 * ⭐ 新版流程（預設）——訓練班系統先行：CL 開班→交網址→批核（改動標亮＋✔批准＋email）
 *    →通告由管理層出→掛載→收款核對→完成報告。
 * 🛠 舊直入（v4.14.0 後備）——區系統建表／雙向同步／12 張列印；舊班照用得。
 * 最舊「📋 開班登記（Sheet 先行）」喺外面 links 分頁，原封不動。
 */
import { useState } from 'react';
import type { CourseLink, UserSession } from '@/lib/types';
import CourseOpsTab from './CourseOpsTab';
import CourseSetupLegacy from './CourseSetupLegacy';

interface Props {
  session: UserSession;
  links: CourseLink[];
  reloadLinks: () => Promise<void>;
  districtName: string;
  fpsAccount: { name: string; id: string };
  memberPortalUrl: string;
  courseTemplateSet: boolean;
}

export default function CourseSetupTab(props: Props) {
  const [tab, setTab] = useState<'ops' | 'legacy'>('ops');
  return (
    <div>
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={tab === 'ops' ? 'btn-sm' : 'mini-btn'} onClick={() => setTab('ops')}>⭐ 新版流程（訓練班系統先行）</button>
        <button className={tab === 'legacy' ? 'btn-sm' : 'mini-btn'} onClick={() => setTab('legacy')}>🛠 舊直入（後備）</button>
      </div>
      {tab === 'ops'
        ? <CourseOpsTab session={props.session} links={props.links} reloadLinks={props.reloadLinks}
            districtName={props.districtName} fpsAccount={props.fpsAccount} memberPortalUrl={props.memberPortalUrl}
            courseTemplateSet={props.courseTemplateSet} />
        : <CourseSetupLegacy session={props.session} links={props.links} reloadLinks={props.reloadLinks}
            districtName={props.districtName} fpsAccount={props.fpsAccount}
            memberPortalUrl={props.memberPortalUrl} courseTemplateSet={props.courseTemplateSet} />}
    </div>
  );
}
