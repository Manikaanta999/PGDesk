import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, MessageCircle, Phone, UserPlus } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import { formatEnquiryStage } from '../../lib/dashboardHelpers';
import { formatDateIN, formatIndianPhone } from '../../lib/format';

interface EnquiryItem {
  id: number;
  propertyId: number;
  propertyName: string;
  name: string;
  phone: string | null;
  email: string | null;
  preferredRoomType: string;
  moveInDate: string | null;
  message: string;
  status: 'NEW_ENQUIRY' | 'CONTACTED' | 'APPROVED' | 'REJECTED' | 'CONVERTED_TO_STUDENT';
  notes: string;
  createdAt: string;
}

const STAGES: EnquiryItem['status'][] = [
  'NEW_ENQUIRY',
  'CONTACTED',
  'APPROVED',
  'CONVERTED_TO_STUDENT',
  'REJECTED',
];

export function LeadsPage() {
  const navigate = useNavigate();
  const { tHeading } = useLanguage();
  const { showToast } = useToast();
  const [enquiries, setEnquiries] = useState<EnquiryItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [draftNotes, setDraftNotes] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const loadEnquiries = useCallback(async () => {
    try {
      const res = await apiFetch<{ enquiries: EnquiryItem[] }>('/api/enquiries');
      setEnquiries(res.enquiries);
      const map: Record<number, string> = {};
      res.enquiries.forEach((e) => {
        map[e.id] = e.notes;
      });
      setDraftNotes(map);
    } catch (err: any) {
      showToast(err.message || 'Failed to load enquiries', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadEnquiries();
  }, [loadEnquiries]);

  const stageCounts = useMemo(() => {
    const counts: Record<EnquiryItem['status'], number> = {
      NEW_ENQUIRY: 0,
      CONTACTED: 0,
      APPROVED: 0,
      CONVERTED_TO_STUDENT: 0,
      REJECTED: 0,
    };
    enquiries.forEach((e) => {
      counts[e.status] = (counts[e.status] || 0) + 1;
    });
    return counts;
  }, [enquiries]);

  const saveLeadUpdate = async (
    id: number,
    status: EnquiryItem['status'],
    notes: string,
    message = 'Enquiry updated'
  ) => {
    if (savingId === id) return;
    setSavingId(id);
    try {
      await apiFetch(`/api/enquiries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, notes }),
      });
      showToast(message);
      await loadEnquiries();
    } catch (err: any) {
      showToast(err.message || 'Update failed', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const buildWhatsAppLeadUrl = (lead: EnquiryItem) => {
    if (!lead.phone) return '';
    const cleanPhone = lead.phone.replace(/\D/g, '').slice(-10);
    if (!cleanPhone) return '';
    const text = `Hello ${lead.name}, thank you for enquiring about ${lead.propertyName}. Let us know when you would like to visit the hostel.`;
    return `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(text)}`;
  };

  const visible = enquiries.filter((e) => statusFilter === 'ALL' || e.status === statusFilter);

  return (
    <DashboardLayout
      title={tHeading('heading.pageEnquiries')}
      breadcrumb="Home / Room Enquiries"
      actions={
        <select
          aria-label="Filter enquiries by stage"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="ALL">All Stages ({enquiries.length})</option>
          {STAGES.map((st) => (
            <option key={st} value={st}>
              {formatEnquiryStage(st)} ({stageCounts[st]})
            </option>
          ))}
        </select>
      }
    >
      <div className="space-y-6">
        {/* 5 Stage Count Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STAGES.map((stage) => {
            const active = statusFilter === stage;
            return (
              <button
                key={stage}
                type="button"
                onClick={() => setStatusFilter((prev) => (prev === stage ? 'ALL' : stage))}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? 'border-teal-700 bg-teal-50/40 dark:border-teal-500 dark:bg-teal-950/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {formatEnquiryStage(stage)}
                </p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {stageCounts[stage]}
                </p>
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            No enquiries in this stage. Public hostel enquiries appear here automatically.
          </div>
        ) : (
          <div className="space-y-4">
            {visible.map((lead) => {
              const isSaving = savingId === lead.id;
              return (
                <div
                  key={lead.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
                        {lead.propertyName} · {lead.preferredRoomType} Sharing · Received {formatDateIN(lead.createdAt)}
                      </p>
                      <h2 className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-white">
                        {lead.name}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {lead.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            <span>{formatIndianPhone(lead.phone)}</span>
                          </span>
                        )}
                        {lead.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" />
                            <span>{lead.email}</span>
                          </span>
                        )}
                        {!lead.phone && !lead.email && <span>No contact provided</span>}
                        {lead.moveInDate && <span>· Target move-in: {formatDateIN(lead.moveInDate)}</span>}
                      </div>
                      {lead.message && (
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{lead.message}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {lead.phone && (
                        <>
                          <a
                            href={`tel:${lead.phone}`}
                            aria-label={`Call ${lead.name}`}
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            <span>Call</span>
                          </a>
                          <a
                            href={buildWhatsAppLeadUrl(lead)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`WhatsApp ${lead.name}`}
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <MessageCircle className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                            <span>WhatsApp</span>
                          </a>
                        </>
                      )}
                      {lead.status !== 'CONVERTED_TO_STUDENT' && lead.status !== 'REJECTED' && (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() =>
                            navigate(
                              `/dashboard/tenants?new=1&enquiryId=${lead.id}&name=${encodeURIComponent(lead.name)}&phone=${encodeURIComponent(lead.phone || '')}&email=${encodeURIComponent(lead.email || '')}&propertyId=${lead.propertyId}`
                            )
                          }
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          <span>Approve &amp; Create Student</span>
                        </button>
                      )}
                      <select
                        aria-label={`Pipeline stage for ${lead.name}`}
                        disabled={isSaving}
                        value={lead.status}
                        onChange={(e) =>
                          saveLeadUpdate(lead.id, e.target.value as any, draftNotes[lead.id] ?? lead.notes)
                        }
                        className="min-h-[38px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950"
                      >
                        {STAGES.map((st) => (
                          <option key={st} value={st}>
                            {formatEnquiryStage(st)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row dark:border-slate-800">
                    <input
                      value={draftNotes[lead.id] ?? ''}
                      onChange={(e) => setDraftNotes({ ...draftNotes, [lead.id]: e.target.value })}
                      placeholder="Add follow-up notes or visit time..."
                      className="min-h-[38px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => saveLeadUpdate(lead.id, lead.status, draftNotes[lead.id] ?? '', 'Follow-up note saved')}
                      className="min-h-[38px] rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {isSaving ? 'Saving...' : 'Save Note'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

