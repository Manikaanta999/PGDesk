export function formatINR(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(safe);
}

export function formatIndianNumber(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  return new Intl.NumberFormat('en-IN').format(safe);
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDateIN(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—';
  let d: Date;
  if (typeof dateStr === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]) - 1;
      const day = Number(m[3]);
      return `${String(day).padStart(2, '0')} ${MONTHS_SHORT[month]} ${year}`;
    }
    d = new Date(dateStr);
  } else {
    d = dateStr;
  }
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export function formatDateDDMMYYYY(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return formatDateIN(dateStr);
}

export function formatMonthYear(month: number, year: number): string {
  const idx = Math.max(0, Math.min(11, month - 1));
  return `${MONTHS_SHORT[idx]} ${year}`;
}

export function formatIndianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

export function buildWhatsAppReminderUrl(params: {
  phone: string;
  tenantName: string;
  propertyName: string;
  invoiceNumber: string;
  periodLabel: string;
  balanceDue: number;
  dueDate: string;
  upiId?: string;
}): string {
  const digits = params.phone.replace(/\D/g, '');
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  const upiLine = params.upiId ? `\nUPI ID: ${params.upiId}` : '';
  const text =
    `Namaste ${params.tenantName},\n` +
    `Friendly rent reminder from ${params.propertyName}.\n` +
    `Invoice: ${params.invoiceNumber} (${params.periodLabel})\n` +
    `Balance Due: ${formatINR(params.balanceDue)}\n` +
    `Due Date: ${formatDateIN(params.dueDate)}${upiLine}\n` +
    `Please share the UTR reference once paid. Thank you!`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}
