'use client';

import { QRCodeCanvas } from 'qrcode.react';
import type { DebitNoteDraft } from '@/lib/debitNote';
import { formatDebitNoteDate, formatDebitNoteMoney } from '@/lib/debitNote';

interface DebitNoteViewProps {
  draft: DebitNoteDraft;
  fpsId: string;
  fpsPayload: string;
  demo?: boolean;
}

/** 按用戶提供的區會 DEBIT NOTE 範本排版；列印時只保留呢張 A4 文件。 */
export default function DebitNoteView({ draft, fpsId, fpsPayload, demo = false }: DebitNoteViewProps) {
  const date = formatDebitNoteDate(draft.date) || '—';
  const money = formatDebitNoteMoney(draft.amount);
  const displayMoney = money || '________';
  const ref = draft.ref.trim() || '—';

  return (
    <article className="debit-note-paper" aria-label={`DEBIT NOTE ${ref} 預覽`}>
      {/* 信頭由用戶提供的原始範本擷取，保留區會中英文名、徽章及藍色波浪。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="debit-note-letterhead" src="/images/debit-note-letterhead.png" alt="香港童軍總會筲箕灣區 Scout Association of Hong Kong Shau Kei Wan District" />

      <div className="debit-note-heading">
        <h2 className="debit-note-title">DEBIT NOTE</h2>
        {draft.reminder && <span className="debit-note-reminder-stamp">REMINDER</span>}
      </div>

      <div className="debit-note-meta">
        <div className="debit-note-meta-row">
          <span className="debit-note-label">TO</span><span className="debit-note-colon">:</span>
          <span className="debit-note-value debit-note-to">{draft.to.trim() || '—'}</span>
          <span className="debit-note-label">Date</span><span className="debit-note-colon">:</span>
          <span className="debit-note-value">{date}</span>
        </div>
        <div className="debit-note-meta-row">
          <span className="debit-note-label">Attention</span><span className="debit-note-colon">:</span>
          <span className="debit-note-value debit-note-to">{draft.attention.trim()}</span>
          <span className="debit-note-label">Ref No.</span><span className="debit-note-colon">:</span>
          <span className="debit-note-value">{ref}</span>
        </div>
      </div>

      <p className="debit-note-intro">
        Please note that your account has been debited the sum of HK$
        <span className="debit-note-intro-amount">{displayMoney}</span>
        according to the following details:-
      </p>

      <table className="debit-note-table">
        <colgroup>
          <col className="debit-note-col-date" />
          <col className="debit-note-col-particulars" />
          <col className="debit-note-col-qty" />
          <col className="debit-note-col-unit" />
          <col className="debit-note-col-amount" />
        </colgroup>
        <thead>
          <tr>
            <th>DATE</th>
            <th>PARTICULARS</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>AMOUNT (HK$)</th>
          </tr>
        </thead>
        <tbody>
          <tr className="debit-note-detail-row">
            <td>{date}</td>
            <td className="debit-note-particulars">{draft.particulars.trim() || '—'}</td>
            <td />
            <td />
            <td className="debit-note-money">{money ? `$${money}` : '—'}</td>
          </tr>
          <tr className="debit-note-payment-row">
            <td colSpan={5}>
              <div className="debit-note-payment-copy">
                <div>Cheque payable to</div>
                <div>“Scout Association of HK – Shau Kei Wan District”</div>
                <div>Or depositing directly at</div>
                <div>Bank of Communications (Account Number 382-541-01049964)</div>
                <div>Or via FPS (FPS ID： <span className="debit-note-fps-id">{fpsId || '—'}</span>)</div>
              </div>
              <div className="debit-note-qr-wrap">
                {fpsPayload ? (
                  <>
                    <QRCodeCanvas
                      value={fpsPayload}
                      size={512}
                      level="M"
                      marginSize={2}
                      fgColor="#000000"
                      bgColor="#ffffff"
                      className="debit-note-qr"
                      aria-label={demo ? '示範用 QR Code，不能付款' : `FPS 付款 QR Code，Ref ${ref}`}
                    />
                    {demo && <small>示範 QR · 不能付款</small>}
                  </>
                ) : (
                  <div className="debit-note-qr-placeholder">填妥資料後<br />顯示 FPS QR</div>
                )}
              </div>
            </td>
          </tr>
          <tr className="debit-note-total-row">
            <td colSpan={4}>TOTAL:</td>
            <td className="debit-note-money">{money ? `$${money}` : '—'}</td>
          </tr>
        </tbody>
      </table>

      <footer className="debit-note-signatures">
        <div><span>Prepared by:</span><i /></div>
        <div><span>Certified by:</span><i /></div>
      </footer>
    </article>
  );
}
