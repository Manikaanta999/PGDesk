import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, Search, X } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch, downloadAuthorizedFile } from '../../lib/api';
import { formatExpenseCategory } from '../../lib/dashboardHelpers';
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

const EXPENSE_CATEGORIES = [
  'ELECTRICITY',
  'WATER',
  'FOOD_KITCHEN',
  'STAFF_SALARY',
  'MAINTENANCE',
  'INTERNET',
  'HOUSEKEEPING',
  'OTHER',
] as const;

export function ExpensesPage() {
  const { tHeading } = useLanguage();
  const { showToast } = useToast();
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [pnl, setPnl] = useState<PnlRow[]>([]);
  const [properties, setProperties] = useState<Array<{ id: number; name: string }>>([]);
  const [propertyFilter, setPropertyFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const monthOptions = useMemo(() => pnl.map((r) => ({ key: r.monthKey, label: r.label })), [pnl]);

  const filteredPnl = useMemo(
    () => (monthFilter ? pnl.filter((r) => r.monthKey === monthFilter) : pnl),
    [pnl, monthFilter]
  );

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((exp) => {
      if (monthFilter && !exp.expenseDate.startsWith(monthFilter)) return false;
      if (categoryFilter && exp.category !== categoryFilter) return false;
      if (q) {
        const hay = `${exp.vendor} ${exp.note} ${exp.propertyName} ${formatExpenseCategory(exp.category)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [expenses, monthFilter, categoryFilter, search]);

  const summaryTotals = useMemo(() => {
    const revenue = filteredPnl.reduce((s, r) => s + r.revenue, 0);
    const totalExpenses = filteredPnl.reduce((s, r) => s + r.expenses, 0);
    return {
      revenue,
      expenses: totalExpenses,
      netProfit: revenue - totalExpenses,
    };
  }, [filteredPnl]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    const qs = propertyFilter ? `?propertyId=${propertyFilter}` : '';
    downloadAuthorizedFile(`/api/reports/pnl.csv${qs}`, 'pgdesk-pnl-report.csv').catch((e) =>
      showToast(e.message || 'Could not export CSV', 'error')
    );
  };

  return (
    <DashboardLayout
      title={tHeading('heading.pageExpenses')}
      breadcrumb="Home / Income and Expenses"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter expenses by hostel"
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            className="min-h-[40px] max-w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">All Hostels</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Expense</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* 3 Summary KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Rent Collected</p>
            <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
              {formatINR(summaryTotals.revenue)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {monthFilter
                ? monthOptions.find((m) => m.key === monthFilter)?.label || monthFilter
                : `Across ${filteredPnl.length} months`}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Operating Expenses</p>
            <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {formatINR(summaryTotals.expenses)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Electricity, staff, food &amp; repairs
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Money Left</p>
            <p
              className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${
                summaryTotals.netProfit >= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatINR(summaryTotals.netProfit)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Rent collected minus expenses</p>
          </div>
        </div>

        {/* Monthly Income & Expense Summary */}
        <div id="monthly-pnl" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col justify-between gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center dark:border-slate-800">
            <h2 className="font-display text-base font-semibold">{tHeading('heading.sectionMonthlyPnl')}</h2>
            <select
              aria-label="Filter summary by month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="min-h-[38px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">All Months</option>
              {monthOptions.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {filteredPnl.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No monthly summary records found for this filter.
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
                {filteredPnl.map((row) => (
                  <div key={row.monthKey} className="space-y-2 p-4 text-xs">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{row.label}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Collected</p>
                        <p className="font-mono font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                          {formatINR(row.revenue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Expenses</p>
                        <p className="font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                          {formatINR(row.expenses)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-500 dark:text-slate-400">Money Left</p>
                        <p
                          className={`font-mono font-semibold tabular-nums ${
                            row.netProfit >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {formatINR(row.netProfit)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                    <tr>
                      <th className="px-4 py-3">Month</th>
                      <th className="px-4 py-3 text-right">Rent Collected</th>
                      <th className="px-4 py-3 text-right">Operating Expenses</th>
                      <th className="px-4 py-3 text-right">Money Left</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredPnl.map((row) => (
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
                            row.netProfit >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {formatINR(row.netProfit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Expense Ledger */}
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between dark:border-slate-800">
            <h2 className="font-display text-base font-semibold">{tHeading('heading.sectionExpenseLedger')}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search vendor, note, category..."
                  aria-label="Search expenses"
                  className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <select
                aria-label="Filter expenses by category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="min-h-[38px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">All Categories</option>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {formatExpenseCategory(cat)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No expense entries match these filters.
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
                {filteredExpenses.map((exp) => (
                  <div key={exp.id} className="space-y-1.5 p-4 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {formatExpenseCategory(exp.category)}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">
                          {exp.propertyName} · {formatDateIN(exp.expenseDate)}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                        {formatINR(exp.amount)}
                      </span>
                    </div>
                    {(exp.vendor || exp.note) && (
                      <p className="text-slate-600 dark:text-slate-300">
                        {exp.vendor ? `${exp.vendor}${exp.note ? ' · ' : ''}` : ''}
                        {exp.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Hostel</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Vendor &amp; Note</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredExpenses.map((exp) => (
                      <tr key={exp.id}>
                        <td className="px-4 py-3 text-xs tabular-nums">{formatDateIN(exp.expenseDate)}</td>
                        <td className="px-4 py-3 text-xs">{exp.propertyName}</td>
                        <td className="px-4 py-3 text-xs font-medium">{formatExpenseCategory(exp.category)}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                          {exp.vendor ? `${exp.vendor}${exp.note ? ' · ' : ''}` : ''}
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
            </>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleAdd}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-4">
              <h3 className="font-display text-lg font-semibold">Log Hostel Expense</h3>
              <button type="button" onClick={() => setShowAdd(false)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium">Hostel</label>
                <select
                  value={form.propertyId}
                  onChange={(e) => setForm({ ...form, propertyId: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {formatExpenseCategory(cat)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium">Date</label>
                  <input
                    type="date"
                    required
                    value={form.expenseDate}
                    onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Vendor</label>
                <input
                  value={form.vendor}
                  onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                  placeholder="e.g., APSPDCL / Plumber"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Note</label>
                <input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Expense'}
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}

