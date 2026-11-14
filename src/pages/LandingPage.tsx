import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Moon, Sun } from 'lucide-react';
import { ImageWithFallback } from '../components/ui/ImageWithFallback';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../lib/api';
import { formatINR } from '../lib/format';

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

const CAPABILITIES = [
  {
    num: '01.',
    title: 'Visual Floor & Bed-Map',
    summary:
      'See every floor, room, and bed status at a glance. Assign residents, reserve incoming bookings, or flag maintenance beds without hunting through spreadsheets.',
    outcome: 'Zero double-booked beds across properties',
  },
  {
    num: '02.',
    title: 'Automated Rent & Pro-Rata Billing',
    summary:
      'Run fixed 1st-of-month or individual join-date rent cycles. Mid-month joins and notice-period exits compute exact daily pro-rata amounts automatically.',
    outcome: 'Generate monthly & FY GST invoices in 1 click',
  },
  {
    num: '03.',
    title: 'UPI Reconciliation & WhatsApp Reminders',
    summary:
      'Residents view your PG UPI ID in their portal and submit UTR numbers for approval. Send one-click prefilled WhatsApp payment reminders with PDF receipts.',
    outcome: 'Cut rent follow-up time by 75%',
  },
  {
    num: '04.',
    title: 'Public PG Listings & Lead Pipeline',
    summary:
      'Every property gets an SEO-indexed public page showing live vacant bed counts, room tariffs, rules, and a spam-protected tour enquiry form.',
    outcome: 'Turn vacant beds into booked visits',
  },
];

