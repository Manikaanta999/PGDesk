import Papa from 'papaparse';
import { formatDateDDMMYYYY, formatIndianPhone } from './format.ts';

export interface TenantCsvRow {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  propertyName: string;
  bedLabel: string;
  roomNumber: string;
  roomType?: string;
  status: 'ACTIVE' | 'NOTICE' | 'LEFT';
  monthlyRent: number;
  securityDeposit: number;
  joinDate: string;
  balanceDue: number;
  occupation: string;
  companyOrCollege: string;
}

const FORMULA_PREFIX_RE = /^(=|@|\t|\r|[+-][A-Za-z=(])/;

function sanitizeCsvValue(value: string | null | undefined): string {
  const str = (value ?? '').trim();
  if (!str) return '';
  return FORMULA_PREFIX_RE.test(str) ? `'${str}` : str;
}

export function formatTenantPaymentStatus(balanceDue: number): 'Paid' | 'Pending Dues' {
  return Number.isFinite(balanceDue) && balanceDue > 0 ? 'Pending Dues' : 'Paid';
}

export function formatRoomAssignment(
  roomNumber: string | null | undefined,
  roomType: string | null | undefined,
  bedLabel: string | null | undefined
): string {
  const room = (roomNumber || '').trim();
  const type = (roomType || '').trim();
  const bed = (bedLabel || '').trim();

  if (!room && (!bed || bed.toLowerCase() === 'unassigned')) {
    return 'Unassigned';
  }

  const roomPart = room ? `Room ${room}${type ? ` (${type})` : ''}` : '';
  const bedPart = bed && bed.toLowerCase() !== 'unassigned' ? `Bed ${bed}` : '';

  if (roomPart && bedPart) return `${roomPart} - ${bedPart}`;
  return roomPart || bedPart || 'Unassigned';
}

export function buildTenantsCsv(tenants: TenantCsvRow[]): string {
  const rows = tenants.map((t) => {
    const dueBalance = Number.isFinite(t.balanceDue) ? Math.max(0, Math.round(t.balanceDue)) : 0;
    const monthlyRent = Number.isFinite(t.monthlyRent) ? Math.max(0, Math.round(t.monthlyRent)) : 0;
    const securityDeposit = Number.isFinite(t.securityDeposit) ? Math.max(0, Math.round(t.securityDeposit)) : 0;
    const occupationText = t.companyOrCollege?.trim()
      ? `${t.occupation} (${t.companyOrCollege.trim()})`
      : t.occupation;

    return {
      'Resident Name': sanitizeCsvValue(t.name),
      Phone: sanitizeCsvValue(formatIndianPhone(t.phone)),
      Email: sanitizeCsvValue(t.email || ''),
      'Occupation / Organization': sanitizeCsvValue(occupationText),
      Property: sanitizeCsvValue(t.propertyName),
      'Room Assignment': sanitizeCsvValue(formatRoomAssignment(t.roomNumber, t.roomType, t.bedLabel)),
      'Room Number': sanitizeCsvValue(t.roomNumber || 'Unassigned'),
      Bed: sanitizeCsvValue(t.bedLabel || 'Unassigned'),
      'Tenant Status': t.status,
      'Payment Status': formatTenantPaymentStatus(dueBalance),
      'Due Balance (INR)': dueBalance,
      'Monthly Rent (INR)': monthlyRent,
      'Security Deposit (INR)': securityDeposit,
      'Join Date': formatDateDDMMYYYY(t.joinDate),
    };
  });

  const columns = [
    'Resident Name',
    'Phone',
    'Email',
    'Occupation / Organization',
    'Property',
    'Room Assignment',
    'Room Number',
    'Bed',
    'Tenant Status',
    'Payment Status',
    'Due Balance (INR)',
    'Monthly Rent (INR)',
    'Security Deposit (INR)',
    'Join Date',
  ];

  return Papa.unparse(
    {
      fields: columns,
      data: rows.map((row) => columns.map((col) => row[col as keyof typeof row])),
    },
    {
      header: true,
      newline: '\r\n',
    }
  );
}

export function getTenantsCsvFilename(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `pgdesk-tenants-${yyyy}-${mm}-${dd}.csv`;
}
