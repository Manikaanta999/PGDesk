import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Phone } from 'lucide-react';
import { SUPPORT_CONTACT_CONFIG } from '../config/marketing';

interface InfoShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

function InfoShell({ title, subtitle, children }: InfoShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            to="/"
            className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-white"
          >
            PGDesk
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              Login
            </Link>
            <Link
              to="/login?mode=register"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Start Free
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:underline dark:text-teal-400"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Home</span>
        </Link>

        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          {title}
        </h1>
        <p className="mt-2 text-base text-slate-600 dark:text-slate-400">{subtitle}</p>

        <div className="mt-8 space-y-6 rounded-xl border border-slate-200 bg-white p-6 text-base leading-relaxed text-slate-700 sm:p-8 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          {children}
        </div>
      </main>
    </div>
  );
}

export function AboutPage() {
  return (
    <InfoShell
      title="About PGDesk"
      subtitle="A simple digital hostel register built for Indian hostel and PG owners."
    >
      <p>
        Many hostels and PGs still keep student names, room numbers, monthly rent payments, and repair notes inside
        paper notebooks. When a student asks about past rent or a bed becomes empty, checking old pages takes time.
      </p>
      <p>
        PGDesk puts all of those daily hostel records into one simple website that works on both your mobile phone and
        your computer. You can add your hostels, check empty or occupied beds, save student details, track Cash and UPI
        rent payments, and follow up on complaints without complicated steps.
      </p>
      <p>
        PGDesk is currently free to use so hostel owners can start right away without paying a monthly subscription.
      </p>
    </InfoShell>
  );
}

export function ContactPage() {
  const hasEmail = Boolean(SUPPORT_CONTACT_CONFIG.email);
  const hasPhone = Boolean(SUPPORT_CONTACT_CONFIG.phone);

  return (
    <InfoShell
      title="Contact Us"
      subtitle="Need help setting up your hostel or student records on PGDesk?"
    >
      <p>
        PGDesk is designed so hostel owners and students can manage everything directly from their browser.
      </p>
      {(hasEmail || hasPhone) ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
          {hasPhone && (
            <div className="flex items-center gap-2.5 text-base">
              <Phone className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              <span className="font-medium">Support Phone:</span>
              <span className="font-mono">{SUPPORT_CONTACT_CONFIG.phone}</span>
            </div>
          )}
          {hasEmail && (
            <div className="flex items-center gap-2.5 text-base">
              <Mail className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              <span className="font-medium">Support Email:</span>
              <a
                href={`mailto:${SUPPORT_CONTACT_CONFIG.email}`}
                className="font-mono text-teal-700 hover:underline dark:text-teal-400"
              >
                {SUPPORT_CONTACT_CONFIG.email}
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          <p className="font-semibold text-slate-900 dark:text-white">How to get help</p>
          <p className="mt-1">
            If you are a student, please sign in to your Student Portal or contact your hostel warden directly using
            the phone number listed on your hostel page. If you are a hostel owner, sign in and check your Hostel
            Settings page.
          </p>
        </div>
      )}
      <div className="pt-2">
        <Link
          to="/login?mode=register"
          className="inline-flex items-center rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Create Free Account
        </Link>
      </div>
    </InfoShell>
  );
}

export function PrivacyPolicyPage() {
  return (
    <InfoShell
      title="Privacy Policy"
      subtitle="How PGDesk handles your hostel, student, and payment records."
    >
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          1. Information Saved in Your Hostel Register
        </h2>
        <p className="mt-1">
          PGDesk stores the hostel, room, student, rent payment, and complaint details that hostel owners, managers, and
          students enter into their accounts.
        </p>
      </div>
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          2. Private Access to Student &amp; ID Records
        </h2>
        <p className="mt-1">
          Student mobile numbers, rent records, and uploaded ID documents are kept private inside the hostel&apos;s
          signed-in account. Public hostel pages only display general hostel info, room rent, and vacant bed counts.
        </p>
      </div>
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          3. No Sale of Hostel Data
        </h2>
        <p className="mt-1">
          We do not sell your student lists, phone numbers, or rent history to third parties.
        </p>
      </div>
    </InfoShell>
  );
}

export function TermsPage() {
  return (
    <InfoShell
      title="Terms and Conditions"
      subtitle="Simple terms for using the PGDesk digital hostel register."
    >
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          1. Current Free Access
        </h2>
        <p className="mt-1">
          PGDesk is currently free to use for managing hostels, rooms, students, rent payments, and complaints. Optional
          paid features may be offered in the future, and any future pricing will be shared clearly before activation.
        </p>
      </div>
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          2. Account Responsibility
        </h2>
        <p className="mt-1">
          Hostel owners and managers are responsible for keeping their login password safe and verifying student details
          and rent receipts recorded in their account.
        </p>
      </div>
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          3. Rent &amp; UPI Payments
        </h2>
        <p className="mt-1">
          PGDesk helps record Cash and UPI payments and generate receipts. All rent money goes directly from the student
          to the hostel owner&apos;s UPI ID or cash counter.
        </p>
      </div>
    </InfoShell>
  );
}
