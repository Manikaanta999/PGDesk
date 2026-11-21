import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['ADMIN', 'OWNER', 'MANAGER', 'TENANT']);
export const accountLinkStatusEnum = pgEnum('account_link_status', [
  'NO_ACCOUNT',
  'ACCOUNT_CREATED',
  'LINK_PENDING',
  'LINKED',
  'LINK_REJECTED',
]);
export const genderTypeEnum = pgEnum('gender_type', ['BOYS', 'GIRLS', 'COED']);
export const billingModeEnum = pgEnum('billing_mode', ['FIXED_1ST', 'JOIN_DATE']);
export const roomTypeEnum = pgEnum('room_type', ['SINGLE', 'DOUBLE', 'TRIPLE', 'DORM']);
export const bedStatusEnum = pgEnum('bed_status', ['VACANT', 'OCCUPIED', 'RESERVED', 'MAINTENANCE']);
export const tenantStatusEnum = pgEnum('tenant_status', ['ACTIVE', 'NOTICE', 'LEFT']);
export const depositStatusEnum = pgEnum('deposit_status', [
  'HELD',
  'PARTIAL_REFUND',
  'REFUNDED',
  'FORFEITED',
]);
export const invoiceStatusEnum = pgEnum('invoice_status', ['PAID', 'PENDING', 'UNPAID', 'OVERDUE', 'PARTIAL']);
export const paymentMethodEnum = pgEnum('payment_method', ['CASH', 'UPI', 'BANK', 'ONLINE']);
export const paymentApprovalEnum = pgEnum('payment_approval_status', [
  'APPROVED',
  'PENDING_APPROVAL',
  'REJECTED',
]);
export const expenseCategoryEnum = pgEnum('expense_category', [
  'ELECTRICITY',
  'WATER',
  'MAINTENANCE',
  'STAFF_SALARY',
  'FOOD_KITCHEN',
  'INTERNET',
  'HOUSEKEEPING',
  'OTHER',
]);
export const complaintCategoryEnum = pgEnum('complaint_category', [
  'PLUMBING',
  'ELECTRICAL',
  'WIFI',
  'HOUSEKEEPING',
  'FOOD',
  'SECURITY',
  'OTHER',
]);
export const complaintPriorityEnum = pgEnum('complaint_priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const complaintStatusEnum = pgEnum('complaint_status', ['OPEN', 'IN_PROGRESS', 'RESOLVED']);
export const enquiryStatusEnum = pgEnum('enquiry_status', [
  'NEW_ENQUIRY',
  'CONTACTED',
  'APPROVED',
  'REJECTED',
  'CONVERTED_TO_STUDENT',
]);

export interface InvoiceLineItem {
  label: string;
  type: 'RENT' | 'ELECTRICITY' | 'FOOD' | 'LATE_FEE' | 'OTHER';
  amount: number;
}

export interface UserNotificationPrefs {
  hostelNotices: boolean;
  rentReminders: boolean;
  complaintUpdates: boolean;
  securityAlerts: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: UserNotificationPrefs = {
  hostelNotices: true,
  rentReminders: true,
  complaintUpdates: true,
  securityAlerts: true,
};

export const organizations = pgTable(
  'organizations',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    brandColor: text('brand_color').notNull().default('#0F766E'),
    logoUrl: text('logo_url'),
    upiId: text('upi_id').notNull().default('pgdesk@okicici'),
    upiPayeeName: text('upi_payee_name').notNull().default('PGDesk Residences'),
    gstin: text('gstin').notNull().default(''),
    gstRatePct: integer('gst_rate_pct').notNull().default(0),
    planTier: text('plan_tier').notNull().default('GROWTH'),
    invoiceSeq: integer('invoice_seq').notNull().default(1),
    billingDayDefault: integer('billing_day_default').notNull().default(1),
    dueDaysAfterInvoice: integer('due_days_after_invoice').notNull().default(5),
    lateFeePerDay: integer('late_fee_per_day').notNull().default(100),
    graceDays: integer('grace_days').notNull().default(3),
    noticePeriodDays: integer('notice_period_days').notNull().default(30),
    phone: text('phone').notNull().default('+91 98450 11223'),
    email: text('email').notNull().default('ops@pgdesk.in'),
    address: text('address').notNull().default('Bengaluru, Karnataka'),
    bankDetails: text('bank_details').notNull().default(''),
    paymentInstructions: text('payment_instructions').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('organizations_slug_idx').on(table.slug)]
);

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').unique(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    photoUrl: text('photo_url'),
    passwordHash: text('password_hash'),
    role: userRoleEnum('role').notNull().default('OWNER'),
    assignedPropertyIds: jsonb('assigned_property_ids').$type<number[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    emailVerified: boolean('email_verified').notNull().default(true),
    phoneVerified: boolean('phone_verified').notNull().default(false),
    emailVerificationTokenHash: text('email_verification_token_hash'),
    emailVerificationExpiresAt: timestamp('email_verification_expires_at'),
    tokenVersion: integer('token_version').notNull().default(1),
    lastLoginAt: timestamp('last_login_at'),
    notificationPrefs: jsonb('notification_prefs')
      .$type<UserNotificationPrefs>()
      .notNull()
      .default(DEFAULT_NOTIFICATION_PREFS),
    pendingEmail: text('pending_email'),
    pendingEmailCodeHash: text('pending_email_code_hash'),
    pendingEmailExpiresAt: timestamp('pending_email_expires_at'),
    pendingPhone: text('pending_phone'),
    pendingPhoneCodeHash: text('pending_phone_code_hash'),
    pendingPhoneExpiresAt: timestamp('pending_phone_expires_at'),
    otpCodeHash: text('otp_code_hash'),
    otpExpiresAt: timestamp('otp_expires_at'),
    resetTokenHash: text('reset_token_hash'),
    resetTokenExpiresAt: timestamp('reset_token_expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('users_org_idx').on(table.organizationId),
    uniqueIndex('users_email_idx').on(table.email),
    index('users_phone_idx').on(table.phone),
  ]
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    sessionId: text('session_id').notNull(),
    userAgent: text('user_agent').notNull().default('Web Browser'),
    ipAddress: text('ip_address').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    revokedAt: timestamp('revoked_at'),
  },
  (table) => [
    index('user_sessions_user_idx').on(table.userId),
    uniqueIndex('user_sessions_sid_idx').on(table.sessionId),
  ]
);