const PRICING_TIERS = [
  {
    name: 'Starter PG',
    audience: 'For single-building owners up to 35 beds',
    price: '₹999',
    cadence: 'per month',
    features: [
      '1 property · up to 35 beds',
      'Visual bed-map & tenant KYC vault',
      'Automated monthly & pro-rata invoices',
      'PDF rent receipts & WhatsApp links',
    ],
    cta: 'Start Free Trial',
    highlighted: false,
  },
  {
    name: 'Growth Operator',
    audience: 'For multi-branch PG businesses up to 200 beds',
    price: '₹2,499',
    cadence: 'per month',
    features: [
      'Up to 5 properties · 200 beds',
      'Manager RBAC & property assignments',
      'Tenant self-service portal & UPI queue',
      'Complaints, notices & monthly P&L CSV',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise Co-Living',
    audience: 'For large student housing & co-living portfolios',
    price: '₹5,999',
    cadence: 'per month',
    features: [
      'Unlimited properties & beds',
      'Custom domain public PG listings',
      'Full audit logs & multi-manager workflows',
      'Priority onboarding & data migration',
    ],
    cta: 'Start Free Trial',
    highlighted: false,
  },
];

const FAQS = [
  {
    q: 'Can we run fixed 1st-of-month billing on one PG and join-date billing on another?',
    a: 'Yes. Billing mode is configurable per property, and pro-rata rent calculations handle mid-month move-ins and notice-period move-outs automatically.',
  },
  {
    q: 'Do tenants need to pay online through a gateway?',
    a: 'No gateway commissions are required. Residents pay via your existing UPI ID (GPay, PhonePe, Paytm) or Cash and upload their UTR reference for one-click owner approval.',
  },
  {
    q: 'Are tenant Aadhaar and ID documents kept private?',
    a: 'Yes. Uploaded KYC documents are stored behind authenticated role-checked endpoints and are never exposed in public buckets or public PG listing pages.',
  },
  {
    q: 'Can property managers access billing or delete properties?',
    a: 'Role permissions are enforced on the server. Managers handle daily beds, tenants, rent collection, complaints, and notices for assigned properties, while owners retain full control over settings, staff, and property deletion.',
  },
];

export function LandingPage() {
  const [listings, setListings] = useState<PublicPropertyCard[]>([]);
  const { logout, user, darkMode, toggleDarkMode } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch<{ properties: PublicPropertyCard[] }>('/api/public/properties')
      .then((res) => setListings(res.properties))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 dark:text-white"
          >
            PGDesk
          </Link>

          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            <a href="#capabilities" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-white">
              Capabilities
            </a>
            <a href="#listings" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-white">
              Live Listings
            </a>
            <a href="#pricing" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-white">
              Pricing
            </a>
            <a href="#faq" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-white">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => navigate(user.role === 'TENANT' ? '/tenant' : '/dashboard')}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
              >
                Open Workspace
              </button>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Sign In
                </Link>
                <Link
                  to="/login?mode=register"
                  className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
                >
                  Start Free Trial
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-7xl px-4 pt-12 pb-16 sm:px-6 lg:px-8 lg:pt-16">
        <div className="grid items-stretch gap-10 lg:grid-cols-12">
          <div className="flex flex-col justify-center lg:col-span-6">
            <p className="text-xs font-semibold tracking-wide text-teal-700 dark:text-teal-400">
              Built for Indian PG &amp; Co-Living Operators
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-slate-900 text-balance sm:text-5xl dark:text-white">
              Run every bed, rent cycle, and resident request from one desk.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
              Replace WhatsApp rent spreadsheets and paper registers with a visual floor-by-floor bed-map,
              automated pro-rata INR invoicing, UPI reference tracking, a resident portal, and public PG
              listing pages.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {user ? (
                <>
                  <button
                    type="button"
                    onClick={() => navigate(user.role === 'TENANT' ? '/tenant' : '/dashboard')}
                    className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
                  >
                    <span>Open Workspace</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await logout();
                      showToast('Logged out successfully');
                    }}
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Log Out ({user.name})
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login?mode=register"
                    className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
                  >
                    <span>Start Free Trial</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Sign In
                  </Link>
                </>
              )}
            </div>

            <div className="mt-10 grid grid-cols-3 gap-6 border-t border-slate-200 pt-6 dark:border-slate-800">
              <div>
                <p className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">FY GST</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">PDF Tax Invoices</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">Auto</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pro-Rata &amp; Late-Fee Rules</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">0%</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">UPI Gateway Fee</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative h-full min-h-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-900">
              <ImageWithFallback
                src="/src/assets/images/hero_pg_coliving_1794584162558.jpg"
                alt="Modern Indian co-living common study lounge and sunlit residence"
                className="h-full w-full object-cover"
                fallbackTitle="PGDesk Co-Living Residence"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent p-6 text-white">
                <p className="text-xs font-medium text-teal-300">
                  Unified Co-Living Operations · Pan-India
                </p>
                <p className="mt-1 font-display text-lg font-semibold">
                  Automated rent collection &amp; real-time bed-map visibility
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities Section */}
      <section id="capabilities" className="border-t border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 text-balance dark:text-white">
              Operational clarity built around how Indian PGs actually run.
            </h2>
            <p className="mt-3 text-base text-slate-600 dark:text-slate-400">
              From security deposit settlement to wardens logging plumbing fixes on their phone.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {CAPABILITIES.map((cap) => (
              <div
                key={cap.num}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-6 dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <p className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">
                    {cap.num}
                  </p>
                  <h3 className="mt-2 font-display text-xl font-semibold text-slate-900 dark:text-white">
                    {cap.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {cap.summary}
                  </p>
                </div>
                <p className="mt-5 border-t border-slate-200 pt-3 text-xs font-medium text-slate-700 dark:border-slate-800 dark:text-slate-300">
                  Outcome · {cap.outcome}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Public Listings Showcase */}
      <section id="listings" className="border-t border-slate-200 py-16 dark:border-slate-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Public PG Listing Pages
              </h2>
              <p className="mt-2 text-base text-slate-600 dark:text-slate-400">
                Every property publishes live bed availability, room tariffs, and a tour enquiry funnel.
              </p>
            </div>
          </div>

          {listings.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                No public PG properties are published yet.
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Create an owner workspace to publish your PG listing with live vacant bed counts.
              </p>
              <Link
                to="/login?mode=register"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
              >
                <span>Start Free Trial</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
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
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {pg.genderType === 'BOYS' ? 'Boys Residence' : pg.genderType === 'GIRLS' ? 'Girls Residence' : 'Co-Ed'} · {pg.locality}, {pg.city} · {pg.vacantBeds} vacant beds
                    </p>
                    <h3 className="mt-2 font-display text-xl font-semibold text-slate-900 dark:text-white">
                      {pg.name}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
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
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap dark:bg-teal-700 dark:hover:bg-teal-800"
                      >
                        View Listing
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="border-t border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Transparent pricing in INR. No per-transaction rent fees.
            </h2>
            <p className="mt-2 text-base text-slate-600 dark:text-slate-400">
              Start your free trial workspace and onboard properties in minutes.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`flex flex-col justify-between rounded-xl border p-6 ${
                  tier.highlighted
                    ? 'border-teal-700 bg-white shadow-sm dark:border-teal-500 dark:bg-slate-900'
                    : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60'
                }`}
              >
                <div>
                  <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                    {tier.name}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{tier.audience}</p>
                  <div className="mt-5 flex items-baseline gap-1.5">
                    <span className="font-mono text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                      {tier.price}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{tier.cadence}</span>
                  </div>
                  <ul className="mt-6 space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
                    {tier.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  to="/login?mode=register"
                  className={`mt-8 block w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                    tier.highlighted
                      ? 'bg-teal-700 text-white hover:bg-teal-800'
                      : 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="border-t border-slate-200 py-16 dark:border-slate-800">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Frequently Asked Questions
          </h2>
          <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {FAQS.map((item) => (
              <div key={item.q} className="py-5">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">{item.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-xs text-slate-500 sm:flex-row sm:px-6 lg:px-8 dark:text-slate-400">
          <p>© 2026 PGDesk · Paying Guest &amp; Co-Living Operations Platform</p>
          <div className="flex items-center gap-5">
            <Link to="/login" className="hover:text-slate-900 dark:hover:text-white">
              Owner &amp; Tenant Sign In
            </Link>
            <button
              type="button"
              onClick={toggleDarkMode}
              className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white"
            >
              {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
