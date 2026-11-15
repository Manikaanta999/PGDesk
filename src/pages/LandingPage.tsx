import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BedDouble,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  IndianRupee,
  Menu,
  Moon,
  Play,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { ImageWithFallback } from '../components/ui/ImageWithFallback';
import { LanguagePreferencePrompt } from '../components/ui/LanguagePreferencePrompt';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { DEMO_VIDEO_CONFIG, HERO_VISUAL_CONFIG, SUPPORT_CONTACT_CONFIG } from '../config/marketing';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../lib/api';
import { formatINR } from '../lib/format';
import { parseDemoVideoSource } from '../lib/videoConfig';

interface PublicPropertyCard {
  id: number;
  name: string;
  slug: string;
  address: string;
  locality: string;
  city: string;
  genderType: 'BOYS' | 'GIRLS' | 'COED';
  amenities: string[];
  photos: string[];
  description: string;
  totalBeds: number;
  vacantBeds: number;
  minRent: number;
  maxRent: number;
}

const WALKTHROUGH_STEPS = [
  {
    step: 'Step 1 of 3',
    title: 'Add Your Hostel & Rooms',
    description:
      'Enter your hostel name, floors, room numbers, and beds. You can see immediately which beds are empty and which are taken.',
    previewRows: [
      { left: 'Room 101 · Bed A', right: 'Taken (Ramesh K.)', tone: 'text-slate-700 dark:text-slate-200' },
      { left: 'Room 101 · Bed B', right: 'Empty Bed', tone: 'text-emerald-700 dark:text-emerald-400' },
      { left: 'Room 102 · Bed A', right: 'Taken (Suresh V.)', tone: 'text-slate-700 dark:text-slate-200' },
    ],
  },
  {
    step: 'Step 2 of 3',
    title: 'Save Student Details in One Place',
    description:
      'Store each student’s name, phone number, join date, and monthly rent without flipping through paper registers.',
    previewRows: [
      { left: 'Kiran Kumar · Room 101', right: '98480 11223', tone: 'text-slate-700 dark:text-slate-200' },
      { left: 'Sai Charan · Room 103', right: '98480 44556', tone: 'text-slate-700 dark:text-slate-200' },
      { left: 'Manoj Reddy · Room 104', right: 'Joined 01/11/2026', tone: 'text-teal-700 dark:text-teal-400' },
    ],
  },
  {
    step: 'Step 3 of 3',
    title: 'Check Rent Payments & Complaints',
    description:
      'See who paid rent by Cash or UPI, send a quick reminder on WhatsApp, and track room repair requests until solved.',
    previewRows: [
      { left: 'November Rent · Kiran', right: 'Paid (UPI)', tone: 'text-emerald-700 dark:text-emerald-400' },
      { left: 'November Rent · Suresh', right: 'Pending ₹6,500', tone: 'text-amber-700 dark:text-amber-400' },
      { left: 'Room 102 · Fan Repair', right: 'Fixed', tone: 'text-teal-700 dark:text-teal-400' },
    ],
  },
];

const HOW_TO_START_STEPS = [
  {
    number: '1',
    title: 'Create Your Account',
    description: 'Sign up with your name, mobile number, and hostel name in one minute.',
  },
  {
    number: '2',
    title: 'Add Your Hostel',
    description: 'Add your hostel building, floors, room numbers, and how many beds are in each room.',
  },
  {
    number: '3',
    title: 'Add Your Students',
    description: 'Assign beds to students and start checking monthly rent payments and complaints.',
  },
];

const FREE_BENEFITS = [
  'Add your hostels, floors, rooms, and beds',
  'Save student details and room assignments',
  'Check monthly rent payments (Cash and UPI)',
  'Track student complaints until fixed',
  'Track hostel income and expenses',
];

