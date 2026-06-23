'use client'

import { useState, Fragment } from 'react'
import { Plus, Pencil, Trash2, Download, ChevronRight, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { addExpense, updateExpense, deleteExpense } from '@/app/(producer)/projects/[id]/financials-actions'
import { formatCurrency, formatHours } from '@/lib/utils'
import type { Expense, ExpenseType } from '@/lib/types'

export interface LabourRow {
  personId: string
  name: string
  personType: string | null
  estimatedHours: number | null
  actualHours: number
  hrsRemaining: number | null
  internalRate: number
  actualInternalCost: number
  externalRate: number
  actualExternalCost: number
}

interface FinancialsTabProps {
  projectId: string
  currency: string
  sowTotal: number | null
  labourRows: LabourRow[]
  initialExpenses: Expense[]
}

const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  hosting: 'Hosting/Domain',
  travel: 'Travel',
  accommodation: 'Accommodation',
  per_diem: 'Per Diem',
  freelancer_flat: 'Freelancer Flat Fee',
  software: 'Software/Fonts',
  purchase: 'Purchase',
  other: 'Other',
}

const EXPENSE_TYPES = Object.entries(EXPENSE_TYPE_LABELS) as [ExpenseType, string][]

function marginTextColor(pct: number | null) {
  if (pct === null) return 'text-neutral-900'
  if (pct > 20) return 'text-green-600'
  if (pct >= 5) return 'text-[#D97706]'
  return 'text-red-600'
}

function marginCardStyle(pct: number | null) {
  if (pct === null) return 'bg-white border-neutral-200'
  if (pct > 20) return 'bg-green-50 border-green-200'
  if (pct >= 5) return 'bg-purple-50 border-purple-200'
  return 'bg-red-50 border-red-200'
}

function usageStyle(pct: number | null) {
  if (pct === null) return ''
  if (pct >= 100) return 'text-red-600'
  if (pct >= 80) return 'text-[#3E0BE5]'
  return 'text-neutral-700'
}

