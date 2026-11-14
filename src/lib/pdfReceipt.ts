import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { calculateGstBreakdown } from './billing.ts';

export interface ReceiptPdfInput {
  organizationName: string;
  organizationAddress: string;
  organizationPhone: string;
  gstin?: string;
  gstRatePct?: number;
  upiId: string;
  propertyName: string;
  propertyAddress: string;
  invoiceNumber: string;
  periodLabel: string;
  issuedDate: string;
  dueDate: string;
  status: string;
  tenantName: string;
  tenantPhone: string;
  roomBedLabel: string;
  items: Array<{ label: string; amount: number }>;
  totalAmount: number;
  paidAmount: number;
  payments: Array<{ paidAt: string; method: string; reference: string; amount: number }>;
  verificationUrl?: string;
}

function formatRupeesAscii(val: number): string {
  const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(val));
  return `Rs. ${num}`;
}

export async function generateReceiptPdfBytes(data: ReceiptPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const dark = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.39, 0.45, 0.55);
  const accent = rgb(0.06, 0.46, 0.43);
  const lineCol = rgb(0.88, 0.9, 0.93);
  const bgLight = rgb(0.97, 0.98, 0.99);

  // Header band
  page.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: accent });
  page.drawText(data.organizationName.toUpperCase(), {
    x: 44,
    y: 802,
    size: 17,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(`${data.organizationAddress} | ${data.organizationPhone}`, {
    x: 44,
    y: 782,
    size: 9,
    font: fontRegular,
    color: rgb(0.86, 0.96, 0.95),
  });
  if (data.gstin && data.gstin.trim()) {
    page.drawText(`GSTIN: ${data.gstin.trim().toUpperCase()}`, {
      x: 44,
      y: 764,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
  }
  page.drawText(data.gstin ? 'TAX INVOICE & RENT RECEIPT' : 'RENT RECEIPT & INVOICE', {
    x: 372,
    y: 802,
    size: 11.5,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(`#${data.invoiceNumber}`, {
    x: 372,
    y: 780,
    size: 10.5,
    font: fontBold,
    color: rgb(0.86, 0.96, 0.95),
  });

  // Tenant & Property metadata block
  let y = 706;
  page.drawText('BILLED TO RESIDENT', { x: 44, y, size: 8.5, font: fontBold, color: muted });
  page.drawText('PROPERTY & BILLING PERIOD', { x: 320, y, size: 8.5, font: fontBold, color: muted });

  y -= 18;
  page.drawText(data.tenantName, { x: 44, y, size: 12, font: fontBold, color: dark });
  page.drawText(data.propertyName, { x: 320, y, size: 11.5, font: fontBold, color: dark });

  y -= 16;
  page.drawText(`Mobile: ${data.tenantPhone}`, { x: 44, y, size: 10, font: fontRegular, color: muted });
  page.drawText(`Period: ${data.periodLabel}`, { x: 320, y, size: 10, font: fontRegular, color: muted });

  y -= 15;
  page.drawText(`Room / Bed: ${data.roomBedLabel}`, { x: 44, y, size: 10, font: fontRegular, color: muted });
  page.drawText(`Due Date: ${data.dueDate} | Status: ${data.status}`, {
    x: 320,
    y,
    size: 10,
    font: fontBold,
    color: accent,
  });

  y -= 28;
  page.drawLine({ start: { x: 44, y }, end: { x: 551, y }, thickness: 1, color: lineCol });

  // Line items table header
  y -= 24;
  page.drawRectangle({ x: 44, y: y - 6, width: 507, height: 24, color: bgLight });
  page.drawText('DESCRIPTION', { x: 54, y: y + 2, size: 9, font: fontBold, color: muted });
  page.drawText('AMOUNT (INR)', { x: 455, y: y + 2, size: 9, font: fontBold, color: muted });

  y -= 24;
  for (const item of data.items) {
    page.drawText(item.label.slice(0, 62), { x: 54, y, size: 10.5, font: fontRegular, color: dark });
    page.drawText(formatRupeesAscii(item.amount), { x: 455, y, size: 10.5, font: fontBold, color: dark });
    y -= 20;
  }

  y -= 6;
  page.drawLine({ start: { x: 44, y }, end: { x: 551, y }, thickness: 1, color: lineCol });

  // GST / Totals
  const gstRate = Math.max(0, Number(data.gstRatePct || 0));
  const cgstItem = data.items.find((it) => it.label.startsWith('CGST'));
  const sgstItem = data.items.find((it) => it.label.startsWith('SGST'));
  const hasExplicitGstItems = Boolean(cgstItem || sgstItem);

  let grandTotal = data.totalAmount;
  if (hasExplicitGstItems) {
    const taxableSum = data.items
      .filter((it) => !it.label.startsWith('CGST') && !it.label.startsWith('SGST'))
      .reduce((s, it) => s + it.amount, 0);
    y -= 20;
    page.drawText('Taxable Subtotal', { x: 320, y, size: 10, font: fontRegular, color: muted });
    page.drawText(formatRupeesAscii(taxableSum), { x: 455, y, size: 10, font: fontRegular, color: dark });
    if (cgstItem) {
      y -= 16;
      page.drawText(cgstItem.label, { x: 320, y, size: 10, font: fontRegular, color: muted });
      page.drawText(formatRupeesAscii(cgstItem.amount), { x: 455, y, size: 10, font: fontRegular, color: dark });
    }
    if (sgstItem) {
      y -= 16;
      page.drawText(sgstItem.label, { x: 320, y, size: 10, font: fontRegular, color: muted });
      page.drawText(formatRupeesAscii(sgstItem.amount), { x: 455, y, size: 10, font: fontRegular, color: dark });
    }
  } else if (gstRate > 0) {
    const gst = calculateGstBreakdown(data.totalAmount, gstRate);
    y -= 20;
    page.drawText('Taxable Subtotal', { x: 320, y, size: 10, font: fontRegular, color: muted });
    page.drawText(formatRupeesAscii(gst.taxableValue), { x: 455, y, size: 10, font: fontRegular, color: dark });

    y -= 16;
    page.drawText(`CGST (${gst.cgstRatePct}%)`, { x: 320, y, size: 10, font: fontRegular, color: muted });
    page.drawText(formatRupeesAscii(gst.cgstAmount), { x: 455, y, size: 10, font: fontRegular, color: dark });

    y -= 16;
    page.drawText(`SGST (${gst.sgstRatePct}%)`, { x: 320, y, size: 10, font: fontRegular, color: muted });
    page.drawText(formatRupeesAscii(gst.sgstAmount), { x: 455, y, size: 10, font: fontRegular, color: dark });
    grandTotal = gst.totalWithGst;
  }

  y -= 22;
  page.drawText('Total Invoice Amount', { x: 320, y, size: 10.5, font: fontRegular, color: muted });
  page.drawText(formatRupeesAscii(grandTotal), { x: 455, y, size: 11, font: fontBold, color: dark });

  y -= 18;
  page.drawText('Total Paid', { x: 320, y, size: 10.5, font: fontRegular, color: muted });
  page.drawText(formatRupeesAscii(data.paidAmount), { x: 455, y, size: 11, font: fontBold, color: accent });

  const balance = Math.max(0, grandTotal - data.paidAmount);
  y -= 20;
  page.drawText('Balance Due', { x: 320, y, size: 11, font: fontBold, color: dark });
  page.drawText(formatRupeesAscii(balance), {
    x: 455,
    y,
    size: 12,
    font: fontBold,
    color: balance > 0 ? rgb(0.82, 0.16, 0.16) : accent,
  });

  // Payment history
  if (data.payments.length > 0) {
    y -= 34;
    page.drawText('RECORDED PAYMENTS', { x: 44, y, size: 9, font: fontBold, color: muted });
    y -= 18;
    for (const p of data.payments) {
      page.drawText(`${p.paidAt}  |  ${p.method}  |  Ref: ${p.reference || 'N/A'}`, {
        x: 44,
        y,
        size: 9.5,
        font: fontRegular,
        color: dark,
      });
      page.drawText(formatRupeesAscii(p.amount), { x: 455, y, size: 9.5, font: fontBold, color: dark });
      y -= 16;
    }
  }

  // Footer
  page.drawLine({ start: { x: 44, y: 98 }, end: { x: 551, y: 98 }, thickness: 1, color: lineCol });
  page.drawText(`UPI Payment ID: ${data.upiId}`, { x: 44, y: 78, size: 9.5, font: fontBold, color: dark });
  if (data.verificationUrl) {
    page.drawText(`Verify online: ${data.verificationUrl}`, {
      x: 44,
      y: 62,
      size: 8.5,
      font: fontRegular,
      color: accent,
    });
  }
  page.drawText(
    'This is a computer-generated receipt issued via PGDesk. No physical signature required.',
    { x: 44, y: 46, size: 8.5, font: fontRegular, color: muted }
  );

  return doc.save();
}
