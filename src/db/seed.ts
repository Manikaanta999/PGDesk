import { count, eq } from 'drizzle-orm';
import { db, schema } from './index.ts';
import { hashPassword, isDemoModeEnabled } from '../lib/security.ts';

const PHOTO_HERO = '/src/assets/images/hero_pg_coliving_1794584162558.jpg';
const PHOTO_SINGLE = '/src/assets/images/pg_single_room_1794584163204.jpg';
const PHOTO_TWIN = '/src/assets/images/pg_twin_room_1794584163926.jpg';
const PHOTO_DINING = '/src/assets/images/pg_common_dining_1794584165816.jpg';

const INDIAN_TENANT_NAMES = [
  { name: 'Aarav Kulkarni', phone: '9900123456', email: 'aarav.k@pgdesk.in', occ: 'Backend Engineer', org: 'Razorpay', city: 'Pune, Maharashtra' },
  { name: 'Rohan Deshmukh', phone: '9880112233', email: 'rohan.d@example.in', occ: 'Product Analyst', org: 'Swiggy', city: 'Nagpur, Maharashtra' },
  { name: 'Karthik Subramanian', phone: '9844022334', email: 'karthik.s@example.in', occ: 'QA Automation Lead', org: 'Freshworks', city: 'Chennai, Tamil Nadu' },
  { name: 'Siddharth Verma', phone: '9740033445', email: 'siddharth.v@example.in', occ: 'Data Scientist', org: 'Flipkart', city: 'Lucknow, UP' },
  { name: 'Pranav Joshi', phone: '9611044556', email: 'pranav.j@example.in', occ: 'CA Article', org: 'Deloitte India', city: 'Nashik, Maharashtra' },
  { name: 'Aditya Nair', phone: '9535055667', email: 'aditya.n@example.in', occ: 'Cloud Engineer', org: 'Infosys', city: 'Kochi, Kerala' },
  { name: 'Harshvardhan Reddy', phone: '9945066778', email: 'harsh.r@example.in', occ: 'M.Tech Student', org: 'IIIT Bangalore', city: 'Hyderabad, Telangana' },
  { name: 'Vikramaditya Rao', phone: '9980077889', email: 'vikram.r@example.in', occ: 'Frontend Developer', org: 'CRED', city: 'Vijayawada, AP' },
  { name: 'Nikhil Bansal', phone: '9739088990', email: 'nikhil.b@example.in', occ: 'UI/UX Designer', org: 'Meesho', city: 'Jaipur, Rajasthan' },
  { name: 'Manish Tiwari', phone: '9663099001', email: 'manish.t@example.in', occ: 'DevOps Engineer', org: 'Zoho', city: 'Bhopal, MP' },
  { name: 'Arjun Menon', phone: '9591011220', email: 'arjun.m@example.in', occ: 'Sales Executive', org: 'Zomato', city: 'Thrissur, Kerala' },
  { name: 'Devansh Mehta', phone: '9448022331', email: 'devansh.m@example.in', occ: 'MBA Student', org: 'IIM Bangalore', city: 'Ahmedabad, Gujarat' },
  { name: 'Shubham Agarwal', phone: '9341033442', email: 'shubham.a@example.in', occ: 'Java Developer', org: 'TCS', city: 'Kolkata, WB' },
  { name: 'Yashwant Gowda', phone: '9243044553', email: 'yashwant.g@example.in', occ: 'Financial Analyst', org: 'PhonePe', city: 'Mysuru, Karnataka' },
  { name: 'Tarun Malhotra', phone: '9108055664', email: 'tarun.m@example.in', occ: 'Growth Manager', org: 'Groww', city: 'Chandigarh' },
  { name: 'Kunal Chatterjee', phone: '9008066775', email: 'kunal.c@example.in', occ: 'Systems Engineer', org: 'Wipro', city: 'Durgapur, WB' },
  { name: 'Rishabh Kapoor', phone: '8971077886', email: 'rishabh.k@example.in', occ: 'ML Engineer', org: 'Ola Electric', city: 'New Delhi' },
  { name: 'Saurabh Pandey', phone: '8861088997', email: 'saurabh.p@example.in', occ: 'Support Specialist', org: 'Atlassian', city: 'Varanasi, UP' },
  // Girls residence tenants (18..29)
  { name: 'Ananya Iyer', phone: '9845111222', email: 'ananya.i@example.in', occ: 'Product Designer', org: 'Postman', city: 'Coimbatore, TN' },
  { name: 'Priya Krishnan', phone: '9845222333', email: 'priya.k@example.in', occ: 'Software Engineer', org: 'Microsoft', city: 'Madurai, TN' },
  { name: 'Sneha Kulkarni', phone: '9845333444', email: 'sneha.k@example.in', occ: 'Business Analyst', org: 'Accenture', city: 'Belagavi, Karnataka' },
  { name: 'Meera Nair', phone: '9845444555', email: 'meera.n@example.in', occ: 'Data Engineer', org: 'Target India', city: 'Trivandrum, Kerala' },
  { name: 'Ishita Sengupta', phone: '9845555666', email: 'ishita.s@example.in', occ: 'Content Strategist', org: 'Zeta', city: 'Kolkata, WB' },
  { name: 'Kavya Sharma', phone: '9845666777', email: 'kavya.s@example.in', occ: 'B.Des Student', org: 'NIFT Bengaluru', city: 'Indore, MP' },
  { name: 'Divya Hegde', phone: '9845777888', email: 'divya.h@example.in', occ: 'Consultant', org: 'EY India', city: 'Mangaluru, Karnataka' },
  { name: 'Rhea Dsouza', phone: '9845888999', email: 'rhea.d@example.in', occ: 'HR Specialist', org: 'Airtel', city: 'Goa' },
  { name: 'TanviPatel', phone: '9845999000', email: 'tanvi.p@example.in', occ: 'Architect', org: 'Total Environment', city: 'Surat, Gujarat' },
  { name: 'Nandini Rao', phone: '9886011223', email: 'nandini.r@example.in', occ: 'Full-Stack Dev', org: 'Juspay', city: 'Udupi, Karnataka' },
  { name: 'Pooja Bhat', phone: '9886122334', email: 'pooja.b@example.in', occ: 'Research Fellow', org: 'IISc Bengaluru', city: 'Hubballi, Karnataka' },
  { name: 'Aishwarya Menon', phone: '9886233445', email: 'aishwarya.m@example.in', occ: 'Marketing Lead', org: 'Nykaa', city: 'Calicut, Kerala' },
];

