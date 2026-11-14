import { z } from 'zod';
import { validateMaskedIdNumber } from './billing.ts';

export const indianPhoneSchema = z
  .string()
  .trim()
  .refine((val) => {
    const digits = val.replace(/\D/g, '');
    return digits.length === 10 || (digits.length === 12 && digits.startsWith('91'));
  }, 'Enter a valid 10-digit Indian mobile number');

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Email or mobile number is required'),
  password: z.string().min(4, 'Password must be at least 4 characters'),
});

export const createPropertySchema = z.object({
  name: z.string().trim().min(2, 'Property name is required').max(120),
  address: z.string().trim().min(5, 'Address is required').max(250),
  locality: z.string().trim().min(2, 'Locality is required').max(80),
  city: z.string().trim().min(2, 'City is required').max(80),
  genderType: z.enum(['BOYS', 'GIRLS', 'COED']),
  amenities: z.array(z.string().trim().min(1)).default([]),
  rules: z.array(z.string().trim().min(1)).default([]),
  photos: z.array(z.string().trim().min(1)).default([]),
  contactName: z.string().trim().min(2).max(80),
  contactPhone: indianPhoneSchema,
  description: z.string().trim().max(1200).default(''),
  isPublic: z.boolean().default(true),
  billingMode: z.enum(['FIXED_1ST', 'JOIN_DATE']).default('FIXED_1ST'),
  billingDay: z.coerce.number().int().min(1).max(28).default(1),
});

export const createFloorSchema = z.object({
  name: z.string().trim().min(1, 'Floor name is required').max(60),
  floorNumber: z.coerce.number().int().min(0).max(50),
});

export const createRoomSchema = z.object({
  floorId: z.coerce.number().int().positive(),
  roomNumber: z.string().trim().min(1, 'Room number is required').max(20),
  roomType: z.enum(['SINGLE', 'DOUBLE', 'TRIPLE', 'DORM']),
  isAc: z.boolean().default(false),
  attachedBath: z.boolean().default(true),
  rentPerBed: z.coerce.number().int().min(1000).max(200000),
  bedCount: z.coerce.number().int().min(1).max(12).optional(),
});

export const updateBedStatusSchema = z.object({
  status: z.enum(['VACANT', 'OCCUPIED', 'RESERVED', 'MAINTENANCE']),
  notes: z.string().trim().max(240).optional().nullable(),
  monthlyRentOverride: z.coerce.number().int().min(1000).max(200000).optional().nullable(),
});

export const createTenantSchema = z
  .object({
    name: z.string().trim().min(2, 'Full name is required').max(120),
    phone: indianPhoneSchema,
    email: z.string().trim().email('Valid email required').optional().or(z.literal('')),
    propertyId: z.coerce.number().int().positive(),
    bedId: z.coerce.number().int().positive(),
    idType: z.enum(['Aadhaar', 'PAN', 'Passport', 'Driving License', 'College ID']),
    idNumberMasked: z.string().trim().min(4).max(32),
    idDocumentUrl: z.string().trim().optional().nullable(),
    occupation: z.string().trim().min(2).max(80),
    companyOrCollege: z.string().trim().max(120).default(''),
    permanentAddress: z.string().trim().min(5, 'Permanent address is required').max(300),
    emergencyContactName: z.string().trim().min(2, 'Emergency contact name is required').max(80),
    emergencyContactPhone: indianPhoneSchema,
    joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
    monthlyRent: z.coerce.number().int().min(1000).max(200000),
    securityDeposit: z.coerce.number().int().min(0).max(500000),
    generateJoiningInvoice: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    const check = validateMaskedIdNumber(val.idType, val.idNumberMasked);
    if (!check.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: check.message || 'Invalid ID format',
        path: ['idNumberMasked'],
      });
    }
  });

export const moveOutTenantSchema = z.object({
  leaveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  depositDeductions: z.coerce.number().int().min(0).max(500000).default(0),
  depositStatus: z.enum(['HELD', 'PARTIAL_REFUND', 'REFUNDED', 'FORFEITED']),
  depositSettlementNote: z.string().trim().max(400).default(''),
});

export const generateInvoicesSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2024).max(2035),
  propertyId: z.coerce.number().int().positive().optional(),
  applyLateFees: z.boolean().default(true),
});

