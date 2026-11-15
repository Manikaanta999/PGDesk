import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, MessageSquare, Send } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import {
  formatComplaintCategory,
  formatComplaintStatus,
  formatPriorityLabel,
} from '../../lib/dashboardHelpers';
import { formatDateIN, formatIndianPhone } from '../../lib/format';

interface ComplaintItem {
  id: number;
  title: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  description: string;
  propertyName: string;
  roomNumber?: string;
  bedLabel?: string;
  tenantName: string;
  tenantPhone: string | null;
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
  const { tHeading } = useLanguage();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const urlStatus = String(searchParams.get('status') || '').toUpperCase();
  const urlId = Number(searchParams.get('id') || 0);
  const initialStatus: 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' =
    urlStatus === 'OPEN' || urlStatus === 'IN_PROGRESS' || urlStatus === 'RESOLVED' ? urlStatus : 'ALL';

  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'>(initialStatus);
  const [activeId, setActiveId] = useState<number | null>(urlId > 0 ? urlId : null);
  const [commentText, setCommentText] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [postingComment, setPostingComment] = useState(false);
  const detailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (urlStatus === 'OPEN' || urlStatus === 'IN_PROGRESS' || urlStatus === 'RESOLVED' || urlStatus === 'ALL') {
      setStatusFilter(urlStatus);
    }
    if (urlId > 0) {
      setActiveId(urlId);
    }
  }, [urlStatus, urlId]);

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

  const counts = useMemo(
    () => ({
      OPEN: complaints.filter((c) => c.status === 'OPEN').length,
      IN_PROGRESS: complaints.filter((c) => c.status === 'IN_PROGRESS').length,
      RESOLVED: complaints.filter((c) => c.status === 'RESOLVED').length,
    }),
    [complaints]
  );

  const filtered = complaints.filter((c) => statusFilter === 'ALL' || c.status === statusFilter);
  const active = filtered.find((c) => c.id === activeId) || filtered[0] || null;

  const handleSelectComplaint = (id: number) => {
    setActiveId(id);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setTimeout(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  const updateComplaint = async (
    id: number,
    patch: { status?: string; assignedToUserId?: number | null },
    successMessage = 'Complaint updated'
  ) => {
    if (updatingId === id) return;
    setUpdatingId(id);
    try {
      await apiFetch(`/api/complaints/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      showToast(successMessage);
      await loadComplaints();
    } catch (err: any) {
      showToast(err.message || 'Update failed', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || !commentText.trim() || postingComment) return;
    setPostingComment(true);
    try {
      await apiFetch(`/api/complaints/${active.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: commentText }),
      });
      setCommentText('');
      showToast('Reply sent to student');
      await loadComplaints();
    } catch (err: any) {
      showToast(err.message || 'Could not post comment', 'error');
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <DashboardLayout
      title={tHeading('heading.pageComplaints')}
      breadcrumb="Home / Complaints"
      actions={
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`min-h-[34px] rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              {st === 'ALL' ? 'All' : formatComplaintStatus(st)}
            </button>
          ))}
        </div>
      }
    >
      <div className="space-y-6">
        {/* 3 Summary Cards */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === 'OPEN' ? 'ALL' : 'OPEN'))}
            className={`rounded-xl border p-4 text-left transition-colors ${
              statusFilter === 'OPEN'
                ? 'border-red-500 bg-red-50/40 dark:border-red-700 dark:bg-red-950/20'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Open</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
              {counts.OPEN}
            </p>
            <p className="mt-0.5 hidden text-xs text-slate-500 sm:block dark:text-slate-400">Needs attention</p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS'))}
            className={`rounded-xl border p-4 text-left transition-colors ${
              statusFilter === 'IN_PROGRESS'
                ? 'border-amber-500 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-950/20'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">In Progress</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {counts.IN_PROGRESS}
            </p>
            <p className="mt-0.5 hidden text-xs text-slate-500 sm:block dark:text-slate-400">Work started</p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === 'RESOLVED' ? 'ALL' : 'RESOLVED'))}
            className={`rounded-xl border p-4 text-left transition-colors ${
              statusFilter === 'RESOLVED'
                ? 'border-emerald-600 bg-emerald-50/40 dark:border-emerald-700 dark:bg-emerald-950/20'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Resolved</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {counts.RESOLVED}
            </p>
            <p className="mt-0.5 hidden text-xs text-slate-500 sm:block dark:text-slate-400">Completed</p>
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-5">
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                No complaints in this view.
              </div>
            ) : (
              filtered.map((c) => {
                const selected = active?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectComplaint(c.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                      selected
                        ? 'border-teal-700 bg-teal-50/30 dark:border-teal-500 dark:bg-slate-900'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-teal-700 dark:text-teal-400">
                        {formatComplaintCategory(c.category)} · {formatPriorityLabel(c.priority)} Priority
                      </span>
                      <span
                        className={`font-semibold ${
                          c.status === 'RESOLVED'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : c.status === 'IN_PROGRESS'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {formatComplaintStatus(c.status)}
                      </span>
                    </div>
                    <p className="mt-1.5 font-medium text-slate-900 dark:text-white">{c.title}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {c.tenantName}
                      {c.roomNumber ? ` · Room ${c.roomNumber}` : ''}
                      {c.bedLabel ? ` (${c.bedLabel})` : ''} · {c.propertyName} · {formatDateIN(c.createdAt)}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          <div ref={detailRef} className="lg:col-span-7">
            {active ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start dark:border-slate-800">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {active.propertyName}
                      {active.roomNumber ? ` · Room ${active.roomNumber}` : ''}
                      {active.bedLabel ? ` (${active.bedLabel})` : ''} · Raised by {active.tenantName} (
                      {formatIndianPhone(active.tenantPhone)})
                    </p>
                    <h2 className="mt-1 font-display text-xl font-semibold text-slate-900 dark:text-white">
                      {active.title}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {formatComplaintCategory(active.category)} · {formatPriorityLabel(active.priority)} Priority ·{' '}
                      {formatComplaintStatus(active.status)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {active.status !== 'RESOLVED' && (
                      <button
                        type="button"
                        disabled={updatingId === active.id}
                        onClick={() =>
                          updateComplaint(active.id, { status: 'RESOLVED' }, 'Complaint marked as resolved')
                        }
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>{updatingId === active.id ? 'Updating...' : 'Mark Resolved'}</span>
                      </button>
                    )}
                    <select
                      aria-label="Complaint status"
                      disabled={updatingId === active.id}
                      value={active.status}
                      onChange={(e) => updateComplaint(active.id, { status: e.target.value })}
                      className="min-h-[38px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="OPEN">Open</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="RESOLVED">Resolved</option>
                    </select>
                    <select
                      aria-label="Assign staff member"
                      disabled={updatingId === active.id}
                      value={active.assignedToUserId ?? ''}
                      onChange={(e) =>
                        updateComplaint(active.id, {
                          assignedToUserId: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className="min-h-[38px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-950"
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
                    <span>Updates &amp; Replies ({active.comments.length})</span>
                  </h3>
                  <div className="mt-3 space-y-3">
                    {active.comments.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        No updates posted yet. Send a quick update below.
                      </p>
                    ) : (
                      active.comments.map((cm) => (
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
                      ))
                    )}
                  </div>

                  <form onSubmit={postComment} className="mt-4 flex gap-2">
                    <input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Add staff update or reply to student..."
                      className="min-h-[40px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-950"
                    />
                    <button
                      type="submit"
                      disabled={postingComment || !commentText.trim()}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{postingComment ? 'Sending...' : 'Reply'}</span>
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                Select a complaint to view details and post updates.
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

