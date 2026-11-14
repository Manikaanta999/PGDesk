import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CheckCircle2, MapPin, Phone } from 'lucide-react';
import { ImageWithFallback } from '../components/ui/ImageWithFallback';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../lib/api';
import { formatIndianPhone, formatINR } from '../lib/format';
import { indianPhoneSchema } from '../lib/validation';

interface RoomSummary {
  roomType: string;
  minRent: number;
  vacantBeds: number;
  totalBeds: number;
  acAvailable: boolean;
}

interface PublicPropertyDetail {
  id: number;
  name: string;
  slug: string;
  address: string;
  locality: string;
  city: string;
  genderType: 'BOYS' | 'GIRLS' | 'COED';
  amenities: string[];
  photos: string[];
  rules: string[];
  contactName: string;
  contactPhone: string;
  description: string;
  totalBeds: number;
  vacantBeds: number;
  minRent: number;
  maxRent: number;
  roomSummary: RoomSummary[];
}

const formSchema = z.object({
  name: z.string().trim().min(2, 'Your name is required').max(100),
  phone: indianPhoneSchema,
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  preferredRoomType: z.enum(['SINGLE', 'DOUBLE', 'TRIPLE', 'DORM']),
  moveInDate: z.string().trim().max(32).optional(),
  message: z.string().trim().max(600),
  website: z.string().max(0).optional(),
});
type EnquiryFormValues = z.infer<typeof formSchema>;

