/** DEBIT NOTE 單頁 A4 PDF：只在用戶按下載時動態載入 PDF 套件。 */

export interface DebitNoteA4Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function debitNotePdfFilename(reference: string): string {
  const safe = String(reference || '').trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return `DEBIT_NOTE_${safe || 'DRAFT'}.pdf`;
}

/** 將預覽等比例放入 210 × 297 mm；永遠只產生一頁，不裁切文件。 */
export function fitDebitNoteA4(pixelWidth: number, pixelHeight: number): DebitNoteA4Placement {
  if (!(pixelWidth > 0) || !(pixelHeight > 0)) throw new Error('DEBIT NOTE 預覽尺寸無效，未能生成 PDF。');
  const pageWidth = 210;
  const pageHeight = 297;
  let width = pageWidth;
  let height = pixelHeight * pageWidth / pixelWidth;
  if (height > pageHeight) {
    height = pageHeight;
    width = pixelWidth * pageHeight / pixelHeight;
  }
  return { x: (pageWidth - width) / 2, y: 0, width, height };
}

async function waitForImages(element: HTMLElement): Promise<void> {
  await Promise.all(Array.from(element.querySelectorAll('img')).map(image => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('DEBIT NOTE 信頭圖片載入逾時。')), 15000);
      image.addEventListener('load', () => { window.clearTimeout(timer); resolve(); }, { once: true });
      image.addEventListener('error', () => { window.clearTimeout(timer); reject(new Error('DEBIT NOTE 信頭圖片未能載入。')); }, { once: true });
    });
  }));
}

export async function downloadDebitNotePdf(element: HTMLElement, reference: string): Promise<void> {
  await waitForImages(element);
  if (document.fonts?.ready) await document.fonts.ready;
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    imageTimeout: 15000,
    onclone: (_document, clonedElement) => {
      // 預覽外框及陰影不屬於正式文件；PDF 只保留白底 A4 內容。
      clonedElement.style.border = 'none';
      clonedElement.style.boxShadow = 'none';
      clonedElement.style.margin = '0';
    },
  });
  const placement = fitDebitNoteA4(canvas.width, canvas.height);
  const filename = debitNotePdfFilename(reference);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: filename.replace(/\.pdf$/i, ''), subject: 'DEBIT NOTE', creator: 'Scout District Portal' });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', placement.x, placement.y, placement.width, placement.height, undefined, 'FAST');
  pdf.save(filename);
}