export const properties = pgTable(
  'properties',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    address: text('address').notNull(),
    locality: text('locality').notNull().default('Koramangala'),
    city: text('city').notNull(),
    genderType: genderTypeEnum('gender_type').notNull().default('BOYS'),
    amenities: jsonb('amenities').$type<string[]>().notNull().default([]),
    photos: jsonb('photos').$type<string[]>().notNull().default([]),
    rules: jsonb('rules').$type<string[]>().notNull().default([]),
    contactName: text('contact_name').notNull().default('Property Manager'),
    contactPhone: text('contact_phone').notNull(),
    description: text('description').notNull().default(''),
    isPublic: boolean('is_public').notNull().default(true),
    billingMode: billingModeEnum('billing_mode').notNull().default('FIXED_1ST'),
    billingDay: integer('billing_day').notNull().default(1),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('properties_slug_idx').on(table.slug),
    index('properties_org_idx').on(table.organizationId),
  ]
);

export const floors = pgTable(
  'floors',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    propertyId: integer('property_id')
      .references(() => properties.id)
      .notNull(),
    name: text('name').notNull(),
    floorNumber: integer('floor_number').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('floors_org_idx').on(table.organizationId),
    index('floors_property_idx').on(table.propertyId),
  ]
);

export const rooms = pgTable(
  'rooms',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    propertyId: integer('property_id')
      .references(() => properties.id)
      .notNull(),
    floorId: integer('floor_id')
      .references(() => floors.id)
      .notNull(),
    roomNumber: text('room_number').notNull(),
    roomType: roomTypeEnum('room_type').notNull().default('DOUBLE'),
    isAc: boolean('is_ac').notNull().default(false),
    attachedBath: boolean('attached_bath').notNull().default(true),
    rentPerBed: integer('rent_per_bed').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('rooms_org_idx').on(table.organizationId),
    index('rooms_property_idx').on(table.propertyId),
    index('rooms_floor_idx').on(table.floorId),
  ]
);

