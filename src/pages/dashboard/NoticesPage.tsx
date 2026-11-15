import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Pencil, Pin, Plus, Trash2, X } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import { detectPotentiallyOutdatedNoticeDate } from '../../lib/dashboardHelpers';
import { formatDateIN } from '../../lib/format';

interface NoticeItem {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  propertyId: number | null;
  propertyName: string;
  createdByName: string;
  createdAt: string;
}

export function NoticesPage() {
  const { tHeading } = useLanguage();
  const { showToast } = useToast();
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [properties, setProperties] = useState<Array<{ id: number; name: string }>>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<NoticeItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', propertyId: '', pinned: false });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [nRes, pRes] = await Promise.all([
        apiFetch<{ notices: NoticeItem[] }>('/api/notices'),
        apiFetch<{ properties: Array<{ id: number; name: string }> }>('/api/properties'),
      ]);
      setNotices(nRes.notices);
      setProperties(pRes.properties);
    } catch (err: any) {
      showToast(err.message || 'Failed to load notices', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setEditingNotice(null);
    setForm({ title: '', body: '', propertyId: '', pinned: false });
    setModalOpen(true);
  };

  const openEditModal = (n: NoticeItem) => {
    setEditingNotice(n);
    setForm({
      title: n.title,
      body: n.body,
      propertyId: n.propertyId ? String(n.propertyId) : '',
      pinned: n.pinned,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        body: form.body,
        propertyId: form.propertyId ? Number(form.propertyId) : null,
        pinned: form.pinned,
      };
      if (editingNotice) {
        await apiFetch(`/api/notices/${editingNotice.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('Notice updated');
      } else {
        await apiFetch('/api/notices', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Notice published to students');
      }
      setModalOpen(false);
      setEditingNotice(null);
      setForm({ title: '', body: '', propertyId: '', pinned: false });
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to save notice', 'error');
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (n: NoticeItem) => {
    try {
      await apiFetch(`/api/notices/${n.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned: !n.pinned }),
      });
      showToast(n.pinned ? 'Notice unpinned' : 'Notice pinned to top');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Could not update pin state', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/api/notices/${deleteId}`, { method: 'DELETE' });
      showToast('Notice removed');
      setDeleteId(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete notice', 'error');
    }
  };

  return (
    <DashboardLayout
      title={tHeading('heading.pageNotices')}
      breadcrumb="Home / Notices"
      actions={
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Publish Notice</span>
        </button>
      }
    >
      {notices.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          No notices published yet. Click Publish Notice to send an announcement to your hostels.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {notices.map((n) => {
            const dateWarning = detectPotentiallyOutdatedNoticeDate(n.title, n.body, n.createdAt);
            return (
              <div
                key={n.id}
                className={`flex flex-col justify-between rounded-xl border p-5 ${
                  n.pinned
                    ? 'border-teal-600/50 bg-teal-50/20 dark:border-teal-500/50 dark:bg-teal-950/20'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
                        {n.propertyName} · {formatDateIN(n.createdAt)} {n.pinned ? '· Pinned' : ''}
                      </p>
                      <h2 className="mt-1 font-display text-base font-semibold text-slate-900 dark:text-white">
                        {n.title}
                      </h2>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(n)}
                        aria-label={`Edit ${n.title}`}
                        title="Edit Notice"
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePin(n)}
                        aria-label={n.pinned ? `Unpin ${n.title}` : `Pin ${n.title}`}
                        title={n.pinned ? 'Unpin Notice' : 'Pin Notice'}
                        className={`rounded p-1.5 ${
                          n.pinned
                            ? 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-400'
                            : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(n.id)}
                        aria-label={`Delete ${n.title}`}
                        title="Delete Notice"
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{n.body}</p>

                  {dateWarning && (
                    <div className="mt-3 flex items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
                        <span>{dateWarning}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditModal(n)}
                        className="shrink-0 font-semibold text-amber-900 underline hover:no-underline dark:text-amber-200"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>

                <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  Posted by {n.createdByName}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleSave}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-4">
              <h3 className="font-display text-lg font-semibold">
                {editingNotice ? 'Edit Notice' : 'Publish Notice'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setEditingNotice(null);
                }}
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium">Target Hostel</label>
                <select
                  value={form.propertyId}
                  onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">All Hostels</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium">Title</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Announcement Message</label>
                <textarea
                  required
                  rows={4}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.pinned}
                  onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                />
                <span>Pin notice to top of Student Portal</span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setEditingNotice(null);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {saving ? 'Saving...' : editingNotice ? 'Save Changes' : 'Publish Notice'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete Notice?"
        description="This announcement will be removed from both the dashboard and student portals."
        confirmLabel="Delete Notice"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </DashboardLayout>
  );
}