let seedPromise: Promise<void> | null = null;
let loggedSkipOnce = false;

export async function ensureSeeded(): Promise<void> {
  if (!isDemoModeEnabled()) {
    if (!loggedSkipOnce) {
      loggedSkipOnce = true;
      console.log('ENABLE_DEMO_MODE is disabled; skipping automatic demo data seeding.');
    }
    return;
  }
  if (!seedPromise) {
    seedPromise = runSeedIfEmpty().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function runSeedIfEmpty(): Promise<void> {
  const existingOrgs = await db.select({ total: count() }).from(schema.organizations);
  if ((existingOrgs[0]?.total ?? 0) > 0) {
    return;
  }

  console.log('Seeding PGDesk Cloud SQL database with realistic Indian PG demo data...');

  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: 'Sharma Residency Group',
      slug: 'sharma-residency',
      brandColor: '#0F766E',
      upiId: 'sharmaresidences@okicici',
      upiPayeeName: 'Sharma Residency Group',
      billingDayDefault: 1,
      dueDaysAfterInvoice: 5,
      lateFeePerDay: 100,
      graceDays: 3,
      noticePeriodDays: 30,
      phone: '+91 98450 11223',
      email: 'ops@sharmaresidency.in',
      address: '80 Feet Road, Koramangala 4th Block, Bengaluru 560034',
    })
    .returning();

  const demoPasswordHash = hashPassword('demo1234');

  const [ownerUser] = await db
    .insert(schema.users)
    .values({
      organizationId: org.id,
      name: 'Rajesh Sharma',
      email: 'owner@pgdesk.in',
      phone: '9845011223',
      passwordHash: demoPasswordHash,
      role: 'OWNER',
      assignedPropertyIds: [],
      isActive: true,
    })
    .returning();

  const [prop1] = await db
    .insert(schema.properties)
    .values({
      organizationId: org.id,
      name: 'Koramangala Executive Boys PG',
      slug: 'koramangala-executive-boys-pg',
      address: '42, 1st Main Road, Koramangala 4th Block',
      locality: 'Koramangala',
      city: 'Bengaluru',
      genderType: 'BOYS',
      amenities: [
        'High-Speed 300 Mbps Wi-Fi',
        '3-Time Home-Style Meals',
        'Daily Room Housekeeping',
        'Washing Machine & Dryer',
        '24/7 Power Backup',
        'Biometric & CCTV Security',
        'Two-Wheeler Covered Parking',
      ],
      photos: [PHOTO_HERO, PHOTO_TWIN, PHOTO_SINGLE, PHOTO_DINING],
      rules: [
        '30-day prior notice required before move-out for full deposit refund.',
        'Rent due by the 5th of every month; Rs 100/day late fee after 3-day grace.',
        'Visitors permitted in common lounge between 9:00 AM and 8:00 PM.',
        'Quiet hours observed from 11:00 PM to 6:00 AM.',
      ],
      contactName: 'Vikram Nair',
      contactPhone: '9845044556',
      description:
        'Professionally managed executive boys PG located 400m from Sony World Signal. Walkable to Koramangala tech parks, co-working hubs, and metro feeder buses.',
      isPublic: true,
      billingMode: 'FIXED_1ST',
      billingDay: 1,
    })
    .returning();

  const [prop2] = await db
    .insert(schema.properties)
    .values({
      organizationId: org.id,
      name: 'Indiranagar Studio Girls Residence',
      slug: 'indiranagar-studio-girls-pg',
      address: '118, 12th Main Road, HAL 2nd Stage, Indiranagar',
      locality: 'Indiranagar',
      city: 'Bengaluru',
      genderType: 'GIRLS',
      amenities: [
        'High-Speed Dual-Band Wi-Fi',
        'Nutritious Breakfast & Dinner',
        'Attached Washrooms & Geyser',
        '24/7 Female Warden & CCTV',
        'Study Lounge & Coworking Desk',
        'RO Drinking Water on Every Floor',
      ],
      photos: [PHOTO_SINGLE, PHOTO_HERO, PHOTO_DINING, PHOTO_TWIN],
      rules: [
        'Biometric entry logged for resident safety; overnight guests not permitted.',
        'Monthly rent cycle follows individual join date.',
        '30-day notice via PGDesk Tenant Portal prior to vacating.',
      ],
      contactName: 'Lakshmi Menon',
      contactPhone: '9845077889',
      description:
        'Sunlit, secure residence for working women and design students, 5 minutes from Indiranagar Metro Station and 100 Feet Road.',
      isPublic: true,
      billingMode: 'JOIN_DATE',
      billingDay: 1,
    })
    .returning();

  const [managerUser] = await db
    .insert(schema.users)
    .values({
      organizationId: org.id,
      name: 'Vikram Nair',
      email: 'manager@pgdesk.in',
      phone: '9845044556',
      passwordHash: demoPasswordHash,
      role: 'MANAGER',
      assignedPropertyIds: [prop1.id, prop2.id],
      isActive: true,
    })
    .returning();

  const [tenantPortalUser] = await db
    .insert(schema.users)
    .values({
      organizationId: org.id,
      name: 'Aarav Kulkarni',
      email: 'aarav.k@pgdesk.in',
      phone: '9900123456',
      passwordHash: demoPasswordHash,
      role: 'TENANT',
      assignedPropertyIds: [prop1.id],
      isActive: true,
    })
    .returning();

  // Create Floors, Rooms & Beds for Property 1 (24 beds)
  const p1FloorDefs = [
    {
      name: '1st Floor',
      num: 1,
      rooms: [
        { number: '101', type: 'SINGLE' as const, ac: true, rent: 16500, beds: ['101-A'] },
        { number: '102', type: 'DOUBLE' as const, ac: true, rent: 12500, beds: ['102-A', '102-B'] },
        { number: '103', type: 'DOUBLE' as const, ac: false, rent: 10500, beds: ['103-A', '103-B'] },
        { number: '104', type: 'TRIPLE' as const, ac: false, rent: 9000, beds: ['104-A', '104-B', '104-C'] },
      ],
    },
    {
      name: '2nd Floor',
      num: 2,
      rooms: [
        { number: '201', type: 'SINGLE' as const, ac: true, rent: 17000, beds: ['201-A'] },
        { number: '202', type: 'DOUBLE' as const, ac: true, rent: 12500, beds: ['202-A', '202-B'] },
        { number: '203', type: 'DOUBLE' as const, ac: true, rent: 12500, beds: ['203-A', '203-B'] },
        { number: '204', type: 'TRIPLE' as const, ac: false, rent: 9000, beds: ['204-A', '204-B', '204-C'] },
      ],
    },
    {
      name: '3rd Floor',
      num: 3,
      rooms: [
        { number: '301', type: 'DOUBLE' as const, ac: true, rent: 13000, beds: ['301-A', '301-B'] },
        { number: '302', type: 'TRIPLE' as const, ac: true, rent: 10000, beds: ['302-A', '302-B', '302-C'] },
        { number: '303', type: 'TRIPLE' as const, ac: false, rent: 8800, beds: ['303-A', '303-B', '303-C'] },
      ],
    },
  ];

  const p2FloorDefs = [
    {
      name: '1st Floor',
      num: 1,
      rooms: [
        { number: '101', type: 'SINGLE' as const, ac: true, rent: 18500, beds: ['101-A'] },
        { number: '102', type: 'DOUBLE' as const, ac: true, rent: 14000, beds: ['102-A', '102-B'] },
        { number: '103', type: 'DOUBLE' as const, ac: true, rent: 14000, beds: ['103-A', '103-B'] },
        { number: '104', type: 'TRIPLE' as const, ac: false, rent: 10500, beds: ['104-A', '104-B', '104-C'] },
      ],
    },
    {
      name: '2nd Floor',
      num: 2,
      rooms: [
        { number: '201', type: 'SINGLE' as const, ac: true, rent: 18500, beds: ['201-A'] },
        { number: '202', type: 'DOUBLE' as const, ac: true, rent: 14000, beds: ['202-A', '202-B'] },
        { number: '203', type: 'DOUBLE' as const, ac: false, rent: 12000, beds: ['203-A', '203-B'] },
        { number: '204', type: 'TRIPLE' as const, ac: true, rent: 11200, beds: ['204-A', '204-B', '204-C'] },
        { number: '205', type: 'DOUBLE' as const, ac: true, rent: 14000, beds: ['205-A', '205-B'] },
      ],
    },
  ];

  const p1Beds: Array<{ id: number; propertyId: number; rent: number; label: string }> = [];
  const p2Beds: Array<{ id: number; propertyId: number; rent: number; label: string }> = [];

  for (const fDef of p1FloorDefs) {
    const [floor] = await db
      .insert(schema.floors)
      .values({ organizationId: org.id, propertyId: prop1.id, name: fDef.name, floorNumber: fDef.num })
      .returning();
    for (const rDef of fDef.rooms) {
      const [room] = await db
        .insert(schema.rooms)
        .values({
          organizationId: org.id,
          propertyId: prop1.id,
          floorId: floor.id,
          roomNumber: rDef.number,
          roomType: rDef.type,
          isAc: rDef.ac,
          attachedBath: true,
          rentPerBed: rDef.rent,
        })
        .returning();
      for (const bLabel of rDef.beds) {
        const [bed] = await db
          .insert(schema.beds)
          .values({
            organizationId: org.id,
            propertyId: prop1.id,
            floorId: floor.id,
            roomId: room.id,
            bedLabel: bLabel,
            status: 'VACANT',
          })
          .returning();
        p1Beds.push({ id: bed.id, propertyId: prop1.id, rent: rDef.rent, label: bLabel });
      }
    }
  }

  for (const fDef of p2FloorDefs) {
    const [floor] = await db
      .insert(schema.floors)
      .values({ organizationId: org.id, propertyId: prop2.id, name: fDef.name, floorNumber: fDef.num })
      .returning();
    for (const rDef of fDef.rooms) {
      const [room] = await db
        .insert(schema.rooms)
        .values({
          organizationId: org.id,
          propertyId: prop2.id,
          floorId: floor.id,
          roomNumber: rDef.number,
          roomType: rDef.type,
          isAc: rDef.ac,
          attachedBath: true,
          rentPerBed: rDef.rent,
        })
        .returning();
      for (const bLabel of rDef.beds) {
        const [bed] = await db
          .insert(schema.beds)
          .values({
            organizationId: org.id,
            propertyId: prop2.id,
            floorId: floor.id,
            roomId: room.id,
            bedLabel: bLabel,
            status: 'VACANT',
          })
          .returning();
        p2Beds.push({ id: bed.id, propertyId: prop2.id, rent: rDef.rent, label: bLabel });
      }
    }
  }

  // Reserve 2 beds & put 1 bed in maintenance
  await db
    .update(schema.beds)
    .set({ status: 'RESERVED', notes: 'Booked by Rahul N. (moving in next week)' })
    .where(eq(schema.beds.id, p1Beds[20].id));
  await db
    .update(schema.beds)
    .set({ status: 'MAINTENANCE', notes: 'AC stabilizer & painting scheduled' })
    .where(eq(schema.beds.id, p1Beds[21].id));
  await db
    .update(schema.beds)
    .set({ status: 'RESERVED', notes: 'Booked for 1st of next month' })
    .where(eq(schema.beds.id, p2Beds[15].id));

  // Assign 18 tenants in Property 1 + 12 tenants in Property 2 = 30 tenants
  const createdTenants: Array<{ id: number; propertyId: number; name: string; rent: number; joinDate: string }> = [];

  for (let i = 0; i < 18; i++) {
    const tInfo = INDIAN_TENANT_NAMES[i];
    const bed = p1Beds[i];
    const isNotice = i === 4 || i === 11;
    const joinMonth = i < 12 ? '04' : '07';
    const joinDate = `2026-${joinMonth}-${String((i % 15) + 1).padStart(2, '0')}`;
    const leaveDate = isNotice ? (i === 4 ? '2026-11-30' : '2026-12-05') : null;

    const [tenant] = await db
      .insert(schema.tenants)
      .values({
        organizationId: org.id,
        propertyId: prop1.id,
        bedId: bed.id,
        userId: i === 0 ? tenantPortalUser.id : null,
        accountLinkStatus: i === 0 ? 'LINKED' : 'NO_ACCOUNT',
        linkedAt: i === 0 ? new Date() : null,
        name: tInfo.name,
        phone: tInfo.phone,
        email: tInfo.email,
        idType: i % 3 === 0 ? 'Passport' : 'Aadhaar',
        idNumberMasked: `XXXX-XXXX-${String(4100 + i * 37).slice(0, 4)}`,
        occupation: tInfo.occ,
        companyOrCollege: tInfo.org,
        permanentAddress: `H.No ${14 + i}, Civil Lines, ${tInfo.city}`,
        emergencyContactName: `${tInfo.name.split(' ')[0]} Parent`,
        emergencyContactPhone: `98200${String(10000 + i * 111).slice(0, 5)}`,
        joinDate,
        leaveDate,
        noticeRequestedAt: isNotice ? '2026-11-01' : null,
        status: isNotice ? 'NOTICE' : 'ACTIVE',
        monthlyRent: bed.rent,
        securityDeposit: bed.rent * 2,
        depositStatus: 'HELD',
      })
      .returning();

    await db.update(schema.beds).set({ status: 'OCCUPIED' }).where(eq(schema.beds.id, bed.id));
    createdTenants.push({ id: tenant.id, propertyId: prop1.id, name: tenant.name, rent: bed.rent, joinDate });
  }

  for (let j = 0; j < 12; j++) {
    const tInfo = INDIAN_TENANT_NAMES[18 + j];
    const bed = p2Beds[j];
    const isNotice = j === 3;
    const joinDate = `2026-05-${String((j % 20) + 2).padStart(2, '0')}`;

    const [tenant] = await db
      .insert(schema.tenants)
      .values({
        organizationId: org.id,
        propertyId: prop2.id,
        bedId: bed.id,
        name: tInfo.name.replace('TanviPatel', 'Tanvi Patel'),
        phone: tInfo.phone,
        email: tInfo.email,
        idType: 'Aadhaar',
        idNumberMasked: `XXXX-XXXX-${String(7200 + j * 41).slice(0, 4)}`,
        occupation: tInfo.occ,
        companyOrCollege: tInfo.org,
        permanentAddress: `Flat ${201 + j}, Green Park, ${tInfo.city}`,
        emergencyContactName: `Guardian of ${tInfo.name.split(' ')[0]}`,
        emergencyContactPhone: `98111${String(20000 + j * 123).slice(0, 5)}`,
        joinDate,
        leaveDate: isNotice ? '2026-11-28' : null,
        noticeRequestedAt: isNotice ? '2026-10-29' : null,
        status: isNotice ? 'NOTICE' : 'ACTIVE',
        monthlyRent: bed.rent,
        securityDeposit: bed.rent * 2,
        depositStatus: 'HELD',
      })
      .returning();

    await db.update(schema.beds).set({ status: 'OCCUPIED' }).where(eq(schema.beds.id, bed.id));
    createdTenants.push({ id: tenant.id, propertyId: prop2.id, name: tenant.name, rent: bed.rent, joinDate });
  }

  // Generate 6 months of invoices (June 2026 .. Nov 2026) so revenue chart & billing screens are rich
  const billingMonths = [
    { year: 2026, month: 6 },
    { year: 2026, month: 7 },
    { year: 2026, month: 8 },
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
  ];

  let invSeq = 1001;
  let aaravPendingInvId: number | null = null;

  for (const bm of billingMonths) {
    const mStr = String(bm.month).padStart(2, '0');
    const lastDay = new Date(Date.UTC(bm.year, bm.month, 0)).getUTCDate();
    const isCurrentMonth = bm.year === 2026 && bm.month === 11;

    for (let idx = 0; idx < createdTenants.length; idx++) {
      const t = createdTenants[idx];
      const invNum = `PGD-${bm.year}${mStr}-${invSeq++}`;
      const dueDate = `${bm.year}-${mStr}-05`;
      const amount = t.rent;

      let status: 'PAID' | 'PENDING' | 'OVERDUE' | 'PARTIAL' = 'PAID';
      let paidAmount = amount;

      if (isCurrentMonth) {
        if (idx === 0) {
          // Aarav Kulkarni (Tenant demo account) has a current pending invoice for UPI submission demo
          status = 'PENDING';
          paidAmount = 0;
        } else if (idx % 7 === 1) {
          status = 'OVERDUE';
          paidAmount = 0;
        } else if (idx % 7 === 2) {
          status = 'PARTIAL';
          paidAmount = Math.round(amount * 0.5);
        } else if (idx % 7 === 3) {
          status = 'PENDING';
          paidAmount = 0;
        }
      } else if (bm.month === 10 && idx === 6) {
        status = 'OVERDUE';
        paidAmount = 0;
      }

      const [inv] = await db
        .insert(schema.invoices)
        .values({
          organizationId: org.id,
          propertyId: t.propertyId,
          tenantId: t.id,
          invoiceNumber: invNum,
          periodMonth: bm.month,
          periodYear: bm.year,
          periodStart: `${bm.year}-${mStr}-01`,
          periodEnd: `${bm.year}-${mStr}-${String(lastDay).padStart(2, '0')}`,
          items: [{ label: 'Monthly Bed Rent & Food', type: 'RENT', amount }],
          amount,
          paidAmount,
          dueDate,
          status,
          isProRata: false,
        })
        .returning();

      if (isCurrentMonth && idx === 0) {
        aaravPendingInvId = inv.id;
      }

      if (paidAmount > 0) {
        const method = idx % 4 === 0 ? 'CASH' : idx % 3 === 0 ? 'BANK' : 'UPI';
        await db.insert(schema.payments).values({
          organizationId: org.id,
          invoiceId: inv.id,
          tenantId: t.id,
          amount: paidAmount,
          method,
          reference: method === 'CASH' ? `RCPT-${invSeq}` : `UTR631${bm.month}${idx}892`,
          approvalStatus: 'APPROVED',
          paidAt: `${bm.year}-${mStr}-04`,
          recordedByUserId: ownerUser.id,
        });
      }
    }
  }

  // Add one pending UPI approval payment for Aarav Kulkarni's neighbor (idx 3) so Owner sees UPI approval queue
  const pendingInv = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.status, 'PENDING'))
    .limit(2);
  if (pendingInv[1]) {
    await db.insert(schema.payments).values({
      organizationId: org.id,
      invoiceId: pendingInv[1].id,
      tenantId: pendingInv[1].tenantId,
      amount: pendingInv[1].amount,
      method: 'UPI',
      reference: 'UTR631198442019',
      approvalStatus: 'PENDING_APPROVAL',
      paidAt: '2026-11-12',
      notes: 'Paid via GPay to sharmaresidences@okicici',
    });
  }

  // Expenses for 6 months
  for (const bm of billingMonths) {
    const mStr = String(bm.month).padStart(2, '0');
    await db.insert(schema.expenses).values([
      {
        organizationId: org.id,
        propertyId: prop1.id,
        category: 'ELECTRICITY',
        amount: 24500 + bm.month * 400,
        expenseDate: `${bm.year}-${mStr}-08`,
        vendor: 'BESCOM',
        note: 'Monthly HT electricity bill',
        recordedByUserId: ownerUser.id,
      },
      {
        organizationId: org.id,
        propertyId: prop1.id,
        category: 'FOOD_KITCHEN',
        amount: 46000,
        expenseDate: `${bm.year}-${mStr}-10`,
        vendor: 'Sri Annapurna Provisions',
        note: 'Groceries, LPG cylinders, and kitchen supplies',
        recordedByUserId: managerUser.id,
      },
      {
        organizationId: org.id,
        propertyId: prop1.id,
        category: 'STAFF_SALARY',
        amount: 34000,
        expenseDate: `${bm.year}-${mStr}-03`,
        vendor: 'Housekeeping & Cook Payroll',
        note: '2 cooks + 1 housekeeping staff',
        recordedByUserId: ownerUser.id,
      },
      {
        organizationId: org.id,
        propertyId: prop2.id,
        category: 'ELECTRICITY',
        amount: 19200 + bm.month * 300,
        expenseDate: `${bm.year}-${mStr}-09`,
        vendor: 'BESCOM',
        note: 'Indiranagar residence electricity',
        recordedByUserId: ownerUser.id,
      },
      {
        organizationId: org.id,
        propertyId: prop2.id,
        category: 'INTERNET',
        amount: 4800,
        expenseDate: `${bm.year}-${mStr}-05`,
        vendor: 'ACT Fibernet',
        note: 'Dual 300 Mbps lease lines',
        recordedByUserId: managerUser.id,
      },
      {
        organizationId: org.id,
        propertyId: prop2.id,
        category: 'STAFF_SALARY',
        amount: 28000,
        expenseDate: `${bm.year}-${mStr}-03`,
        vendor: 'Warden & Housekeeping',
        note: 'Monthly staff wages',
        recordedByUserId: ownerUser.id,
      },
    ]);
  }

  // Complaints with comments
  const [c1] = await db
    .insert(schema.complaints)
    .values({
      organizationId: org.id,
      propertyId: prop1.id,
      tenantId: createdTenants[0].id,
      title: 'Bathroom geyser tripping MCB in Room 101',
      category: 'ELECTRICAL',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      description: 'The 15L geyser trips the room MCB within 3 minutes of switching on.',
      assignedToUserId: managerUser.id,
    })
    .returning();

  await db.insert(schema.complaintComments).values([
    {
      organizationId: org.id,
      complaintId: c1.id,
      authorUserId: managerUser.id,
      authorName: 'Vikram Nair',
      authorRole: 'MANAGER',
      body: 'Electrician Ramesh scheduled for 4:30 PM today to inspect thermostat coil.',
    },
  ]);

  await db.insert(schema.complaints).values([
    {
      organizationId: org.id,
      propertyId: prop1.id,
      tenantId: createdTenants[2].id,
      title: '2nd floor Wi-Fi router dropping packets',
      category: 'WIFI',
      priority: 'URGENT',
      status: 'OPEN',
      description: 'Frequent disconnects during video calls in rooms 202 and 203 since yesterday evening.',
    },
    {
      organizationId: org.id,
      propertyId: prop2.id,
      tenantId: createdTenants[19].id,
      title: 'Slow sink drain in Room 102 attached bath',
      category: 'PLUMBING',
      priority: 'MEDIUM',
      status: 'OPEN',
      description: 'Water drains slowly after morning rush hours.',
    },
    {
      organizationId: org.id,
      propertyId: prop2.id,
      tenantId: createdTenants[21].id,
      title: 'Extra study lamp replacement completed',
      category: 'HOUSEKEEPING',
      priority: 'LOW',
      status: 'RESOLVED',
      description: 'Requested LED desk lamp bulb replacement in 103-B.',
      assignedToUserId: managerUser.id,
      resolvedAt: new Date(),
    },
  ]);

  // Notices
  await db.insert(schema.notices).values([
    {
      organizationId: org.id,
      propertyId: null,
      title: 'BESCOM Scheduled Maintenance — Sunday 10 AM to 1 PM',
      body: 'DG power backup will remain active for lifts, Wi-Fi routers, and room lights. Heavy appliances (geysers, irons) will be paused during the 3-hour window.',
      pinned: true,
      createdByUserId: ownerUser.id,
      createdByName: 'Rajesh Sharma',
    },
    {
      organizationId: org.id,
      propertyId: prop1.id,
      title: 'November Rent Due Reminder & Updated UPI ID',
      body: 'Kindly clear November rent by 05 Nov via sharmaresidences@okicici and upload the UTR reference in your PGDesk Tenant Portal.',
      pinned: false,
      createdByUserId: managerUser.id,
      createdByName: 'Vikram Nair',
    },
    {
      organizationId: org.id,
      propertyId: prop2.id,
      title: 'Deepavali Festive Dinner Menu — Saturday 7:30 PM',
      body: 'Special festive dinner will be served in the ground-floor dining lounge. Residents may invite one female guest with prior warden entry.',
      pinned: true,
      createdByUserId: ownerUser.id,
      createdByName: 'Rajesh Sharma',
    },
  ]);

  // Public Enquiries / Leads
  await db.insert(schema.enquiries).values([
    {
      organizationId: org.id,
      propertyId: prop1.id,
      name: 'Prateek Deshpande',
      phone: '9880912345',
      email: 'prateek.d@gmail.com',
      preferredRoomType: 'SINGLE',
      moveInDate: '2026-12-01',
      message: 'Looking for a single AC room near Sony World Signal from 1st Dec.',
      status: 'NEW_ENQUIRY',
      source: 'PUBLIC_LISTING',
      notes: '',
    },
    {
      organizationId: org.id,
      propertyId: prop1.id,
      name: 'Rohan Sahu',
      phone: '9741298765',
      email: 'rohan.sahu@outlook.com',
      preferredRoomType: 'DOUBLE',
      moveInDate: '2026-11-20',
      message: 'Can I visit tomorrow at 5 PM with my colleague?',
      status: 'APPROVED',
      source: 'PUBLIC_LISTING',
      notes: 'Visit confirmed for 5:00 PM with Vikram.',
    },
    {
      organizationId: org.id,
      propertyId: prop2.id,
      name: 'Shreya Kulkarni',
      phone: '9620134567',
      email: 'shreya.k@gmail.com',
      preferredRoomType: 'DOUBLE',
      moveInDate: '2026-12-01',
      message: 'Joining an architecture firm on 100ft Road. Need twin sharing AC.',
      status: 'CONTACTED',
      source: 'PUBLIC_LISTING',
      notes: 'Shared photos & tariff card on WhatsApp.',
    },
  ]);

  if (aaravPendingInvId) {
    await db.insert(schema.auditLogs).values({
      organizationId: org.id,
      actorUserId: ownerUser.id,
      actorName: 'Rajesh Sharma',
      actorRole: 'OWNER',
      action: 'SEED_INITIALIZED',
      entityType: 'ORGANIZATION',
      entityId: String(org.id),
      metadata: { propertiesCount: 2, tenantsCount: createdTenants.length, samplePendingInvoiceId: aaravPendingInvId },
    });
  }

  console.log('PGDesk database seeded successfully.');
}