export function LandingPage() {
  const [listings, setListings] = useState<PublicPropertyCard[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [videoActive, setVideoActive] = useState(false);
  const [walkthroughIndex, setWalkthroughIndex] = useState(0);

  const { logout, user, darkMode, toggleDarkMode } = useAuth();
  const { tHeading } = useLanguage();
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch<{ properties: PublicPropertyCard[] }>('/api/public/properties')
      .then((res) => setListings(res.properties))
      .catch(() => {});
  }, []);

  const parsedVideo = parseDemoVideoSource(DEMO_VIDEO_CONFIG.videoUrl);

  const helpAnswer = (() => {
    const parts: string[] = [];
    if (SUPPORT_CONTACT_CONFIG.phone) {
      parts.push(`Call or message us at ${SUPPORT_CONTACT_CONFIG.phone}`);
    }
    if (SUPPORT_CONTACT_CONFIG.email) {
      parts.push(`email ${SUPPORT_CONTACT_CONFIG.email}`);
    }
    if (parts.length > 0) {
      return `You can reach our help desk via ${parts.join(' or ')}. You can also check our Contact page anytime.`;
    }
    return 'Visit our Contact page for help instructions. Hostel owners can also manage details from Hostel Settings, and students can contact their warden from the Student Portal.';
  })();

  const faqs = [
    {
      q: 'Is PGDesk really free?',
      a: 'Yes. PGDesk is free to use currently for managing your hostels, rooms, students, rent payments, and complaints. Optional premium features may be introduced in the future.',
    },
    {
      q: 'Do I need computer knowledge to use PGDesk?',
      a: 'No. If you know how to use WhatsApp on a smartphone, you can use PGDesk easily. Everything is written in clear, simple English.',
    },
    {
      q: 'Can I use PGDesk on my mobile phone?',
      a: 'Yes. PGDesk works directly in the web browser on your Android phone, iPhone, tablet, or computer without installing anything.',
    },
    {
      q: 'Are my student details safe?',
      a: 'Yes. Your student list, mobile numbers, rent records, and uploaded ID documents are private inside your password-protected account.',
    },
    {
      q: 'Can I manage multiple hostels?',
      a: 'Yes. You can add multiple hostel buildings under one owner account and check rooms, students, and rent for each hostel separately.',
    },
    {
      q: 'Who can I contact for help?',
      a: helpAnswer,
    },
  ];

  const activeStep = WALKTHROUGH_STEPS[walkthroughIndex];

  return (
    <div id="top" className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Simple Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="font-display text-2xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 dark:text-white"
          >
            PGDesk
          </Link>

          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-7 text-base font-medium text-slate-700 dark:text-slate-200"
          >
            <a
              href="#top"
              className="hover:text-teal-700 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-teal-400"
            >
              Home
            </a>
            <a
              href="#how-it-works"
              className="hover:text-teal-700 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-teal-400"
            >
              How It Works
            </a>
            <a
              href="#demo-video"
              className="hover:text-teal-700 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-teal-400"
            >
              Watch Demo
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0 sm:gap-2.5">
            <LanguageSwitcher compact />
            {user ? (
              <button
                type="button"
                onClick={() => navigate(user.role === 'TENANT' ? '/tenant' : '/dashboard')}
                className="hidden sm:inline-flex min-h-[44px] items-center rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
              >
                Open Hostel
              </button>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden sm:inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Login
                </Link>
                <Link
                  to="/login?mode=register"
                  className="hidden sm:inline-flex min-h-[44px] items-center rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
                >
                  Start Free
                </Link>
              </>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 md:hidden dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Drawer */}
        {mobileMenuOpen && (
          <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden dark:border-slate-800 dark:bg-slate-950">
            <nav aria-label="Mobile Navigation" className="flex flex-col gap-2">
              <a
                href="#top"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-base font-medium text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Home
              </a>
              <a
                href="#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-base font-medium text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                How It Works
              </a>
              <a
                href="#demo-video"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-base font-medium text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Watch Demo
              </a>
              {!user && (
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-base font-medium text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  Login
                </Link>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Language
                </span>
                <LanguageSwitcher compact />
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-7xl px-4 pt-10 pb-14 sm:px-6 lg:px-8 lg:pt-16 lg:pb-20">
        <div className="grid items-center gap-10 lg:grid-cols-12">
          <div className="flex flex-col justify-center lg:col-span-6">
            <p className="text-sm font-semibold tracking-wide text-teal-700 dark:text-teal-400">
              Free to use currently · Simple Digital Hostel Register
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-slate-900 text-balance sm:text-5xl dark:text-white">
              {tHeading('heading.hero')}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
              Keep student details, room information, rent payments and complaints in one simple place. No more searching through registers and notebooks.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              {user ? (
                <>
                  <button
                    type="button"
                    onClick={() => navigate(user.role === 'TENANT' ? '/tenant' : '/dashboard')}
                    className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-teal-700 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
                  >
                    <span>Open Hostel</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await logout();
                      showToast('Logged out successfully');
                    }}
                    className="inline-flex min-h-[48px] items-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Logout ({user.name})
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login?mode=register"
                    className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-teal-700 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
                  >
                    <span>Start Using Free</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <a
                    href="#demo-video"
                    className="inline-flex min-h-[48px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Play className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                    <span>Watch How It Works</span>
                  </a>
                </>
              )}
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 border-t border-slate-200 pt-6 sm:grid-cols-3 dark:border-slate-800">
              <div>
                <p className="text-base font-bold text-slate-900 dark:text-white">Room Status</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Empty &amp; occupied beds</p>
              </div>
              <div>
                <p className="text-base font-bold text-slate-900 dark:text-white">Check Rent Payments</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Cash &amp; UPI records</p>
              </div>
              <div>
                <p className="text-base font-bold text-slate-900 dark:text-white">Mobile &amp; Computer</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Works in any browser</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="aspect-16/9 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 shadow-xs lg:aspect-auto lg:h-[420px] dark:border-slate-800 dark:bg-slate-900">
              <ImageWithFallback
                src={HERO_VISUAL_CONFIG.imageUrl}
                alt={HERO_VISUAL_CONFIG.alt}
                className="h-full w-full object-cover"
                fallbackTitle="PGDesk Digital Hostel Register"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Four Large Visual Feature Cards */}
      <section className="border-t border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 text-balance dark:text-white">
              {tHeading('heading.featuresSection')}
            </h2>
            <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">
              Simple tools made for daily hostel work — clear screens without confusing software words.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {/* Card 1: Manage Students */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-7 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold text-slate-900 dark:text-white">
                  {tHeading('heading.featureStudents')}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-slate-600 dark:text-slate-300">
                  Add students and save their details easily. Keep mobile numbers, join dates, and ID copies ready in one place.
                </p>
              </div>
              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 font-medium dark:border-slate-800">
                  <span>Kiran Kumar</span>
                  <span className="text-slate-500">Room 101 · Bed A</span>
                </div>
                <div className="flex items-center justify-between pt-2 font-medium">
                  <span>Manoj Reddy</span>
                  <span className="text-slate-500">Room 104 · Bed B</span>
                </div>
              </div>
            </div>

            {/* Card 2: Manage Rooms */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-7 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400">
                  <BedDouble className="h-6 w-6" />
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold text-slate-900 dark:text-white">
                  {tHeading('heading.featureRooms')}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-slate-600 dark:text-slate-300">
                  See which rooms and beds are empty or occupied. Know right away when a bed becomes free for a new student.
                </p>
              </div>
              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 font-medium dark:border-slate-800">
                  <span>Room 101 · Bed A</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Occupied</span>
                </div>
                <div className="flex items-center justify-between pt-2 font-medium">
                  <span>Room 101 · Bed B</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">Empty Bed</span>
                </div>
              </div>
            </div>

            {/* Card 3: Track Rent */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-7 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400">
                  <IndianRupee className="h-6 w-6" />
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold text-slate-900 dark:text-white">
                  {tHeading('heading.featureRent')}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-slate-600 dark:text-slate-300">
                  Know who paid rent and who still needs to pay. Record Cash or UPI rent payments and save receipts.
                </p>
              </div>
              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 font-medium dark:border-slate-800">
                  <span>Ramesh K. · ₹7,000</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">Paid (UPI)</span>
                </div>
                <div className="flex items-center justify-between pt-2 font-medium">
                  <span>Suresh V. · ₹6,500</span>
                  <span className="font-semibold text-amber-700 dark:text-amber-400">Pending</span>
                </div>
              </div>
            </div>

            {/* Card 4: Manage Complaints */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-7 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400">
                  <ClipboardList className="h-6 w-6" />
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold text-slate-900 dark:text-white">
                  {tHeading('heading.featureComplaints')}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-slate-600 dark:text-slate-300">
                  Keep track of hostel maintenance and student problems. Mark repairs like fan, tap, or Wi-Fi fixes as done.
                </p>
              </div>
              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 font-medium dark:border-slate-800">
                  <span>Room 203 · Bathroom Tap Leak</span>
                  <span className="font-semibold text-amber-700 dark:text-amber-400">Open</span>
                </div>
                <div className="flex items-center justify-between pt-2 font-medium">
                  <span>Room 102 · Ceiling Fan Repair</span>
                  <span className="font-semibold text-teal-700 dark:text-teal-400">Fixed</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Demo Video Section */}
      <section id="demo-video" className="border-t border-slate-200 py-16 dark:border-slate-800">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {tHeading('heading.demoSection')}
            </h2>
            <p className="mt-2 text-lg text-slate-600 dark:text-slate-400">
              See how easy hostel management can be.
            </p>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-sm dark:border-slate-800">
            <div className="relative aspect-16/9 w-full">
              {!videoActive ? (
                <>
                  <ImageWithFallback
                    src={DEMO_VIDEO_CONFIG.thumbnailUrl}
                    alt={DEMO_VIDEO_CONFIG.thumbnailAlt}
                    className="h-full w-full object-cover"
                    fallbackTitle="PGDesk Product Walkthrough"
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/45 p-6 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setWalkthroughIndex(0);
                        setVideoActive(true);
                      }}
                      aria-label="Play PGDesk demo video"
                      className="inline-flex min-h-[56px] items-center gap-3 rounded-xl bg-teal-700 px-6 py-3.5 text-base font-semibold text-white shadow-lg transition-colors hover:bg-teal-800"
                    >
                      <Play className="h-5 w-5 fill-current" />
                      <span>Play Product Demo</span>
                    </button>
                    <p className="mt-3 text-sm font-medium text-white">
                      Click to see how PGDesk works step by step
                    </p>
                  </div>
                </>
              ) : parsedVideo.type === 'mp4' ? (
                <video
                  src={parsedVideo.src}
                  controls
                  autoPlay
                  playsInline
                  className="h-full w-full bg-black object-cover"
                />
              ) : parsedVideo.type === 'embed' ? (
                <iframe
                  src={parsedVideo.src}
                  title={DEMO_VIDEO_CONFIG.heading}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              ) : (
                <div className="flex h-full w-full flex-col justify-between bg-slate-900 p-5 text-white sm:p-8">
                  <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-teal-400 uppercase">
                        {activeStep.step}
                      </p>
                      <h3 className="mt-1 font-display text-xl font-bold sm:text-2xl">
                        {activeStep.title}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVideoActive(false)}
                      aria-label="Close demo preview"
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-700 px-3.5 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
                    >
                      <X className="h-4 w-4" />
                      <span>Close</span>
                    </button>
                  </div>

                  <div className="my-auto grid gap-6 py-4 md:grid-cols-12 md:items-center">
                    <div className="md:col-span-6">
                      <p className="text-base leading-relaxed text-slate-300">
                        {activeStep.description}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-white p-4 text-slate-900 md:col-span-6 dark:bg-slate-950 dark:text-slate-100">
                      <p className="border-b border-slate-200 pb-2 text-xs font-semibold text-slate-500 uppercase dark:border-slate-800">
                        PGDesk Screen Preview
                      </p>
                      <div className="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-800">
                        {activeStep.previewRows.map((row) => (
                          <div key={row.left} className="flex items-center justify-between py-2.5">
                            <span className="font-medium">{row.left}</span>
                            <span className={`font-semibold ${row.tone}`}>{row.right}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={walkthroughIndex === 0}
                        onClick={() => setWalkthroughIndex((i) => Math.max(0, i - 1))}
                        className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span>Previous</span>
                      </button>
                      <button
                        type="button"
                        disabled={walkthroughIndex === WALKTHROUGH_STEPS.length - 1}
                        onClick={() =>
                          setWalkthroughIndex((i) => Math.min(WALKTHROUGH_STEPS.length - 1, i + 1))
                        }
                        className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-40"
                      >
                        <span>Next Step</span>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                    <Link
                      to="/login?mode=register"
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                    >
                      <span>Create Free Account</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-base text-slate-600 dark:text-slate-400">
              Watch how easy it is to add your rooms, save student details, and check who has paid rent for the month.
            </p>
            <Link
              to="/login?mode=register"
              className="inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-lg bg-teal-700 px-6 py-3 text-base font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <span>Start Free</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* How to Start Section */}
      <section
        id="how-it-works"
        className="border-t border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900/50"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {tHeading('heading.howItWorksSection')}
            </h2>
            <p className="mt-2 text-lg text-slate-600 dark:text-slate-400">
              Three simple steps to move from paper notebooks to a clean digital register.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {HOW_TO_START_STEPS.map((step) => (
              <div
                key={step.number}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-7 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-teal-700 font-display text-xl font-bold text-white">
                  {step.number}
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold text-slate-900 dark:text-white">
                  {step.title}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-slate-600 dark:text-slate-300">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Free To Use Section */}
      <section id="free-to-use" className="border-t border-slate-200 py-16 dark:border-slate-800">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-7 sm:p-10 dark:border-slate-800 dark:bg-slate-900">
            <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-7">
                <p className="text-sm font-semibold text-teal-700 dark:text-teal-400">
                  Free to use currently
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {tHeading('heading.freeToUseSection')}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-300">
                  You can use PGDesk free right now to manage your hostel rooms, students, rent payments, and complaints. Optional premium features may be introduced in the future.
                </p>
                <div className="mt-7">
                  <Link
                    to="/login?mode=register"
                    className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-teal-700 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-teal-800"
                  >
                    <span>Create Free Account</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Included in Your Free Account
                </p>
                <ul className="mt-4 space-y-3 text-base text-slate-700 dark:text-slate-300">
                  {FREE_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2.5">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Public Hostels Directory (shown only when live listings exist) */}
      {listings.length > 0 && (
        <section id="listings" className="border-t border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                {tHeading('heading.listingsSection')}
              </h2>
              <p className="mt-2 text-base text-slate-600 dark:text-slate-400">
                Browse available rooms and vacant beds shared directly by hostel owners.
              </p>
            </div>

            <div className="mt-8 grid gap-6 md:grid-cols-2">
              {listings.map((pg) => (
                <div
                  key={pg.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="aspect-16/9 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <ImageWithFallback
                      src={pg.photos[0]}
                      alt={pg.name}
                      className="h-full w-full object-cover"
                      fallbackTitle={pg.name}
                    />
                  </div>
                  <div className="p-6">
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      {pg.genderType === 'BOYS'
                        ? 'Boys Hostel'
                        : pg.genderType === 'GIRLS'
                          ? 'Girls Hostel'
                          : 'Co-Ed Hostel'}{' '}
                      · {pg.locality}, {pg.city} · {pg.vacantBeds} empty beds
                    </p>
                    <h3 className="mt-2 font-display text-xl font-semibold text-slate-900 dark:text-white">
                      {pg.name}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-base text-slate-600 dark:text-slate-400">
                      {pg.description}
                    </p>
                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                      <div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">Starting from</span>
                        <p className="font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                          {formatINR(pg.minRent)}/mo
                        </p>
                      </div>
                      <Link
                        to={`/pg/${pg.slug}`}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                      >
                        <span>View Hostel</span>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Customer FAQ */}
      <section id="faq" className="border-t border-slate-200 py-16 dark:border-slate-800">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {tHeading('heading.faqSection')}
          </h2>
          <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {faqs.map((item) => (
              <div key={item.q} className="py-5">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{item.q}</h3>
                <p className="mt-2 text-base leading-relaxed text-slate-600 dark:text-slate-300">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final Call To Action */}
      <section className="border-t border-slate-200 bg-teal-700 py-14 text-white dark:border-slate-800">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {tHeading('heading.finalCtaSection')}
          </h2>
          <p className="mt-3 text-lg text-teal-100">
            Join PGDesk and manage your hostel from one place.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/login?mode=register"
              className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-white px-6 py-3 text-base font-semibold text-teal-900 transition-colors hover:bg-teal-50"
            >
              <span>Start Free</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex min-h-[48px] items-center rounded-lg border border-teal-300 bg-teal-800/40 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-teal-800"
            >
              Login
            </Link>
          </div>
        </div>
      </section>

      {/* Simple Footer */}
      <footer className="border-t border-slate-200 bg-white py-10 dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div>
              <Link to="/" className="font-display text-xl font-bold text-slate-900 dark:text-white">
                PGDesk
              </Link>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Simple Digital Hostel Register · Free to use currently
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 text-sm font-medium text-slate-600 dark:text-slate-300">
              <Link to="/about" className="hover:text-teal-700 dark:hover:text-teal-400">
                About
              </Link>
              <a href="#how-it-works" className="hover:text-teal-700 dark:hover:text-teal-400">
                How It Works
              </a>
              <Link to="/contact" className="hover:text-teal-700 dark:hover:text-teal-400">
                Contact
              </Link>
              <Link to="/privacy" className="hover:text-teal-700 dark:hover:text-teal-400">
                Privacy Policy
              </Link>
              <Link to="/terms" className="hover:text-teal-700 dark:hover:text-teal-400">
                Terms and Conditions
              </Link>
              <Link to="/login" className="hover:text-teal-700 dark:hover:text-teal-400">
                Owner Login
              </Link>
              <Link to="/login?role=tenant" className="hover:text-teal-700 dark:hover:text-teal-400">
                Tenant Login
              </Link>
              <LanguageSwitcher compact />
              <button
                type="button"
                onClick={toggleDarkMode}
                className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white"
              >
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
            </div>
          </div>
        </div>
      </footer>

      <LanguagePreferencePrompt />
    </div>
  );
}