export function PublicListingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [property, setProperty] = useState<PublicPropertyDetail | null>(null);
  const [orgName, setOrgName] = useState('PGDesk Partner');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { showToast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EnquiryFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      preferredRoomType: 'DOUBLE',
      moveInDate: '',
      message: '',
      website: '',
    },
  });

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    apiFetch<{ property: PublicPropertyDetail; organization: { name: string } | null; appUrl?: string }>(
      `/api/public/properties/${slug}`
    )
      .then((res) => {
        setProperty(res.property);
        if (res.organization?.name) setOrgName(res.organization.name);
        document.title = `${res.property.name} — ${res.property.city} | PGDesk`;
        const baseUrl = (res.appUrl || window.location.origin).replace(/\/$/, '');

        // Inject JSON-LD LodgingBusiness structured data for SEO
        const existing = document.getElementById('pg-jsonld');
        if (existing) existing.remove();
        const script = document.createElement('script');
        script.id = 'pg-jsonld';
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'LodgingBusiness',
          '@id': `${baseUrl}/pg/${res.property.slug}`,
          url: `${baseUrl}/pg/${res.property.slug}`,
          name: res.property.name,
          description: res.property.description,
          address: {
            '@type': 'PostalAddress',
            streetAddress: res.property.address,
            addressLocality: res.property.locality,
            addressRegion: res.property.city,
            addressCountry: 'IN',
          },
          telephone: res.property.contactPhone,
          priceRange: `${formatINR(res.property.minRent)} - ${formatINR(res.property.maxRent)}`,
        });
        document.head.appendChild(script);
      })
      .catch((err) => setError(err.message || 'Listing not found'))
      .finally(() => setLoading(false));
  }, [slug]);

  const onSubmit = async (values: EnquiryFormValues) => {
    if (!property) return;
    try {
      await apiFetch('/api/public/enquiries', {
        method: 'POST',
        body: JSON.stringify({ ...values, propertyId: property.id }),
      });
      setSubmitted(true);
      reset();
      showToast('Enquiry sent! Manager will contact you shortly.');
    } catch (err: any) {
      showToast(err.message || 'Could not submit enquiry', 'error');
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="mt-6 h-80 w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Listing Unavailable
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{error}</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to PGDesk
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <Link
            to="/"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-white"
          >
            PGDesk
          </Link>
          <span className="hidden text-xs font-medium text-slate-500 sm:inline dark:text-slate-400">
            Managed by {orgName}
          </span>
          <a
            href="#enquire"
            className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
          >
            Schedule Visit
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Listings
        </Link>

        <div className="mt-4 flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
              {property.genderType === 'BOYS'
                ? 'Boys PG Residence'
                : property.genderType === 'GIRLS'
                  ? 'Girls PG Residence'
                  : 'Co-Ed Residence'}{' '}
              · {property.vacantBeds} beds available now
            </p>
            <h1 className="mt-1.5 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
              {property.name}
            </h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
              <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
              <span>
                {property.address}, {property.locality}, {property.city}
              </span>
            </p>
          </div>
          <div className="text-left md:text-right">
            <p className="text-xs text-slate-500 dark:text-slate-400">Monthly Tariff Range</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {formatINR(property.minRent)} – {formatINR(property.maxRent)}
            </p>
          </div>
        </div>

        {/* Photo Gallery */}
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="aspect-16/10 overflow-hidden rounded-xl border border-slate-200 md:col-span-2 md:row-span-2 md:aspect-auto dark:border-slate-800">
            <ImageWithFallback
              src={property.photos[0]}
              alt={`${property.name} main view`}
              className="h-full w-full object-cover"
              fallbackTitle={property.name}
            />
          </div>
          {property.photos.slice(1, 5).map((photo, idx) => (
            <div
              key={idx}
              className="aspect-4/3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
            >
              <ImageWithFallback
                src={photo}
                alt={`${property.name} room ${idx + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>

        {/* Details + Enquiry Split */}
        <div className="mt-10 grid gap-8 lg:grid-cols-12">
          <div className="space-y-8 lg:col-span-7">
            <section>
              <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
                About the Residence
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {property.description}
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
                Room Options &amp; Live Availability
              </h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Sharing Type</th>
                      <th className="px-4 py-3">AC / Non-AC</th>
                      <th className="px-4 py-3 text-right">Monthly Rent</th>
                      <th className="px-4 py-3 text-right">Vacant Beds</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {property.roomSummary.map((r) => (
                      <tr key={r.roomType}>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {r.roomType.charAt(0) + r.roomType.slice(1).toLowerCase()} Sharing
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                          {r.acAvailable ? 'AC & Non-AC' : 'Non-AC'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                          From {formatINR(r.minRent)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-teal-700 dark:text-teal-400">
                          {r.vacantBeds} / {r.totalBeds}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
                Included Amenities
              </h2>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {property.amenities.map((a) => (
                  <div
                    key={a}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
                House Rules
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                {property.rules.map((rule) => (
                  <li key={rule} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Enquiry Form */}
          <div id="enquire" className="lg:col-span-5">
            <div className="sticky top-20 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Book a Visit or Request Bed Availability
              </h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Phone className="h-3.5 w-3.5" />
                <span>
                  {property.contactName} · {formatIndianPhone(property.contactPhone)}
                </span>
              </p>

              {submitted ? (
                <div className="mt-6 rounded-lg border border-teal-200 bg-teal-50 p-5 text-sm text-teal-900 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-200">
                  <p className="font-semibold">Enquiry Submitted Successfully</p>
                  <p className="mt-1 text-xs leading-relaxed">
                    Thank you! {property.contactName} will reach out on WhatsApp or phone to confirm your
                    visit slot.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmitted(false)}
                    className="mt-3 text-xs font-semibold underline"
                  >
                    Send another enquiry
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
                  {/* Honeypot field hidden from human users */}
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="hidden"
                    {...register('website')}
                  />

                  <div>
                    <label htmlFor="enq-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Full Name
                    </label>
                    <input
                      id="enq-name"
                      type="text"
                      placeholder="e.g., Rahul Sharma"
                      {...register('name')}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
                  </div>

                  <div>
                    <label htmlFor="enq-phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Mobile Number (WhatsApp)
                    </label>
                    <input
                      id="enq-phone"
                      type="tel"
                      placeholder="9845012345"
                      {...register('phone')}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="enq-room" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Room Preference
                      </label>
                      <select
                        id="enq-room"
                        {...register('preferredRoomType')}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      >
                        <option value="SINGLE">Single Room</option>
                        <option value="DOUBLE">Double Sharing</option>
                        <option value="TRIPLE">Triple Sharing</option>
                        <option value="DORM">Dorm</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="enq-date" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Move-in Date
                      </label>
                      <input
                        id="enq-date"
                        type="date"
                        {...register('moveInDate')}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="enq-msg" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Notes or Visit Time
                    </label>
                    <textarea
                      id="enq-msg"
                      rows={3}
                      placeholder="Preferred visit timing or questions..."
                      {...register('message')}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
                  >
                    {isSubmitting ? 'Submitting...' : 'Request Visit & Tariff Card'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
