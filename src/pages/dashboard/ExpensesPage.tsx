import React, { useCallback, useEffect, useState } from 'react';
import { Download, Plus, X } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import { formatDateIN, formatINR } from '../../lib/format';

interface ExpenseRow {
  id: number;
  propertyId: number;
  propertyName: string;
  category: string;
  amount: number;
  expenseDate: string;
  vendor: string;
  note: string;
}

interface PnlRow {
  monthKey: string;
  label: string;
  revenue: number;
  expenses: number;
  netProfit: number;
}

export function ExpensesPage() {
  const { showToast } = useToast();
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [pnl, setPnl] = useState<PnlRow[]>([]);
  const [properties, setProperties] = useState<Array<{ id: number; name: string }>>([]);
  const [propertyFilter, setPropertyFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const [form, setForm] = useState({
    propertyId: 0,
    category: 'ELECTRICITY',
    amount: 0,
    expenseDate: new Date().toISOString().slice(0, 10),
    vendor: '',
    note: '',
  });

  const loadData = useCallback(async () => {
    try {
      const qs = propertyFilter ? `?propertyId=${propertyFilter}` : '';
      const [eRes, pRes] = await Promise.all([
        apiFetch<{ expenses: ExpenseRow[]; pnl: PnlRow[] }>(`/api/expenses${qs}`),
        apiFetch<{ properties: Array<{ id: number; name: string }> }>('/api/properties'),
      ]);
      setExpenses(eRes.expenses);
      setPnl(eRes.pnl);
      setProperties(pRes.properties);
      if (pRes.properties.length > 0) {
        setForm((f) => ({ ...f, propertyId: f.propertyId || pRes.properties[0].id }));
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load expenses', 'error');
    }
  }, [propertyFilter, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      showToast('Expense logged');
      setShowAdd(false);
      setForm((f) => ({ ...f, amount: 0, vendor: '', note: '' }));
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Could not log expense', 'error');
    }
  };

  return (
    <DashboardLayout
      title="Expenses & Monthly P&L"
      breadcrumb="Dashboard / Expenses & Reports"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter expenses by property"
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">All Properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <a
            href="/api/reports/pnl.csv"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export P&amp;L CSV</span>
          </a>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Log Expense</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Monthly P&L Summary */}
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="font-display text-base font-semibold">Monthly Profit &amp; Loss Summary</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                <tr>
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3 text-right">Rent Collected</th>
                  <th className="px-4 py-3 text-right">Operating Expenses</th>
                  <th className="px-4 py-3 text-right">Net Operating Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pnl.map((row) => (
                  <tr key={row.monthKey}>
                    <td className="px-4 py-3 font-medium">{row.label}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-teal-700 dark:text-teal-400">
                      {formatINR(row.revenue)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {formatINR(row.expenses)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${
                        row.netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {formatINR(row.netProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expense Ledger */}
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="font-display text-base font-semibold">Expense Ledger</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Vendor &amp; Note</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {expenses.map((exp) => (
                  <tr key={exp.id}>
                    <td className="px-4 py-3 text-xs tabular-nums">{formatDateIN(exp.expenseDate)}</td>
                    <td className="px-4 py-3 text-xs">{exp.propertyName}</td>
                    <td className="px-4 py-3 text-xs font-medium">{exp.category.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {exp.vendor ? `${exp.vendor} · ` : ''}
                      {exp.note}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                      {formatINR(exp.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleAdd}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-4">
              <h3 className="font-display text-lg font-semibold">Log Property Expense</h3>
              <button type="button" onClick={() => setShowAdd(false)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium">Property</label>
                <select
                  value={form.propertyId}
                  onChange={(e) => setForm({ ...form, propertyId: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="ELECTRICITY">Electricity</option>
                    <option value="WATER">Water</option>
                    <option value="FOOD_KITCHEN">Food &amp; Kitchen</option>
                    <option value="STAFF_SALARY">Staff Salary</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="INTERNET">Internet</option>
                    <option value="HOUSEKEEPING">Housekeeping</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium">Date</label>
                  <input
                    type="date"
                    required
                    value={form.expenseDate}
                    onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium">Amount (₹)</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={form.amount || ''}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Vendor</label>
                <input
                  value={form.vendor}
                  onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                  placeholder="e.g., BESCOM / Plumber"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Note</label>
                <input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white">
                Save Expense
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
