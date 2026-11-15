import React, { useState } from 'react';
import { ImagePlus, MessageSquare, Plus, Send, X } from 'lucide-react';
import { AuthorizedImage } from '../../components/ui/AuthorizedImage';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import { formatDateIN } from '../../lib/format';
import { formatPriorityLabel } from '../../lib/dashboardHelpers';
import {
  formatStudentComplaintCategory,
  STUDENT_COMPLAINT_CATEGORIES,
} from '../../lib/studentPortalHelpers';
import { TenantComplaintRow, TenantOverviewResponse } from './types';

interface TenantComplaintsTabProps {
  data: TenantOverviewResponse;
  onRefresh: () => Promise<void>;
  onOpenNewComplaint: () => void;
}

function getStudentComplaintStatusLabel(status: string): string {
  switch (status) {
    case 'RESOLVED':
      return 'Resolved';
    case 'IN_PROGRESS':
      return 'In Progress';
    default:
      return 'Pending';
  }
}

export function TenantComplaintsTab({ data, onRefresh, onOpenNewComplaint }: TenantComplaintsTabProps) {
  const { tHeading } = useLanguage();
  const { showToast } = useToast();

  const [selectedComplaint, setSelectedComplaint] = useState<TenantComplaintRow | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const openCount = data.complaints.filter((c) => c.status === 'OPEN').length;
  const inProgressCount = data.complaints.filter((c) => c.status === 'IN_PROGRESS').length;
  const resolvedCount = data.complaints.filter((c) => c.status === 'RESOLVED').length;

  const activeComplaint = selectedComplaint
    ? data.complaints.find((c) => c.id === selectedComplaint.id) || selectedComplaint
    : null;

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeComplaint || commentBody.trim().length < 2) return;
    setPostingComment(true);
    try {
      await apiFetch(`/api/tenant/complaints/${activeComplaint.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      setCommentBody('');
      showToast('Reply sent to hostel management');
      await onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Could not post reply', 'error');
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {tHeading('heading.pageTenantComplaints')}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Report water, electricity, room maintenance, cleaning, food, or internet issues and track updates.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenNewComplaint}
          className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Raise Complaint</span>
        </button>
      </div>

      {/* Status Summary Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">Pending</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
            {openCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">In Progress</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {inProgressCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">Resolved</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {resolvedCount}
          </p>
        </div>
      </div>

      {/* Complaints List */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="font-display text-base font-semibold">{tHeading('heading.sectionTenantComplaints')}</h2>
        </div>

        {data.complaints.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">No complaints raised yet.</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Need something fixed in your room or common area? Tap Raise Complaint above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.complaints.map((c) => (
              <div
                key={c.id}
                className="flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-teal-700 dark:text-teal-400">
                      {formatStudentComplaintCategory(c.category)}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500 dark:text-slate-400">{formatPriorityLabel(c.priority)}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500 dark:text-slate-400">{formatDateIN(c.createdAt)}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{c.title}</p>
                  <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{c.description}</p>
                  {c.comments.length > 0 && (
                    <p className="inline-flex items-center gap-1 pt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      <MessageSquare className="h-3 w-3" />
                      <span>{c.comments.length} update(s)</span>
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`text-xs font-semibold ${
                      c.status === 'RESOLVED'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : c.status === 'IN_PROGRESS'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {getStudentComplaintStatusLabel(c.status)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedComplaint(c)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Complaint Details Modal */}
      {activeComplaint && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                  {formatStudentComplaintCategory(activeComplaint.category)} ·{' '}
                  {formatPriorityLabel(activeComplaint.priority)} ·{' '}
                  {getStudentComplaintStatusLabel(activeComplaint.status)}
                </p>
                <h3 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
                  {activeComplaint.title}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Submitted {formatDateIN(activeComplaint.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedComplaint(null)}
                aria-label="Close complaint details"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {activeComplaint.description}
              </div>

              {activeComplaint.photoUrl && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400">Attached Photo</p>
                  <AuthorizedImage
                    src={activeComplaint.photoUrl}
                    alt={activeComplaint.title}
                    className="max-h-56 w-full rounded-lg border border-slate-200 object-contain dark:border-slate-800"
                  />
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Owner &amp; Resident Updates
                </h4>
                <div className="mt-2 space-y-2">
                  {activeComplaint.comments.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">No replies yet.</p>
                  ) : (
                    activeComplaint.comments.map((cm) => (
                      <div
                        key={cm.id}
                        className="rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {cm.authorName} ({cm.authorRole === 'TENANT' ? 'You' : 'Hostel Management'})
                          </span>
                          {cm.createdAt && (
                            <span className="text-[11px] text-slate-400">{formatDateIN(cm.createdAt)}</span>
                          )}
                        </div>
                        <p className="mt-1 text-slate-600 dark:text-slate-300">{cm.body}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {activeComplaint.status === 'RESOLVED' ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                  This complaint is marked Resolved and closed. Raise a new complaint if you face the issue again.
                </div>
              ) : (
                <form onSubmit={handleAddComment} className="flex gap-2 pt-2">
                  <input
                    required
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Add a follow-up message..."
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={postingComment || commentBody.trim().length < 2}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{postingComment ? 'Sending...' : 'Reply'}</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface RaiseComplaintModalProps {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}

export function RaiseComplaintModal({ open, onClose, onSubmitted }: RaiseComplaintModalProps) {
  const { showToast } = useToast();
  const [selectedLabel, setSelectedLabel] = useState<string>('Water');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const selectedCategoryObj =
    STUDENT_COMPLAINT_CATEGORIES.find((c) => c.label === selectedLabel) || STUDENT_COMPLAINT_CATEGORIES[0];

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const base64Data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      const res = await apiFetch<{ file: { url: string } }>('/api/files/upload', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'image/jpeg',
          base64Data,
          folder: 'complaints',
        }),
      });
      setPhotoUrl(res.file.url);
      showToast('Photo attached to complaint');
    } catch (err: any) {
      showToast(err.message || 'Could not upload photo', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/api/tenant/complaints', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          category: selectedCategoryObj.value,
          priority,
          description: description.trim(),
          photoUrl: photoUrl || null,
        }),
      });
      showToast('Complaint submitted to hostel management');
      setTitle('');
      setDescription('');
      setPhotoUrl('');
      onClose();
      await onSubmitted();
    } catch (err: any) {
      showToast(err.message || 'Could not submit complaint', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between pb-4">
          <h3 className="font-display text-lg font-semibold">Raise Maintenance Complaint</h3>
          <button type="button" onClick={onClose} aria-label="Close complaint modal">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium">Complaint Title *</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Washroom tap leaking"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium">Category</label>
              <select
                value={selectedLabel}
                onChange={(e) => setSelectedLabel(e.target.value)}
                className={inputClass}
              >
                {STUDENT_COMPLAINT_CATEGORIES.map((c) => (
                  <option key={c.label} value={c.label}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={inputClass}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium">Details *</label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the problem and room area..."
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-medium">Attach Photo (Optional)</label>
            <div className="mt-1 flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                <ImagePlus className="h-3.5 w-3.5" />
                <span>{uploading ? 'Uploading...' : photoUrl ? 'Change Photo' : 'Upload Image'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
              {photoUrl && <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Attached</span>}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || uploading}
            className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {submitting ? 'Submitting...' : 'Submit Complaint'}
          </button>
        </div>
      </form>
    </div>
  );
}
