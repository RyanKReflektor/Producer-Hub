'use client'

import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface WeekBurn {
  week_label: string
  hours: number
  internal_cost: number
}

interface BurnChartProps {
  data: WeekBurn[]
  currency?: string
}

export function BurnChart({ data, currency = 'CAD' }: BurnChartProps) {
  const [view, setView] = useState<'hours' | 'cost'>('hours')

  const chartData = data.map(d => ({
    week: d.week_label,
    value: view === 'hours' ? d.hours : d.internal_cost,
  }))

  return (
    <div className="bg-white border border-neutral-200 rounded-[4px] p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-neutral-900">Weekly Burn</h3>
        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-[4px]">
          <button
            onClick={() => setView('hours')}
            className={`px-3 py-1 rounded-[4px] text-xs font-medium transition-colors ${
              view === 'hours'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Hours
          </button>
          <button
            onClick={() => setView('cost')}
            className={`px-3 py-1 rounded-[4px] text-xs font-medium transition-colors ${
              view === 'cost'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Cost
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-neutral-400 text-sm">
          No approved time entries yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v =>
                view === 'hours' ? `${v}h` : `$${(v / 1000).toFixed(0)}k`
              }
            />
            <Tooltip
              contentStyle={{
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                boxShadow: 'none',
                fontSize: '12px',
              }}
              formatter={(value: number) =>
                view === 'hours'
                  ? [`${value.toFixed(1)}h`, 'Hours']
                  : [formatCurrency(value, currency), 'Cost']
              }
              cursor={{ fill: '#f9fafb' }}
            />
            <Bar
              dataKey="value"
              fill="#3E0BE5"
              radius={[2, 2, 0, 0]}
              maxBarSize={48}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
