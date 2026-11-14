import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import { formatDateIN } from '../../lib/format';

interface ComplaintItem {
  id: number;
  title: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  description: string;
  propertyName: string;
  tenantName: string;
  tenantPhone: string;
  assignedToUserId: number | null;
  assignedToName: string | null;
  createdAt: string;
  comments: Array<{
    id: number;
    authorName: string;
    authorRole: string;
    body: string;
    createdAt: string;
  }>;
}

interface StaffOption {
  id: number;
  name: string;
  role: string;
}

export function ComplaintsPage() {
  const { showToast } = useToast();
  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'>('ALL');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');

  const loadComplaints = useCallback(async () => {
    try {
      const res = await apiFetch<{ complaints: ComplaintItem[]; staff: StaffOption[] }>('/api/complaints');
      setComplaints(res.complaints);
      setStaff(res.staff);
      if (res.complaints.length > 0 && !activeId) {
        setActiveId(res.complaints[0].id);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load complaints', 'error');
    }
  }, [activeId, showToast]);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  const filtered = complaints.filter((c) => statusFilter === 'ALL' || c.status === statusFilter);
  const active = complaints.find((c) => c.id === activeId) || filtered[0] || null;

  const updateComplaint = async (
    id: number,
    patch: { status?: string; assignedToUserId?: number | null }
  ) => {
    try {
      await apiFetch(`/api/complaints/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      showToast('Ticket updated');
      await loadComplaints();
    } catch (err: any) {
      showToast(err.message || 'Update failed', 'error');
    }
  };

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || !commentText.trim()) return;
    try {
      await apiFetch(`/api/complaints/${active.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: commentText }),
      });
      setCommentText('');
      await loadComplaints();
    } catch (err: any) {
      showToast(err.message || 'Could not post comment', 'error');
    }
  };

  return (
    <DashboardLayout
      title="Complaints & Maintenance"
      breadcrumb="Dashboard / Complaints"
      actions={
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              {st === 'ALL' ? 'All' : st.replace('_', ' ')}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-5">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              No complaints in this view.
            </div>
          ) : (
            filtered.map((c) => {
              const selected = active?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    selected
                      ? 'border-teal-700 bg-white dark:border-teal-500 dark:bg-slate-900'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-teal-700 dark:text-teal-400">
                      {c.category} · {c.priority}
                    </span>
                    <span className="font-mono text-slate-500">{c.status}</span>
                  </div>
                  <p className="mt-1.5 font-medium text-slate-900 dark:text-white">{c.title}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {c.tenantName} · {c.propertyName} · {formatDateIN(c.createdAt)}
                  </p>
                </button>
              );
            })
          )}
        </div>

        <div className="lg:col-span-7">
          {active ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start dark:border-slate-800">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {active.propertyName} · Raised by {active.tenantName} ({active.tenantPhone})
                  </p>
                  <h2 className="mt-1 font-display text-xl font-semibold text-slate-900 dark:text-white">
                    {active.title}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="Complaint status"
                    value={active.status}
                    onChange={(e) => updateComplaint(active.id, { status: e.target.value })}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="RESOLVED">Resolved</option>
                  </select>
                  <select
                    aria-label="Assign staff member"
                    value={active.assignedToUserId ?? ''}
                    onChange={(e) =>
                      updateComplaint(active.id, {
                        assignedToUserId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="">Unassigned</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {active.description}
              </p>

              <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Resolution Thread ({active.comments.length})</span>
                </h3>
                <div className="mt-3 space-y-3">
                  {active.comments.map((cm) => (
                    <div
                      key={cm.id}
                      className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950"
                    >
                      <div className="flex justify-between font-medium text-slate-700 dark:text-slate-300">
                        <span>
                          {cm.authorName} · {cm.authorRole}
                        </span>
                        <span className="text-slate-400">{formatDateIN(cm.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-slate-600 dark:text-slate-400">{cm.body}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={postComment} className="mt-4 flex gap-2">
                  <input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add staff update or response to resident..."
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Reply</span>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              Select a complaint ticket to view details and post updates.
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
