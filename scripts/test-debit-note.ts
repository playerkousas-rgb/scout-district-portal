/**
 * DEBIT NOTE 純邏輯測試
 *   npx tsx scripts/test-debit-note.ts
 */
import assert from 'node:assert/strict';
import {
  buildDebitNoteSheets,
  canGenerateDebitNoteRole,
  debitNoteExportFilename,
  debitNoteRecordToDraft,
  debitNoteRecordsToCsv,
  emptyDebitNote,
  formatDebitNoteDate,
  formatDebitNoteMoney,
  nextDebitNoteReference,
  normalizeDebitNoteAmount,
  normalizeDebitNoteDate,
  normalizeDebitNoteReminder,
  parseCsvRows,
  parseDebitNoteCsv,
  validateDebitNote,
  type DebitNoteRecord,
} from '../lib/debitNote.ts';
import { debitNotePdfFilename, fitDebitNoteA4 } from '../lib/debitNotePdf.ts';
import { buildFpsPayload } from '../lib/fps.ts';
import { buildXlsx } from '../lib/xlsx.ts';

let pass = 0;
function check(label: string, fn: () => void) {
  fn(); pass++; console.log(`  ✓ ${label}`);
}

check('角色白名單包括最高權限 SYSADMIN、DC、DDC_ADMIN、STAFF', () => {
  for (const role of ['DC', 'dc', 'SYSADMIN', ' sysadmin ', ' DDC_ADMIN ', 'STAFF']) assert.equal(canGenerateDebitNoteRole(role), true);
  for (const role of ['DDC_TRAINING', 'ADC_SCOUT', 'LEADER', '', null, undefined]) {
    assert.equal(canGenerateDebitNoteRole(role), false);
  }
});

check('日期支援 ISO、斜線及附件使用的點號格式', () => {
  assert.equal(normalizeDebitNoteDate('2026-10-19'), '2026-10-19');
  assert.equal(normalizeDebitNoteDate('19/10/2026'), '2026-10-19');
  assert.equal(normalizeDebitNoteDate('1.8.2018'), '2018-08-01');
  assert.equal(normalizeDebitNoteDate('5.6.25'), '2025-06-05');
  assert.equal(normalizeDebitNoteDate('31/2/2026'), '');
  assert.equal(normalizeDebitNoteDate('29/2/2024'), '2024-02-29');
  assert.equal(normalizeDebitNoteDate('29/2/2023'), '');
  assert.equal(formatDebitNoteDate('2026-10-09'), '9.10.2026');
});

check('金額支援千位逗號、HK$、小數及正數驗證', () => {
  assert.equal(normalizeDebitNoteAmount(' 4,950.00 '), '4950.00');
  assert.equal(normalizeDebitNoteAmount('HK$ 1,234.50'), '1234.50');
  assert.equal(formatDebitNoteMoney('4,950.00'), '4,950');
  assert.equal(formatDebitNoteMoney('100.50'), '100.50');
  for (const bad of ['', '0', '-1', 'abc', '1.234']) assert.equal(normalizeDebitNoteAmount(bad), '');
});

check('CSV parser 正確處理 BOM、CRLF、欄位內逗號及雙引號', () => {
  const rows = parseCsvRows('\uFEFFA,B,C\r\n1,"2,400.00","He said ""OK"""\r\n');
  assert.deepEqual(rows, [['A', 'B', 'C'], ['1', '2,400.00', 'He said "OK"']]);
  assert.throws(() => parseCsvRows('A,B\n1,"未關閉'), /未關閉/);
});

const SAMPLE_CSV = `\uFEFF,Ref,姓名字,Date,amount,PAR,S/S,Remarks\r
1,26-008,測試商店,27.9.2026," 1,200.00 ",區章 500 個,,\r
2,26-009,測試會長,19.10.2026," 4,950.00 ",Sponsorship of Fellowship Dinner,received,\r
3,26-010,資料未齊,," 4,950.00 ",Sponsorship,,\r
4,,,,,,,\r
`;

check('附件同款 CSV 帶入完整記錄，略過未填妥及空白列', () => {
  const result = parseDebitNoteCsv(SAMPLE_CSV);
  assert.equal(result.records.length, 2);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.records[1], {
    id: '26-009::3', to: '測試會長', attention: '', date: '2026-10-19', ref: '26-009',
    amount: '4950.00', particulars: 'Sponsorship of Fellowship Dinner', status: 'received', remarks: '', reminder: false, sourceRow: 3,
  });
  assert.throws(() => parseDebitNoteCsv('Ref,Date\n26-001,2026-01-01'), /缺少必要欄位/);
});

check('REMINDER 是可選持久欄；舊 CSV 預設無印，新 CSV 可保存 TRUE／FALSE', () => {
  assert.equal(normalizeDebitNoteReminder(true), true);
  assert.equal(normalizeDebitNoteReminder(' yes '), true);
  assert.equal(normalizeDebitNoteReminder('FALSE'), false);
  assert.equal(normalizeDebitNoteReminder(undefined), false);
  const result = parseDebitNoteCsv(`,Ref,姓名字,Date,amount,PAR,S/S,Remarks,REMINDER
1,26-011,有印,23.10.2026,100,活動費,,,TRUE
2,26-012,無印,23.10.2026,200,活動費,,,FALSE`);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].reminder, true);
  assert.equal(result.records[1].reminder, false);
});