export const beds = pgTable(
  'beds',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    propertyId: integer('property_id')
      .references(() => properties.id)
      .notNull(),
    floorId: integer('floor_id')
      .references(() => floors.id)
      .notNull(),
    roomId: integer('room_id')
      .references(() => rooms.id)
      .notNull(),
    bedLabel: text('bed_label').notNull(),
    status: bedStatusEnum('status').notNull().default('VACANT'),
    monthlyRentOverride: integer('monthly_rent_override'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('beds_org_idx').on(table.organizationId),
    index('beds_property_idx').on(table.propertyId),
    index('beds_room_idx').on(table.roomId),
    index('beds_status_idx').on(table.status),
  ]
);

export const tenants = pgTable(
  'tenants',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    propertyId: integer('property_id')
      .references(() => properties.id)
      .notNull(),
    bedId: integer('bed_id').references(() => beds.id),
    userId: integer('user_id').references(() => users.id),
    accountLinkStatus: accountLinkStatusEnum('account_link_status').notNull().default('NO_ACCOUNT'),
    linkCodeHash: text('link_code_hash'),
    linkCodeExpiresAt: timestamp('link_code_expires_at'),
    linkRequestedByUserId: integer('link_requested_by_user_id').references(() => users.id),
    linkRequestedAt: timestamp('link_requested_at'),
    linkedAt: timestamp('linked_at'),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    photoUrl: text('photo_url'),
    dateOfBirth: text('date_of_birth'),
    idType: text('id_type').notNull().default('Aadhaar'),
    idNumberMasked: text('id_number_masked').notNull().default(''),
    idDocumentUrl: text('id_document_url'),
    kycVerifiedStatus: text('kyc_verified_status').notNull().default('PENDING'),
    occupation: text('occupation').notNull().default('Software Engineer'),
    companyOrCollege: text('company_or_college').notNull().default(''),
    permanentAddress: text('permanent_address').notNull().default(''),
    emergencyContactName: text('emergency_contact_name').notNull().default(''),
    emergencyContactRelation: text('emergency_contact_relation').notNull().default(''),
    emergencyContactPhone: text('emergency_contact_phone').notNull().default(''),
    joinDate: text('join_date').notNull(), // YYYY-MM-DD
    leaveDate: text('leave_date'), // YYYY-MM-DD
    noticeRequestedAt: text('notice_requested_at'),
    status: tenantStatusEnum('status').notNull().default('ACTIVE'),
    monthlyRent: integer('monthly_rent').notNull(),
    securityDeposit: integer('security_deposit').notNull().default(0),
    depositStatus: depositStatusEnum('deposit_status').notNull().default('HELD'),
    depositDeductions: integer('deposit_deductions').notNull().default(0),
    depositSettlementNote: text('deposit_settlement_note'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('tenants_org_idx').on(table.organizationId),
    index('tenants_property_idx').on(table.propertyId),
    index('tenants_bed_idx').on(table.bedId),
    index('tenants_status_idx').on(table.status),
    index('tenants_user_idx').on(table.userId),
    index('tenants_link_status_idx').on(table.accountLinkStatus),
  ]
);

export const invoices = pgTable(
  'invoices',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    propertyId: integer('property_id')
      .references(() => properties.id)
      .notNull(),
    tenantId: integer('tenant_id')
      .references(() => tenants.id)
      .notNull(),
    invoiceNumber: text('invoice_number').notNull(),
    periodMonth: integer('period_month').notNull(),
    periodYear: integer('period_year').notNull(),
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    items: jsonb('items').$type<InvoiceLineItem[]>().notNull().default([]),
    amount: integer('amount').notNull(),
    paidAmount: integer('paid_amount').notNull().default(0),
    dueDate: text('due_date').notNull(), // YYYY-MM-DD
    status: invoiceStatusEnum('status').notNull().default('UNPAID'),
    isProRata: boolean('is_pro_rata').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('invoices_number_idx').on(table.organizationId, table.invoiceNumber),
    index('invoices_org_idx').on(table.organizationId),
    index('invoices_tenant_idx').on(table.tenantId),
    index('invoices_property_idx').on(table.propertyId),
    index('invoices_status_idx').on(table.status),
    index('invoices_period_idx').on(table.periodYear, table.periodMonth),
  ]
);

