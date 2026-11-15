export type LanguageCode = 'en' | 'te';

export const LANGUAGE_STORAGE_KEY = 'pgdesk_language';

/**
 * First-time visitor prompt and language switcher copy always remain in
 * clear, standard English (with the native script label "తెలుగు" for the selector).
 */
export const LANGUAGE_PROMPT_COPY = {
  line1: 'Are you comfortable using PGDesk in English?',
  line2: 'Would you prefer Telugu?',
  keepEnglish: 'English is fine',
  useTelugu: 'Use Telugu',
  closeLabel: 'Close language notification',
} as const;

/**
 * LIMITED TELUGU SCOPE:
 * Only approved main page headings and main section headings are translated when
 * Telugu is selected. All navigation items, buttons, forms, descriptions, tables,
 * FAQs, notifications, and user-entered/database data stay in simple English.
 */
export const HEADING_TRANSLATIONS = {
  en: {
    // Homepage main headings
    'heading.hero': 'Manage Your Hostel Easily with PGDesk',
    'heading.featuresSection': 'Everything You Need to Run Your Hostel',
    'heading.featureStudents': 'Manage Students',
    'heading.featureRooms': 'Manage Rooms',
    'heading.featureRent': 'Track Rent',
    'heading.featureComplaints': 'Manage Complaints',
    'heading.demoSection': 'See How PGDesk Works',
    'heading.howItWorksSection': 'How to Start Using PGDesk',
    'heading.freeToUseSection': 'Start Managing Your Hostel for Free',
    'heading.listingsSection': 'Hostels Listed on PGDesk',
    'heading.faqSection': 'Common Questions',
    'heading.finalCtaSection': 'Make Your Hostel Management Easy Today',

    // Main dashboard & portal page headings
    'heading.pageOverview': 'Your Hostel Overview',
    'heading.pageRooms': 'Room Management',
    'heading.pageStudents': 'Student Management',
    'heading.pageRent': 'Rent Overview',
    'heading.pageComplaints': 'Complaints & Maintenance',
    'heading.pageNotices': 'Notices & Announcements',
    'heading.pageEnquiries': 'Room Enquiries',
    'heading.pageExpenses': 'Monthly Expenses',
    'heading.pageSettings': 'Hostel Settings',

    // Important dashboard & portal section headings
    'heading.sectionIncomeExpenses': '6-Month Income and Expenses',
    'heading.sectionRecentDues': 'Students Who Have Not Paid Rent',
    'heading.sectionMoveOuts': 'Upcoming Move-Outs (On Notice)',
    'heading.sectionBedMap': 'Visual Bed-Map',
    'heading.sectionMonthlyPnl': 'Monthly Income and Expenses',
    'heading.sectionExpenseLedger': 'Expense Ledger',
    'heading.sectionHostelRules': 'Hostel Details & Rent Rules',
    'heading.sectionTenantInvoices': 'My Rent Invoices & Receipts',
    'heading.sectionTenantNotices': 'Property Notices',
    'heading.sectionTenantComplaints': 'My Complaints & Updates',
    'heading.pageTenantDashboard': 'Resident Dashboard',
    'heading.pageTenantRoom': 'My Room & Stay Details',
    'heading.pageTenantPayments': 'Rent & Payment History',
    'heading.pageTenantComplaints': 'My Complaints',
    'heading.pageTenantNotices': 'Hostel Notices',
    'heading.pageTenantProfile': 'My Profile & KYC',
    'heading.pageAccountSettings': 'Account & Security Settings',
    'heading.sectionNeedsAttention': 'Needs Attention',
    'heading.sectionFinancialSummary': 'Monthly Money Summary',
    'heading.pagePastHostels': 'Past Hostels',
  },
  te: {
    // Homepage main headings
    'heading.hero': 'PGDesk తో మీ హాస్టల్‌ను సులభంగా నిర్వహించండి',
    'heading.featuresSection': 'మీ హాస్టల్ నడపడానికి కావలసినవన్నీ',
    'heading.featureStudents': 'విద్యార్థుల నిర్వహణ',
    'heading.featureRooms': 'గదుల నిర్వహణ',
    'heading.featureRent': 'అద్దె లెక్కలు',
    'heading.featureComplaints': 'ఫిర్యాదుల నిర్వహణ',
    'heading.demoSection': 'PGDesk ఎలా పనిచేస్తుందో చూడండి',
    'heading.howItWorksSection': 'PGDesk ను ఎలా ప్రారంభించాలి',
    'heading.freeToUseSection': 'మీ హాస్టల్‌ను ఉచితంగా నిర్వహించడం ప్రారంభించండి',
    'heading.listingsSection': 'PGDesk లో ఉన్న హాస్టళ్లు',
    'heading.faqSection': 'సాధారణ ప్రశ్నలు',
    'heading.finalCtaSection': 'ఈరోజే మీ హాస్టల్ నిర్వహణను సులభం చేసుకోండి',

    // Main dashboard & portal page headings
    'heading.pageOverview': 'మీ హాస్టల్ వివరాలు',
    'heading.pageRooms': 'గదుల నిర్వహణ',
    'heading.pageStudents': 'విద్యార్థుల నిర్వహణ',
    'heading.pageRent': 'అద్దె వివరాలు',
    'heading.pageComplaints': 'ఫిర్యాదుల నిర్వహణ',
    'heading.pageNotices': 'నోటీసులు',
    'heading.pageEnquiries': 'గది విచారణలు',
    'heading.pageExpenses': 'నెలవారీ ఖర్చులు',
    'heading.pageSettings': 'హాస్టల్ సెట్టింగ్స్',

    // Important dashboard & portal section headings
    'heading.sectionIncomeExpenses': '6 నెలల ఆదాయం & ఖర్చులు',
    'heading.sectionRecentDues': 'బాకీ ఉన్న అద్దె వివరాలు',
    'heading.sectionMoveOuts': 'ఖాళీ చేయనున్న విద్యార్థులు',
    'heading.sectionBedMap': 'గదులు & బెడ్ల స్థితి',
    'heading.sectionMonthlyPnl': 'నెలవారీ ఆదాయం & ఖర్చులు',
    'heading.sectionExpenseLedger': 'ఖర్చుల జాబితా',
    'heading.sectionHostelRules': 'హాస్టల్ వివరాలు & అద్దె నియమాలు',
    'heading.sectionTenantInvoices': 'నా అద్దె వివరాలు & రసీదులు',
    'heading.sectionTenantNotices': 'హాస్టల్ నోటీసులు',
    'heading.sectionTenantComplaints': 'నా ఫిర్యాదులు & అప్‌డేట్లు',
    'heading.pageTenantDashboard': 'విద్యార్థి డ్యాష్‌బోర్డ్',
    'heading.pageTenantRoom': 'నా గది వివరాలు',
    'heading.pageTenantPayments': 'అద్దె & చెల్లింపుల వివరాలు',
    'heading.pageTenantComplaints': 'నా ఫిర్యాదులు',
    'heading.pageTenantNotices': 'హాస్టల్ నోటీసులు',
    'heading.pageTenantProfile': 'నా ప్రొఫైల్ & KYC',
    'heading.pageAccountSettings': 'ఖాతా & సెక్యూరిటీ సెట్టింగ్స్',
    'heading.sectionNeedsAttention': 'తక్షణ పనులు',
    'heading.sectionFinancialSummary': 'నెలవారీ ఆదాయ వ్యయాలు',
    'heading.pagePastHostels': 'పాత హాస్టళ్లు',
  },
} as const;

export type HeadingTranslationKey = keyof typeof HEADING_TRANSLATIONS.en;

export function translateHeading(lang: LanguageCode, key: HeadingTranslationKey): string {
  const dict = HEADING_TRANSLATIONS[lang];
  if (dict && typeof dict[key] === 'string' && dict[key].length > 0) {
    return dict[key];
  }
  return HEADING_TRANSLATIONS.en[key];
}

export function isValidLanguageCode(value: unknown): value is LanguageCode {
  return value === 'en' || value === 'te';
}

export function resolveInitialLanguage(stored: unknown): LanguageCode {
  return isValidLanguageCode(stored) ? stored : 'en';
}

export function shouldShowLanguagePrompt(stored: unknown): boolean {
  return !isValidLanguageCode(stored);
}

export function readStoredLanguage(): LanguageCode | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    const raw = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isValidLanguageCode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredLanguage(lang: LanguageCode): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Ignore storage errors in private browsing or restricted contexts
  }
}
