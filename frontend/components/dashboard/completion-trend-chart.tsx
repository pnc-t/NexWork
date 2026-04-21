'use client';

import { useMemo, useState } from 'react';
import { Task } from '@/types/task';
import { subDays, startOfDay, format, parseISO, isAfter, isBefore, isSameDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface CompletionTrendChartProps {
  tasks: Task[];
}

export function CompletionTrendChart({ tasks }: CompletionTrendChartProps) {
  const [range, setRange] = useState<7 | 30>(7);

  const data = useMemo(() => {
    const today = startOfDay(new Date());
    const points = [];

    const totalTasks = tasks.length;

    for (let i = range - 1; i >= 0; i--) {
      const day = subDays(today, i);
      const completedByDay = tasks.filter((t) => {
        if (t.status !== 'done') return false;
        const endDate = t.actualEndDate
          ? startOfDay(parseISO(t.actualEndDate))
          : startOfDay(parseISO(t.updatedAt));
        return isBefore(endDate, day) || isSameDay(endDate, day);
      }).length;

      points.push({
        date: format(day, 'M/d', { locale: ja }),
        completed: completedByDay,
        total: totalTasks,
        rate: totalTasks > 0 ? Math.round((completedByDay / totalTasks) * 100) : 0,
      });
    }

    return points;
  }, [tasks, range]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">完了率推移</h2>
        <div className="flex gap-1">
          {([7, 30] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                range === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r}日
            </button>
          ))}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
            <Tooltip
              formatter={(value: number) => [`${value}%`, '完了率']}
              labelStyle={{ fontSize: 12 }}
              contentStyle={{ fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="rate"
              stroke="#3b82f6"
              fill="#dbeafe"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