export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    invoiceId: integer('invoice_id')
      .references(() => invoices.id)
      .notNull(),
    tenantId: integer('tenant_id')
      .references(() => tenants.id)
      .notNull(),
    amount: integer('amount').notNull(),
    method: paymentMethodEnum('method').notNull().default('UPI'),
    reference: text('reference').notNull().default(''),
    screenshotUrl: text('screenshot_url'),
    approvalStatus: paymentApprovalEnum('approval_status').notNull().default('APPROVED'),
    paidAt: text('paid_at').notNull(), // YYYY-MM-DD
    recordedByUserId: integer('recorded_by_user_id').references(() => users.id),
    idempotencyKey: text('idempotency_key'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('payments_org_idx').on(table.organizationId),
    index('payments_invoice_idx').on(table.invoiceId),
    index('payments_tenant_idx').on(table.tenantId),
    index('payments_approval_idx').on(table.approvalStatus),
    uniqueIndex('payments_org_idempotency_idx').on(table.organizationId, table.idempotencyKey),
  ]
);

export const expenses = pgTable(
  'expenses',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    propertyId: integer('property_id')
      .references(() => properties.id)
      .notNull(),
    category: expenseCategoryEnum('category').notNull(),
    amount: integer('amount').notNull(),
    expenseDate: text('expense_date').notNull(), // YYYY-MM-DD
    vendor: text('vendor').notNull().default(''),
    note: text('note').notNull().default(''),
    recordedByUserId: integer('recorded_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('expenses_org_idx').on(table.organizationId),
    index('expenses_property_idx').on(table.propertyId),
    index('expenses_date_idx').on(table.expenseDate),
  ]
);

export const complaints = pgTable(
  'complaints',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    propertyId: integer('property_id')
      .references(() => properties.id)
      .notNull(),
    tenantId: integer('tenant_id')
      .references(() => tenants.id)
      .notNull(),
    title: text('title').notNull(),
    category: complaintCategoryEnum('category').notNull().default('OTHER'),
    description: text('description').notNull(),
    photoUrl: text('photo_url'),
    priority: complaintPriorityEnum('priority').notNull().default('MEDIUM'),
    status: complaintStatusEnum('status').notNull().default('OPEN'),
    assignedToUserId: integer('assigned_to_user_id').references(() => users.id),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('complaints_org_idx').on(table.organizationId),
    index('complaints_property_idx').on(table.propertyId),
    index('complaints_tenant_idx').on(table.tenantId),
    index('complaints_status_idx').on(table.status),
  ]
);

export const complaintComments = pgTable(
  'complaint_comments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    complaintId: integer('complaint_id')
      .references(() => complaints.id)
      .notNull(),
    authorUserId: integer('author_user_id').references(() => users.id),
    authorName: text('author_name').notNull(),
    authorRole: text('author_role').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('complaint_comments_complaint_idx').on(table.complaintId),
    index('complaint_comments_org_idx').on(table.organizationId),
  ]
);

