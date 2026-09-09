/**
 * 📄 迷你 XLSX 產生器 + 總會匯報 Excel 測試
 *   node --experimental-strip-types scripts/test-xlsx.ts
 *
 * · 純 node：解返個 ZIP central directory，核對檔案清單／大小／CRC32
 * · 有 python3：用 zipfile + XML parser 真正開一次檔，核對儲存格／合併格／欄寬
 */
import assert from 'node:assert';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildXlsx, colLetter, type XlsxSheet } from '../lib/xlsx.ts';
import { buildHqWorkbook, hqReportFilename, HQ_HEADERS } from '../lib/hqReport.ts';
import type { Visit } from '../lib/types.ts';

let pass = 0;
function check(label: string, fn: () => void) { fn(); pass++; console.log('  ✓ ' + label); }

console.log('XLSX 產生器／總會匯報 Excel 測試');

check('colLetter：1=A、26=Z、27=AA、8=H', () => {
  assert.strictEqual(colLetter(1), 'A');
  assert.strictEqual(colLetter(8), 'H');
  assert.strictEqual(colLetter(26), 'Z');
  assert.strictEqual(colLetter(27), 'AA');
  assert.strictEqual(colLetter(28), 'AB');
});

/** 純 node 解 ZIP：回傳 entry 清單（名、offset、size、crc），再核對 CRC */
function readZip(buf: Uint8Array): { name: string; size: number; crc: number }[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // 由尾掃 EOCD
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  assert.ok(eocd >= 0, '搵唔到 EOCD');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: { name: string; size: number; crc: number }[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    assert.strictEqual(dv.getUint32(p, true), 0x02014b50, 'central signature');
    const crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.slice(p + 46, p + 46 + nameLen));
    // 核對 local header 同資料 CRC
    assert.strictEqual(dv.getUint32(localOff, true), 0x04034b50, 'local signature ' + name);
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const data = buf.slice(dataStart, dataStart + size);
    // 重算 CRC32
    let c = 0xFFFFFFFF;
    for (let j = 0; j < data.length; j++) {
      let x = (c ^ data[j]) & 0xFF;
      for (let k = 0; k < 8; k++) x = (x & 1) ? (0xEDB88320 ^ (x >>> 1)) : (x >>> 1);
      c = (x ^ (c >>> 8)) >>> 0;
    }
    assert.strictEqual((c ^ 0xFFFFFFFF) >>> 0, crc, 'CRC32 唔夾: ' + name);
    out.push({ name, size, crc });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const basic: XlsxSheet = {
  name: '測試表',
  widths: [10, 20],
  merges: ['A2:B2'],
  rows: [
    { cells: ['標題', { v: 42, s: { bold: true } }], height: 20 },
    { cells: [{ v: '合併格', s: { align: 'center' } }] },
    { cells: ['<xml>&要escape</xml>', '多行\n文字'] },
    { cells: [null, ''] },
  ],
};

const zipBuf = buildXlsx([basic]);

check('ZIP 結構：6 個 part、CRC32 全部對', () => {
  const entries = readZip(zipBuf);
  const names = entries.map(e => e.name).sort();
  assert.deepStrictEqual(names, [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/workbook.xml',
    'xl/worksheets/sheet1.xml',
  ]);
  assert.ok(entries.every(e => e.size > 0));
});

check('XML：escape、inline string、數字格、合併格都有', () => {
  const entries = readZip(zipBuf);
  const dec = new TextDecoder();
  const sheetXml = dec.decode(zipBuf);
  void entries;
  // 直接由 buf 抽 sheet1.xml
  const dv = new DataView(zipBuf.buffer, zipBuf.byteOffset, zipBuf.byteLength);
  let eocd = -1;
  for (let i = zipBuf.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  let p = dv.getUint32(eocd + 16, true);
  let xml = '';
  for (let i = 0; i < 6; i++) {
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(zipBuf.slice(p + 46, p + 46 + nameLen));
    if (name === 'xl/worksheets/sheet1.xml') {
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const size = dv.getUint32(p + 24, true);
      xml = dec.decode(zipBuf.slice(localOff + 30 + lNameLen + lExtraLen, localOff + 30 + lNameLen + lExtraLen + size));
    }
    p += 46 + nameLen + extraLen;
  }
  assert.ok(xml.includes('&lt;xml&gt;&amp;要escape&lt;/xml&gt;'), 'escape');
  assert.ok(xml.includes('t="inlineStr"'), 'inline string');
  assert.ok(xml.includes('<v>42</v>'), '數字格');
  assert.ok(xml.includes('<mergeCell ref="A2:B2"/>'), '合併格');
  assert.ok(xml.includes('xml:space="preserve"'), '多行文字 preserve');
  assert.ok(xml.includes('width="20"'), '欄寬');
});

check('檔名：區職員探訪區內旅團匯報_2026年1月-3月.xlsx', () => {
  assert.strictEqual(hqReportFilename('2026-01-01', '2026-03-31'), '區職員探訪區內旅團匯報_2026年1月-3月.xlsx');
  assert.strictEqual(hqReportFilename('bad', 'worse'), '區職員探訪區內旅團匯報_bad_worse.xlsx');
});

// ── 總會匯報一鍵生成（跟官方表格：標題 → 區會／旅團總數 → 八欄） ──

const demoVisits: Visit[] = [
  { id: 'a', troop: '206', section: 'gh', visitDate: '2026-01-18', kind: 'general', leaderMet: '支部團長', method: '面談', officerCount: 1, support: '旅團發展方向' },
  { id: 'b', troop: '17', section: '', visitDate: '2026-02-08', kind: 'general', leaderMet: '旅長及支部領袖', method: '電話', officerCount: 4, support: '增長人數', followUp: 'Form Submission' },
  { id: 'c', troop: '1127', section: 'gh', visitDate: '2026-01-15', kind: 'general', leaderMet: '旅長', method: 'WhatsApp', support: 'Census' },
];

const hqBuf = buildHqWorkbook({
  visits: demoVisits, from: '2026-01-01', to: '2026-03-31',
  districtName: '筲箕灣區', unitsTotal: 31,
});
readZip(hqBuf);   // 結構 + CRC 全部過先算

check('總會匯報：8 個表頭同官方表格一字一樣', () => {
  assert.deepStrictEqual(HQ_HEADERS, [
    '旅號',
    '支部',
    '與旅領袖會面\n(如︰旅長、支部團長 / 副團長)',
    '探訪日期',
    '探訪方式\n(面談/透過電話/其他)',
    '區職員\n探訪人數',
    '區已經提供之支援之項目',
    '地域/總會\n需要跟進之項目',
  ]);
});

// ── python3 真正開檔驗證（有先跑） ──

let hasPython = false;
try { execFileSync('python3', ['--version'], { stdio: 'pipe' }); hasPython = true; } catch { /* 無就算 */ }

if (hasPython) {
  const dir = mkdtempSync(join(tmpdir(), 'xlsx-test-'));
  const file = join(dir, 'hq.xlsx');
  writeFileSync(file, hqBuf);
  const script = `
import sys, zipfile
from xml.dom import minidom
z = zipfile.ZipFile(sys.argv[1])
bad = z.testzip()
assert bad is None, '壞 entry: %s' % bad
names = z.namelist()
assert 'xl/workbook.xml' in names and 'xl/worksheets/sheet1.xml' in names, names
sheet = minidom.parseString(z.read('xl/worksheets/sheet1.xml'))
NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
def txt(ref):
    for c in sheet.getElementsByTagNameNS(NS, 'c'):
        if c.getAttribute('r') == ref:
            out = []
            for t in c.getElementsByTagNameNS(NS, 't'):
                out.append(''.join(n.data for n in t.childNodes if n.nodeType == n.TEXT_NODE))
            for v in c.getElementsByTagNameNS(NS, 'v'):
                out.append(''.join(n.data for n in v.childNodes if n.nodeType == n.TEXT_NODE))
            return ''.join(out)
    return None
assert txt('A2') == '香 港 童 軍 總 會', txt('A2')
assert txt('A3').startswith('區職員探訪區內旅團匯報'), txt('A3')
assert '2026年1月-3月' in txt('A3'), txt('A3')
assert txt('A4') == '區會' and txt('B4') == '筲箕灣區', (txt('A4'), txt('B4'))
assert txt('A5') == '旅團總數' and txt('B5') == '31', (txt('A5'), txt('B5'))
for i, want in enumerate(['旅號', '支部', '與旅領袖會面\\n(如︰旅長、支部團長 / 副團長)', '探訪日期',
                          '探訪方式\\n(面談/透過電話/其他)', '區職員\\n探訪人數',
                          '區已經提供之支援之項目', '地域/總會\\n需要跟進之項目']):
    col = chr(ord('A') + i)
    got = txt('%s6' % col)
    assert got == want, 'row6 %s: %r != %r' % (col, got, want)
# 資料行：17 最先（旅號排序），然後 206、1127
assert txt('A7') == '17' and txt('C7') == '旅長及支部領袖' and txt('D7') == '8.2.2026', (txt('A7'), txt('C7'), txt('D7'))
assert txt('F7') == '4' and txt('H7') == 'Form Submission'
assert txt('A8') == '206' and txt('D8') == '18.1.2026' and txt('F8') == '1'
assert txt('A9') == '1127' and txt('E9') == 'WhatsApp' and txt('H9') == 'NA'
merges = [m.getAttribute('ref') for m in sheet.getElementsByTagNameNS(NS, 'mergeCell')]
assert merges == ['A2:H2', 'A3:H3', 'B4:H4', 'B5:H5'], merges
print('python3 開檔驗證：OK（' + str(len(names)) + ' parts）')
`;
  check('python3 + zipfile + XML 真正開檔：標題／區會／總數／八欄表頭／資料行／合併格全部對', () => {
    const out = execFileSync('python3', ['-c', script, file], { encoding: 'utf8' });
    console.log('    → ' + out.trim());
  });
} else {
  console.log('  （冇 python3，跳過真正開檔驗證）');
}

console.log(`\n全部通過（${pass} 項）✓`);