export function FinancialsTab({
  projectId,
  currency,
  sowTotal,
  labourRows,
  initialExpenses,
}: FinancialsTabProps) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses)
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Expense | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(new Set())

  const toggleLabel = (label: string) => {
    setExpandedLabels(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  // Group expenses by label, preserving first-appearance order
  const expenseGroups = (() => {
    const map = new Map<string, Expense[]>()
    for (const ex of expenses) {
      if (!map.has(ex.label)) map.set(ex.label, [])
      map.get(ex.label)!.push(ex)
    }
    return Array.from(map.entries()).map(([label, items]) => ({ label, items }))
  })()

  // ── Derived calculations ─────────────────────────────────────────────────────

  const totalLabourInternal = labourRows.reduce((s, r) => s + r.actualInternalCost, 0)
  const totalLabourExternal = labourRows.reduce((s, r) => s + r.actualExternalCost, 0)
  const totalActualHours = labourRows.reduce((s, r) => s + r.actualHours, 0)
  const totalEstHours = labourRows.some(r => r.estimatedHours !== null)
    ? labourRows.reduce((s, r) => s + (r.estimatedHours ?? 0), 0)
    : null
  const totalHrsRemaining = totalEstHours !== null ? totalEstHours - totalActualHours : null

  const totalExpensesAmt = expenses.reduce((s, e) => s + Number(e.amount) * Number(e.quantity), 0)
  const actualCost = totalLabourInternal + totalExpensesAmt

  const budgetRemaining = sowTotal !== null ? sowTotal - actualCost : null
  const marginPct = sowTotal && sowTotal > 0 ? ((sowTotal - actualCost) / sowTotal) * 100 : null
  const usagePct = sowTotal && sowTotal > 0 ? (actualCost / sowTotal) * 100 : null
  const labourUsagePct = sowTotal && sowTotal > 0 ? (totalLabourInternal / sowTotal) * 100 : null
  const expensesUsagePct = sowTotal && sowTotal > 0 ? (totalExpensesAmt / sowTotal) * 100 : null

  // ── CRUD handlers ────────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const expenseType = fd.get('expense_type') as ExpenseType
    const label = (fd.get('label') as string).trim()
    const amount = parseFloat(fd.get('amount') as string)
    const quantity = parseFloat(fd.get('quantity') as string) || 1
    const notes = ((fd.get('notes') as string) || '').trim() || null
    if (!label || isNaN(amount)) return
    setSaving(true)
    setFormError(null)
    try {
      const expense = await addExpense(projectId, expenseType, label, amount, quantity, notes)
      setExpenses(prev => [...prev, expense])
      setAddOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editTarget) return
    const fd = new FormData(e.currentTarget)
    const expenseType = fd.get('expense_type') as ExpenseType
    const label = (fd.get('label') as string).trim()
    const amount = parseFloat(fd.get('amount') as string)
    const quantity = parseFloat(fd.get('quantity') as string) || 1
    const notes = ((fd.get('notes') as string) || '').trim() || null
    if (!label || isNaN(amount)) return
    setSaving(true)
    setFormError(null)
    try {
      await updateExpense(editTarget.id, projectId, expenseType, label, amount, quantity, notes)
      setExpenses(prev =>
        prev.map(x => x.id === editTarget.id
          ? { ...x, expense_type: expenseType, label, amount, quantity, notes }
          : x
        )
      )
      setEditTarget(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setSaving(true)
    try {
      await deleteExpense(id, projectId)
      setExpenses(prev => prev.filter(x => x.id !== id))
      setDeleteId(null)
    } catch {
      // silent — item stays
    } finally {
      setSaving(false)
    }
  }

  // ── CSV export ───────────────────────────────────────────────────────────────

  function exportCSV() {
    const fmt = (n: number | null) =>
      n !== null ? n.toFixed(2) : ''
    const pctFmt = (n: number | null) =>
      n !== null ? `${n.toFixed(1)}%` : ''

    const rows: string[][] = [
      ['', 'SOW Budget', 'Actual Cost', 'Budget Remaining', 'Usage %'],
      [
        'Labour',
        '',
        fmt(totalLabourInternal),
        '',
        pctFmt(labourUsagePct),
      ],
      [
        'Expenses',
        '',
        fmt(totalExpensesAmt),
        '',
        pctFmt(expensesUsagePct),
      ],
      [
        'Total',
        fmt(sowTotal),
        fmt(actualCost),
        fmt(budgetRemaining),
        pctFmt(usagePct),
      ],
      [],
      ['Actual Profit', fmt(budgetRemaining)],
      ['Actual Margin', pctFmt(marginPct)],
      [],
      ['Expenses Detail'],
      ['Category', 'Label', 'Amount', 'Qty', 'Total', 'Notes'],
      ...expenses.map(ex => [
        EXPENSE_TYPE_LABELS[ex.expense_type],
        ex.label,
        fmt(ex.amount),
        String(ex.quantity),
        fmt(Number(ex.amount) * Number(ex.quantity)),
        ex.notes ?? '',
      ]),
    ]

    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financials-${projectId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Expense row renderer (shared by flat + accordion children) ────────────────

  function renderExpenseRow(expense: Expense, isChild = false) {
    return (
      <TableRow key={expense.id} className={isChild ? 'bg-neutral-50/40' : ''}>
        <TableCell className="text-neutral-600 text-xs">{EXPENSE_TYPE_LABELS[expense.expense_type]}</TableCell>
        <TableCell className={`font-medium text-neutral-900 ${isChild ? 'pl-8' : ''}`}>{expense.label}</TableCell>
        <TableCell className="text-right font-mono text-neutral-700">
          {formatCurrency(Number(expense.amount), currency)}
        </TableCell>
        <TableCell className="text-right font-mono text-neutral-600">{Number(expense.quantity)}</TableCell>
        <TableCell className="text-right font-mono font-medium text-neutral-900">
          {formatCurrency(Number(expense.amount) * Number(expense.quantity), currency)}
        </TableCell>
        <TableCell className="text-xs text-neutral-400 max-w-[160px] truncate">
          {expense.notes ?? '—'}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setFormError(null); setEditTarget(expense) }}
              className="p-1 text-neutral-400 hover:text-neutral-700 rounded transition-colors"
              aria-label="Edit"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => setDeleteId(expense.id)}
              className="p-1 text-neutral-400 hover:text-red-600 rounded transition-colors"
              aria-label="Delete"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-neutral-200 rounded-[4px] p-4">
          <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">SOW Total</p>
          <p className="text-2xl font-mono font-semibold text-neutral-900">
            {sowTotal !== null ? formatCurrency(sowTotal, currency) : '—'}
          </p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-[4px] p-4">
          <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Actual Cost</p>
          <p className="text-2xl font-mono font-semibold text-neutral-900">
            {formatCurrency(actualCost, currency)}
          </p>
        </div>
        <div className={`border rounded-[4px] p-4 ${
          budgetRemaining !== null && budgetRemaining < 0
            ? 'bg-red-50 border-red-200'
            : 'bg-white border-neutral-200'
        }`}>
          <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Budget Remaining</p>
          <p className={`text-2xl font-mono font-semibold ${
            budgetRemaining !== null && budgetRemaining < 0 ? 'text-red-600' : 'text-neutral-900'
          }`}>
            {budgetRemaining !== null ? formatCurrency(budgetRemaining, currency) : '—'}
          </p>
        </div>
        <div className={`border rounded-[4px] p-4 ${marginCardStyle(marginPct)}`}>
          <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Current Margin</p>
          <p className={`text-2xl font-mono font-semibold ${marginTextColor(marginPct)}`}>
            {marginPct !== null ? `${marginPct.toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>

      {/* Labour table */}
      <div className="bg-white border border-neutral-200 rounded-[4px] mb-6">
        <div className="px-4 py-3 border-b border-neutral-100">
          <h2 className="text-sm font-semibold text-neutral-900">Labour</h2>
          <p className="text-xs text-neutral-400 mt-0.5">Approved time entries only</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Est Hrs</TableHead>
                <TableHead className="text-right">Actual Hrs</TableHead>
                <TableHead className="text-right">Hrs Remaining</TableHead>
                <TableHead className="text-right">Int Rate</TableHead>
                <TableHead className="text-right">Int Cost</TableHead>
                <TableHead className="text-right">Ext Rate</TableHead>
                <TableHead className="text-right">Ext Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {labourRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-neutral-400 py-6">
                    No people assigned yet.
                  </TableCell>
                </TableRow>
              ) : (
                labourRows.map(row => {
                  const overBudgetHrs = row.hrsRemaining !== null && row.hrsRemaining < 0
                  return (
                    <TableRow key={row.personId}>
                      <TableCell className="font-medium text-neutral-900">{row.name}</TableCell>
                      <TableCell className="text-neutral-500 capitalize text-xs">
                        {row.personType === 'freelancer' ? 'FL' : row.personType === 'employee' ? 'EE' : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-neutral-600">
                        {row.estimatedHours !== null ? formatHours(row.estimatedHours) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatHours(row.actualHours)}</TableCell>
                      <TableCell className={`text-right font-mono ${overBudgetHrs ? 'text-red-600 font-semibold' : 'text-neutral-700'}`}>
                        {row.hrsRemaining !== null ? formatHours(row.hrsRemaining) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-neutral-600">
                        {row.internalRate > 0 ? `$${row.internalRate.toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(row.actualInternalCost, currency)}</TableCell>
                      <TableCell className="text-right font-mono text-neutral-600">
                        {row.externalRate > 0 ? `$${row.externalRate.toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(row.actualExternalCost, currency)}</TableCell>
                    </TableRow>
                  )
                })
              )}
              {labourRows.length > 0 && (
                <TableRow className="bg-neutral-50 font-semibold">
                  <TableCell className="text-neutral-700">Total</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-mono text-neutral-600">
                    {totalEstHours !== null ? formatHours(totalEstHours) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatHours(totalActualHours)}</TableCell>
                  <TableCell className={`text-right font-mono ${totalHrsRemaining !== null && totalHrsRemaining < 0 ? 'text-red-600' : 'text-neutral-700'}`}>
                    {totalHrsRemaining !== null ? formatHours(totalHrsRemaining) : '—'}
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right font-mono">{formatCurrency(totalLabourInternal, currency)}</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-mono">{formatCurrency(totalLabourExternal, currency)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Expenses table */}
      <div className="bg-white border border-neutral-200 rounded-[4px] mb-6">
        <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Expenses</h2>
          <Button size="sm" className="h-7 text-xs px-2 gap-1" onClick={() => { setFormError(null); setAddOpen(true) }}>
            <Plus size={13} />
            Add Expense
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Label</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-neutral-400 py-6">
                  No expenses added yet.
                </TableCell>
              </TableRow>
            ) : (
              expenseGroups.map(group => {
                // Single entry — render a normal row
                if (group.items.length === 1) {
                  return renderExpenseRow(group.items[0])
                }
                // Multiple entries with same label — accordion
                const isExpanded = expandedLabels.has(group.label)
                const groupTotal = group.items.reduce((s, e) => s + Number(e.amount) * Number(e.quantity), 0)
                const allSameCategory = group.items.every(e => e.expense_type === group.items[0].expense_type)
                return (
                  <Fragment key={group.label}>
                    <TableRow
                      className="cursor-pointer hover:bg-neutral-50"
                      onClick={() => toggleLabel(group.label)}
                    >
                      <TableCell className="text-neutral-600 text-xs">
                        <div className="flex items-center gap-1">
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          {allSameCategory ? EXPENSE_TYPE_LABELS[group.items[0].expense_type] : 'Multiple'}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-neutral-900">
                        {group.label}
                        <span className="text-neutral-400 font-normal ml-1.5">({group.items.length})</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-neutral-400">—</TableCell>
                      <TableCell className="text-right font-mono text-neutral-400">—</TableCell>
                      <TableCell className="text-right font-mono font-medium text-neutral-900">
                        {formatCurrency(groupTotal, currency)}
                      </TableCell>
                      <TableCell className="text-xs text-neutral-400">
                        {isExpanded ? '' : `${group.items.length} entries`}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                    {isExpanded && group.items.map(item => renderExpenseRow(item, true))}
                  </Fragment>
                )
              })
            )}
            {expenses.length > 0 && (
              <TableRow className="bg-neutral-50 font-semibold">
                <TableCell colSpan={4} className="text-right text-neutral-700">Total Expenses</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totalExpensesAmt, currency)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary table */}
      <div className="bg-white border border-neutral-200 rounded-[4px] mb-6">
        <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Summary</h2>
          <Button variant="outline" size="sm" className="h-7 text-xs px-2 gap-1" onClick={exportCSV}>
            <Download size={13} />
            Export CSV
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28"></TableHead>
              <TableHead className="text-right">SOW Budget</TableHead>
              <TableHead className="text-right">Actual Cost</TableHead>
              <TableHead className="text-right">Budget Remaining</TableHead>
              <TableHead className="text-right">Usage %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium text-neutral-700">Labour</TableCell>
              <TableCell className="text-right font-mono text-neutral-400">—</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(totalLabourInternal, currency)}</TableCell>
              <TableCell className="text-right font-mono text-neutral-400">—</TableCell>
              <TableCell className={`text-right font-mono ${usageStyle(labourUsagePct)}`}>
                {labourUsagePct !== null ? `${labourUsagePct.toFixed(1)}%` : '—'}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium text-neutral-700">Expenses</TableCell>
              <TableCell className="text-right font-mono text-neutral-400">—</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(totalExpensesAmt, currency)}</TableCell>
              <TableCell className="text-right font-mono text-neutral-400">—</TableCell>
              <TableCell className={`text-right font-mono ${usageStyle(expensesUsagePct)}`}>
                {expensesUsagePct !== null ? `${expensesUsagePct.toFixed(1)}%` : '—'}
              </TableCell>
            </TableRow>
            <TableRow className="bg-neutral-50 font-semibold">
              <TableCell className="text-neutral-900">Total</TableCell>
              <TableCell className="text-right font-mono">
                {sowTotal !== null ? formatCurrency(sowTotal, currency) : '—'}
              </TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(actualCost, currency)}</TableCell>
              <TableCell className={`text-right font-mono ${budgetRemaining !== null && budgetRemaining < 0 ? 'text-red-600' : ''}`}>
                {budgetRemaining !== null ? formatCurrency(budgetRemaining, currency) : '—'}
              </TableCell>
              <TableCell className={`text-right font-mono ${usageStyle(usagePct)}`}>
                {usagePct !== null ? `${usagePct.toFixed(1)}%` : '—'}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <div className="px-4 py-3 border-t border-neutral-100 flex items-center gap-8">
          <div>
            <span className="text-xs text-neutral-500 uppercase tracking-wider">Actual Profit</span>
            <span className={`font-mono font-semibold ml-3 ${budgetRemaining !== null && budgetRemaining < 0 ? 'text-red-600' : 'text-neutral-900'}`}>
              {budgetRemaining !== null ? formatCurrency(budgetRemaining, currency) : '—'}
            </span>
          </div>
          <div>
            <span className="text-xs text-neutral-500 uppercase tracking-wider">Actual Margin</span>
            <span className={`font-mono font-semibold ml-3 ${marginTextColor(marginPct)}`}>
              {marginPct !== null ? `${marginPct.toFixed(1)}%` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Add expense dialog */}
      <ExpenseFormDialog
        open={addOpen}
        title="Add Expense"
        onClose={() => setAddOpen(false)}
        onSubmit={handleAdd}
        saving={saving}
        error={formError}
        currency={currency}
      />

      {/* Edit expense dialog */}
      <ExpenseFormDialog
        open={!!editTarget}
        title="Edit Expense"
        defaultValues={editTarget ?? undefined}
        onClose={() => setEditTarget(null)}
        onSubmit={handleEdit}
        saving={saving}
        error={formError}
        currency={currency}
      />

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={v => { if (!v) setDeleteId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove expense?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-500">This will permanently remove this expense from the project.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => deleteId && handleDelete(deleteId)}
              disabled={saving}
            >
              {saving ? 'Removing…' : 'Remove'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Expense form dialog ───────────────────────────────────────────────────────

function ExpenseFormDialog({
  open,
  title,
  defaultValues,
  onClose,
  onSubmit,
  saving,
  error,
  currency,
}: {
  open: boolean
  title: string
  defaultValues?: Expense
  onClose: () => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  saving: boolean
  error: string | null
  currency: string
}) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3 pt-1">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Category</label>
            <select
              name="expense_type"
              defaultValue={defaultValues?.expense_type ?? 'other'}
              className="w-full text-sm border border-neutral-200 rounded-[4px] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-neutral-900 bg-white"
            >
              {EXPENSE_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Label</label>
            <input
              name="label"
              type="text"
              defaultValue={defaultValues?.label ?? ''}
              required
              placeholder="e.g. Airfare YYZ→LGA, Hotel 3 nights"
              className="w-full text-sm border border-neutral-200 rounded-[4px] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Amount ({currency})</label>
              <input
                name="amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={defaultValues?.amount ?? ''}
                required
                placeholder="0.00"
                className="w-full text-sm border border-neutral-200 rounded-[4px] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-neutral-900 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Quantity</label>
              <input
                name="quantity"
                type="number"
                min="0"
                step="0.01"
                defaultValue={defaultValues?.quantity ?? 1}
                placeholder="1"
                className="w-full text-sm border border-neutral-200 rounded-[4px] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-neutral-900 font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Notes <span className="font-normal text-neutral-400">(optional)</span></label>
            <input
              name="notes"
              type="text"
              defaultValue={defaultValues?.notes ?? ''}
              placeholder="Any relevant details"
              className="w-full text-sm border border-neutral-200 rounded-[4px] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