export const notices = pgTable(
  'notices',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    propertyId: integer('property_id').references(() => properties.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    pinned: boolean('pinned').notNull().default(false),
    createdByUserId: integer('created_by_user_id').references(() => users.id),
    createdByName: text('created_by_name').notNull().default('Management'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('notices_org_idx').on(table.organizationId),
    index('notices_property_idx').on(table.propertyId),
  ]
);

export const enquiries = pgTable(
  'enquiries',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    propertyId: integer('property_id')
      .references(() => properties.id)
      .notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    preferredRoomType: text('preferred_room_type').notNull().default('DOUBLE'),
    moveInDate: text('move_in_date'),
    message: text('message').notNull().default(''),
    status: enquiryStatusEnum('status').notNull().default('NEW_ENQUIRY'),
    source: text('source').notNull().default('PUBLIC_LISTING'),
    notes: text('notes').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('enquiries_org_idx').on(table.organizationId),
    index('enquiries_property_idx').on(table.propertyId),
    index('enquiries_status_idx').on(table.status),
  ]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    actorUserId: integer('actor_user_id').references(() => users.id),
    actorName: text('actor_name').notNull(),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_org_idx').on(table.organizationId),
    index('audit_logs_created_idx').on(table.createdAt),
  ]
);

export const uploadedFiles = pgTable(
  'uploaded_files',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    ownerUserId: integer('owner_user_id').references(() => users.id),
    tenantId: integer('tenant_id').references(() => tenants.id),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull(),
    provider: text('provider').notNull().default('local_db'),
    externalUrl: text('external_url'),
    contentBase64: text('content_base64'),
    isPrivate: boolean('is_private').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('uploaded_files_org_idx').on(table.organizationId),
    index('uploaded_files_tenant_idx').on(table.tenantId),
  ]
);

export const moveOutRequests = pgTable(
  'move_out_requests',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    propertyId: integer('property_id')
      .references(() => properties.id)
      .notNull(),
    tenantId: integer('tenant_id')
      .references(() => tenants.id)
      .notNull(),
    requestedLeaveDate: text('requested_leave_date').notNull(),
    reason: text('reason').notNull().default(''),
    notes: text('notes').notNull().default(''),
    status: text('status').notNull().default('SUBMITTED'), // SUBMITTED | UNDER_REVIEW | APPROVED | REJECTED
    ownerNote: text('owner_note').notNull().default(''),
    reviewedByUserId: integer('reviewed_by_user_id').references(() => users.id),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('move_out_requests_org_idx').on(table.organizationId),
    index('move_out_requests_tenant_idx').on(table.tenantId),
    index('move_out_requests_status_idx').on(table.status),
  ]
);

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  properties: many(properties),
  tenants: many(tenants),
  invoices: many(invoices),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [properties.organizationId],
    references: [organizations.id],
  }),
  floors: many(floors),
  rooms: many(rooms),
  beds: many(beds),
  tenants: many(tenants),
  enquiries: many(enquiries),
}));

export const floorsRelations = relations(floors, ({ one, many }) => ({
  property: one(properties, {
    fields: [floors.propertyId],
    references: [properties.id],
  }),
  rooms: many(rooms),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  floor: one(floors, {
    fields: [rooms.floorId],
    references: [floors.id],
  }),
  property: one(properties, {
    fields: [rooms.propertyId],
    references: [properties.id],
  }),
  beds: many(beds),
}));

export const bedsRelations = relations(beds, ({ one }) => ({
  room: one(rooms, {
    fields: [beds.roomId],
    references: [rooms.id],
  }),
  property: one(properties, {
    fields: [beds.propertyId],
    references: [properties.id],
  }),
}));

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  property: one(properties, {
    fields: [tenants.propertyId],
    references: [properties.id],
  }),
  bed: one(beds, {
    fields: [tenants.bedId],
    references: [beds.id],
  }),
  invoices: many(invoices),
  complaints: many(complaints),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [invoices.tenantId],
    references: [tenants.id],
  }),
  property: one(properties, {
    fields: [invoices.propertyId],
    references: [properties.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
  tenant: one(tenants, {
    fields: [payments.tenantId],
    references: [tenants.id],
  }),
}));

export const complaintsRelations = relations(complaints, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [complaints.tenantId],
    references: [tenants.id],
  }),
  property: one(properties, {
    fields: [complaints.propertyId],
    references: [properties.id],
  }),
  comments: many(complaintComments),
}));

export const complaintCommentsRelations = relations(complaintComments, ({ one }) => ({
  complaint: one(complaints, {
    fields: [complaintComments.complaintId],
    references: [complaints.id],
  }),
}));
