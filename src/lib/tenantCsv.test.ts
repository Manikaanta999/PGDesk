import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import {
  buildTenantsCsv,
  formatRoomAssignment,
  formatTenantPaymentStatus,
  getTenantsCsvFilename,
  type TenantCsvRow,
} from './tenantCsv.ts';

test('formatTenantPaymentStatus classifies Paid vs Pending Dues accurately', () => {
  assert.equal(formatTenantPaymentStatus(0), 'Paid');
  assert.equal(formatTenantPaymentStatus(-100), 'Paid');
  assert.equal(formatTenantPaymentStatus(1), 'Pending Dues');
  assert.equal(formatTenantPaymentStatus(12500), 'Pending Dues');
});

test('formatRoomAssignment handles assigned rooms, room types, and unassigned beds', () => {
  assert.equal(formatRoomAssignment('101', 'DOUBLE', '101-A'), 'Room 101 (DOUBLE) - Bed 101-A');
  assert.equal(formatRoomAssignment('204', '', '204-B'), 'Room 204 - Bed 204-B');
  assert.equal(formatRoomAssignment('', '', 'Unassigned'), 'Unassigned');
  assert.equal(formatRoomAssignment('', '', ''), 'Unassigned');
});

test('buildTenantsCsv generates valid RFC-4180 CSV with room assignment and payment status via papaparse', () => {
  const sampleTenants: TenantCsvRow[] = [
    {
      id: 1,
      name: 'Aarav Sharma, Jr.',
      phone: '9845011223',
      email: 'aarav@example.in',
      propertyName: 'Koramangala Prime PG',
      bedLabel: '101-A',
      roomNumber: '101',
      roomType: 'DOUBLE',
      status: 'ACTIVE',
      monthlyRent: 12500,
      securityDeposit: 25000,
      joinDate: '2026-08-05',
      balanceDue: 4500,
      occupation: 'Software Engineer',
      companyOrCollege: 'Infosys, Bengaluru',
    },
    {
      id: 2,
      name: 'Priya Nair',
      phone: '+919900112233',
      email: null,
      propertyName: 'Indiranagar Haven',
      bedLabel: 'Unassigned',
      roomNumber: '',
      roomType: '',
      status: 'NOTICE',
      monthlyRent: 15000,
      securityDeposit: 30000,
      joinDate: '2026-09-12',
      balanceDue: 0,
      occupation: 'Student',
      companyOrCollege: '',
    },
  ];

  const csv = buildTenantsCsv(sampleTenants);
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.data.length, 2);

  assert.equal(parsed.data[0]['Resident Name'], 'Aarav Sharma, Jr.');
  assert.equal(parsed.data[0]['Phone'], '+91 98450 11223');
  assert.equal(parsed.data[0]['Property'], 'Koramangala Prime PG');
  assert.equal(parsed.data[0]['Room Assignment'], 'Room 101 (DOUBLE) - Bed 101-A');
  assert.equal(parsed.data[0]['Room Number'], '101');
  assert.equal(parsed.data[0]['Bed'], '101-A');
  assert.equal(parsed.data[0]['Tenant Status'], 'ACTIVE');
  assert.equal(parsed.data[0]['Payment Status'], 'Pending Dues');
  assert.equal(parsed.data[0]['Due Balance (INR)'], '4500');
  assert.equal(parsed.data[0]['Monthly Rent (INR)'], '12500');
  assert.equal(parsed.data[0]['Join Date'], '05/08/2026');

  assert.equal(parsed.data[1]['Resident Name'], 'Priya Nair');
  assert.equal(parsed.data[1]['Room Assignment'], 'Unassigned');
  assert.equal(parsed.data[1]['Payment Status'], 'Paid');
  assert.equal(parsed.data[1]['Due Balance (INR)'], '0');
  assert.equal(parsed.data[1]['Join Date'], '12/09/2026');
});

test('buildTenantsCsv neutralizes formula injection and handles empty lists cleanly', () => {
  const emptyCsv = buildTenantsCsv([]);
  const emptyParsed = Papa.parse<Record<string, string>>(emptyCsv, { header: true, skipEmptyLines: true });
  assert.equal(emptyParsed.errors.length, 0);
  assert.equal(emptyParsed.data.length, 0);
  assert.ok(emptyCsv.includes('Resident Name'));
  assert.ok(emptyCsv.includes('Room Assignment'));
  assert.ok(emptyCsv.includes('Payment Status'));

  const maliciousCsv = buildTenantsCsv([
    {
      id: 9,
      name: '=CMD("calc")',
      phone: '9876543210',
      email: '@evil',
      propertyName: 'Test PG',
      bedLabel: '201-A',
      roomNumber: '201',
      status: 'ACTIVE',
      monthlyRent: 10000,
      securityDeposit: 20000,
      joinDate: '2026-10-01',
      balanceDue: 0,
      occupation: 'Analyst',
      companyOrCollege: '+SUM(1,2)',
    },
  ]);

  const parsed = Papa.parse<Record<string, string>>(maliciousCsv, { header: true, skipEmptyLines: true });
  assert.equal(parsed.data[0]['Resident Name'], "'=CMD(\"calc\")");
  assert.equal(parsed.data[0]['Email'], "'@evil");
  assert.equal(parsed.data[0]['Occupation / Organization'], 'Analyst (+SUM(1,2))');
});

test('getTenantsCsvFilename formats YYYY-MM-DD cleanly', () => {
  assert.equal(getTenantsCsvFilename(new Date(2026, 10, 14)), 'pgdesk-tenants-2026-11-14.csv');
});
