import { useCallback, useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import { formatDateIN, formatIndianPhone } from '../../lib/format';

interface EnquiryItem {
  id: number;
  propertyName: string;
  name: string;
  phone: string;
  email: string | null;
  preferredRoomType: string;
  moveInDate: string | null;
  message: string;
  status: 'NEW' | 'CONTACTED' | 'VISIT_SCHEDULED' | 'CONVERTED' | 'LOST';
  notes: string;
  createdAt: string;
}

export function LeadsPage() {
  const { showToast } = useToast();
  const [enquiries, setEnquiries] = useState<EnquiryItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [draftNotes, setDraftNotes] = useState<Record<number, string>>({});

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

  const saveLeadUpdate = async (id: number, status: EnquiryItem['status'], notes: string) => {
    try {
      await apiFetch(`/api/enquiries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, notes }),
      });
      showToast('Lead pipeline updated');
      await loadEnquiries();
    } catch (err: any) {
      showToast(err.message || 'Update failed', 'error');
    }
  };

  const visible = enquiries.filter((e) => statusFilter === 'ALL' || e.status === statusFilter);

  return (
    <DashboardLayout
      title="Enquiries & Lead Pipeline"
      breadcrumb="Dashboard / Leads"
      actions={
        <select
          aria-label="Filter leads by stage"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="ALL">All Stages ({enquiries.length})</option>
          <option value="NEW">New</option>
          <option value="CONTACTED">Contacted</option>
          <option value="VISIT_SCHEDULED">Visit Scheduled</option>
          <option value="CONVERTED">Converted</option>
          <option value="LOST">Lost</option>
        </select>
      }
    >
      {visible.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          No enquiries in this stage. Public PG listing enquiries appear here automatically.
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((lead) => (
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
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{formatIndianPhone(lead.phone)}</span>
                    {lead.moveInDate && <span>· Target move-in: {formatDateIN(lead.moveInDate)}</span>}
                  </p>
                  {lead.message && (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{lead.message}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <select
                    aria-label={`Pipeline stage for ${lead.name}`}
                    value={lead.status}
                    onChange={(e) =>
                      saveLeadUpdate(lead.id, e.target.value as any, draftNotes[lead.id] ?? lead.notes)
                    }
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="NEW">New</option>
                    <option value="CONTACTED">Contacted</option>
                    <option value="VISIT_SCHEDULED">Visit Scheduled</option>
                    <option value="CONVERTED">Converted</option>
                    <option value="LOST">Lost</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row dark:border-slate-800">
                <input
                  value={draftNotes[lead.id] ?? ''}
                  onChange={(e) => setDraftNotes({ ...draftNotes, [lead.id]: e.target.value })}
                  placeholder="Add follow-up notes or visit time..."
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={() => saveLeadUpdate(lead.id, lead.status, draftNotes[lead.id] ?? '')}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Save Note
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