export const recordPaymentSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  amount: z.coerce.number().int().min(1).max(1000000),
  method: z.enum(['CASH', 'UPI', 'BANK', 'ONLINE']),
  reference: z.string().trim().max(120).default(''),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(240).optional(),
});

export const tenantUpiSubmissionSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  amount: z.coerce.number().int().min(1).max(1000000),
  reference: z.string().trim().min(6, 'Enter valid UTR / UPI transaction reference').max(120),
  screenshotUrl: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(240).optional(),
});

export const createComplaintSchema = z.object({
  title: z.string().trim().min(3, 'Short title is required').max(140),
  category: z.enum(['PLUMBING', 'ELECTRICAL', 'WIFI', 'HOUSEKEEPING', 'FOOD', 'SECURITY', 'OTHER']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  description: z.string().trim().min(5, 'Describe the issue').max(1200),
  photoUrl: z.string().trim().optional().nullable(),
  tenantId: z.coerce.number().int().positive().optional(),
});

export const updateComplaintSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignedToUserId: z.coerce.number().int().positive().nullable().optional(),
});

export const createNoticeSchema = z.object({
  title: z.string().trim().min(3).max(140),
  body: z.string().trim().min(5).max(2000),
  propertyId: z.coerce.number().int().positive().nullable().optional(),
  pinned: z.boolean().default(false),
});

export const createExpenseSchema = z.object({
  propertyId: z.coerce.number().int().positive(),
  category: z.enum([
    'ELECTRICITY',
    'WATER',
    'MAINTENANCE',
    'STAFF_SALARY',
    'FOOD_KITCHEN',
    'INTERNET',
    'HOUSEKEEPING',
    'OTHER',
  ]),
  amount: z.coerce.number().int().min(1).max(5000000),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendor: z.string().trim().max(120).default(''),
  note: z.string().trim().max(300).default(''),
});

export const publicEnquirySchema = z.object({
  propertyId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2, 'Your name is required').max(100),
  phone: indianPhoneSchema,
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  preferredRoomType: z.enum(['SINGLE', 'DOUBLE', 'TRIPLE', 'DORM']).default('DOUBLE'),
  moveInDate: z.string().trim().max(32).optional(),
  message: z.string().trim().max(600).default(''),
  website: z.string().max(0).optional(), // Honeypot spam trap
});

export const updateEnquirySchema = z.object({
  status: z.enum(['NEW', 'CONTACTED', 'VISIT_SCHEDULED', 'CONVERTED', 'LOST']),
  notes: z.string().trim().max(600).default(''),
});

export const updateSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  upiId: z.string().trim().min(3).max(80),
  upiPayeeName: z.string().trim().min(2).max(100),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (val) => val === '' || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(val),
      'Enter a valid 15-character Indian GSTIN or leave blank'
    )
    .default(''),
  gstRatePct: z.coerce.number().int().min(0).max(28).default(0),
  planTier: z.enum(['STARTER', 'GROWTH', 'ENTERPRISE']).default('GROWTH'),
  billingDayDefault: z.coerce.number().int().min(1).max(28),
  dueDaysAfterInvoice: z.coerce.number().int().min(1).max(25),
  lateFeePerDay: z.coerce.number().int().min(0).max(2000),
  graceDays: z.coerce.number().int().min(0).max(15),
  noticePeriodDays: z.coerce.number().int().min(7).max(90),
  phone: indianPhoneSchema,
  email: z.string().trim().email(),
  address: z.string().trim().min(5).max(250),
});

export const inviteStaffSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  phone: indianPhoneSchema,
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['OWNER', 'MANAGER']),
  assignedPropertyIds: z.array(z.coerce.number().int().positive()).default([]),
});

export const registerSchema = z
  .object({
    accountType: z.enum(['OWNER', 'TENANT']).default('OWNER'),
    name: z.string().trim().min(2, 'Full name is required').max(120),
    organizationName: z.string().trim().max(120).optional().default(''),
    email: z.string().trim().email('Enter a valid email address'),
    phone: indianPhoneSchema,
    password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  })
  .refine(
    (val) => val.accountType !== 'OWNER' || val.organizationName.trim().length >= 2,
    {
      message: 'PG / Business name is required (min 2 characters)',
      path: ['organizationName'],
    }
  );

export const verifyOtpSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit verification code'),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your registered email or mobile number'),
});

export const resetPasswordSchema = z.object({
  identifier: z.string().trim().min(3, 'Email or mobile number is required'),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit reset code'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters').max(100),
});