check('下一 Ref No. 只接續所選日期的同年最大序號', () => {
  const records = parseDebitNoteCsv(SAMPLE_CSV).records;
  assert.equal(nextDebitNoteReference(records, '2026-10-23'), '26-010');
  assert.equal(nextDebitNoteReference(records, '2027-01-01'), '27-001');
  assert.equal(nextDebitNoteReference([{ ref: '26-999' }], '2026-01-01'), '26-1000');
});

check('必填驗證及 FPS payload 使用標準金額與 Ref No.', () => {
  const draft = { ...emptyDebitNote('2026-10-19'), to: '測試會長', ref: '26-009', amount: '4,950.00', particulars: 'Sponsorship' };
  assert.deepEqual(validateDebitNote(draft), {});
  const payload = buildFpsPayload('102866183', normalizeDebitNoteAmount(draft.amount), draft.ref);
  assert.ok(payload.includes('hk.com.hkicl'));
  assert.ok(payload.includes('102866183'));
  assert.ok(payload.includes('26-009'));
  assert.ok(/6304[0-9A-F]{4}$/.test(payload));
  assert.ok(validateDebitNote(emptyDebitNote('2026-10-19')).to);
  assert.equal(validateDebitNote({ ...draft, ref: '中文編號' }).ref, '參考編號請只用英文、數字、空格及常用符號。');
});

const EXPORT_RECORD: DebitNoteRecord = {
  id: 'dn-test-1', districtCode: 'SKW', ref: '26-009', to: '測試會長', attention: '陳先生',
  date: '2026-10-19', amount: '4950.00', particulars: 'Sponsorship, 包括 \"晚宴\"',
  status: 'Paid', remarks: '完整匯出測試', reminder: true, fpsAccountName: '測試區會戶口', fpsAccountNumber: '102866183',
  fpsQrPayload: '000201010212TEST6304ABCD', createdAt: '2026-10-19T01:00:00.000Z', createdBy: 'dc@example.com',
  updatedAt: '2026-10-20T02:00:00.000Z', updatedBy: 'staff@example.com',
};

check('完整 CSV 保留舊帳簿欄位、附加審計資料，並可再匯入', () => {
  const csv = debitNoteRecordsToCsv([EXPORT_RECORD]);
  assert.ok(csv.startsWith('\uFEFF"",\"Ref\",\"姓名字\",\"Date\",\"amount\",\"PAR\",\"S/S\",\"Remarks\"'));
  assert.ok(csv.includes('102866183'));
  assert.ok(csv.includes('FPS QR Payload'));
  assert.ok(csv.includes('\"REMINDER\"'));
  const roundTrip = parseDebitNoteCsv(csv);
  assert.equal(roundTrip.records.length, 1);
  assert.equal(roundTrip.records[0].attention, '陳先生');
  assert.equal(roundTrip.records[0].particulars, 'Sponsorship, 包括 \"晚宴\"');
  assert.equal(roundTrip.records[0].status, 'Paid');
  assert.equal(roundTrip.records[0].remarks, '完整匯出測試');
  assert.equal(roundTrip.records[0].reminder, true);
  assert.equal(debitNoteRecordsToCsv([{ ...EXPORT_RECORD, to: '=2+2' }]).includes('"\'=2+2"'), true, 'CSV 不可觸發 Excel 公式');
  assert.match(debitNoteExportFilename('xlsx', '2026-10-23'), /^DEBIT_NOTE_FULL_LEDGER_2026-10-23\.xlsx$/);
});

check('完整 Excel 產生標準 OOXML，記錄可分頁還原成表單草稿', () => {
  const xlsx = buildXlsx(buildDebitNoteSheets([EXPORT_RECORD]));
  assert.equal(Buffer.from(xlsx.subarray(0, 2)).toString(), 'PK');
  const xml = Buffer.from(xlsx).toString('utf8');
  assert.ok(xml.includes('DEBIT NOTES'));
  assert.ok(xml.includes('26-009'));
  assert.ok(xml.includes('staff@example.com'));
  assert.deepEqual(debitNoteRecordToDraft(EXPORT_RECORD), {
    to: '測試會長', attention: '陳先生', date: '2026-10-19', ref: '26-009', amount: '4950.00',
    particulars: 'Sponsorship, 包括 \"晚宴\"', status: 'Paid', remarks: '完整匯出測試', reminder: true,
  });
});

check('直接 PDF 使用 ASCII Ref 檔名，並等比例限制在單頁 A4 內', () => {
  assert.equal(debitNotePdfFilename('26/009'), 'DEBIT_NOTE_26_009.pdf');
  assert.equal(debitNotePdfFilename(''), 'DEBIT_NOTE_DRAFT.pdf');
  const normal = fitDebitNoteA4(794, 1080);
  assert.equal(normal.width, 210);
  assert.ok(normal.height <= 297);
  assert.equal(normal.x, 0);
  assert.equal(normal.y, 0);
  const tall = fitDebitNoteA4(1000, 2000);
  assert.equal(tall.height, 297);
  assert.equal(tall.width, 148.5);
  assert.equal(tall.x, 30.75);
  assert.throws(() => fitDebitNoteA4(0, 100), /尺寸無效/);
});

console.log(`\n全部通過（${pass} 項）✓`);
