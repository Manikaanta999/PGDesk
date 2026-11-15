export type IdDocType = 'Aadhaar' | 'PAN' | 'Passport' | 'Driving License' | 'College ID';

export interface InvoiceItemRow {
  label: string;
  type: 'RENT' | 'ELECTRICITY' | 'FOOD' | 'LATE_FEE' | 'OTHER';
  amount: number;
}

export interface TenantInvoiceRow {
  id: number;
  invoiceNumber: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  items: InvoiceItemRow[];
  amount: number;
  paidAmount: number;
  balanceDue: number;
  dueDate: string;
  status: string;
  isProRata: boolean;
  notes?: string | null;
  createdAt: string;
}

export interface TenantPaymentRow {
  id: number;
  invoiceId: number;
  amount: number;
  method: string;
  reference: string;
  screenshotUrl?: string | null;
  approvalStatus: string;
  paidAt: string;
  notes?: string | null;
}

export interface TenantComplaintRow {
  id: number;
  title: string;
  category: string;
  priority: string;
  status: string;
  description: string;
  photoUrl?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  comments: Array<{
    id: number;
    authorName: string;
    authorRole: string;
    body: string;
    createdAt?: string;
  }>;
}

export interface TenantNoticeRow {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  createdByName?: string;
  createdAt: string;
}

export interface TenantMoveOutRequestRow {
  id: number;
  requestedLeaveDate: string;
  reason: string;
  notes: string;
  status: string;
  ownerNote: string;
  createdAt: string;
}

export interface PastStayRecord {
  stayId: number;
  status: string;
  joinDate: string;
  leaveDate: string | null;
  monthlyRent: number;
  securityDeposit: number;
  depositStatus: string;
  depositDeductions: number;
  depositSettlementNote: string;
  propertyName: string;
  propertyAddress: string;
  roomNumber: string;
  roomType: string;
  bedLabel: string;
  invoices: TenantInvoiceRow[];
  payments: TenantPaymentRow[];
}

export interface TenantOverviewResponse {
  hasActiveStay?: boolean;
  unassigned?: boolean;
  isPastStay?: boolean;
  userProfile?: {
    name: string;
    email: string;
    phone: string;
    photoUrl?: string | null;
  };
  pendingLinkRequests?: Array<{
    id: number;
    propertyName: string;
    requestedAt: string | null;
  }>;
  availableHostels?: Array<{
    id: number;
    name: string;
    locality: string;
    city: string;
  }>;
  tenant: {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    photoUrl?: string | null;
    dateOfBirth?: string | null;
    joinDate: string;
    leaveDate: string | null;
    status: string;
    monthlyRent: number;
    securityDeposit: number;
    depositStatus?: string;
    depositSettlementNote?: string | null;
    occupation: string;
    companyOrCollege: string;
    permanentAddress: string;
    idType: string;
    idNumberMasked: string;
    idDocumentUrl: string | null;
    kycVerifiedStatus?: string;
    emergencyContactName: string;
    emergencyContactRelation?: string;
    emergencyContactPhone: string;
  } | null;
  organization: {
    name: string;
    upiId: string;
    upiPayeeName: string;
    phone: string;
    email?: string;
    address?: string;
    noticePeriodDays: number;
    bankDetails?: string;
    paymentInstructions?: string;
  } | null;
  property: {
    id: number;
    name: string;
    address: string;
    locality: string;
    city: string;
    contactName?: string;
    contactPhone?: string;
  } | null;
  bed: { id: number; bedLabel: string } | null;
  room: {
    id: number;
    roomNumber: string;
    roomType: string;
    isAc: boolean;
    attachedBath?: boolean;
  } | null;
  invoices: TenantInvoiceRow[];
  payments: TenantPaymentRow[];
  complaints: TenantComplaintRow[];
  notices: TenantNoticeRow[];
  moveOutRequests?: TenantMoveOutRequestRow[];
  pastStays?: PastStayRecord[];
}

