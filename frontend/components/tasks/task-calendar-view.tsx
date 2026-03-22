'use client';

import { useState, useMemo, useCallback } from 'react';
import { Task, Milestone } from '@/types/task';
import { TaskCalendar } from './task-calendar';
import { TaskCalendarWeek } from './task-calendar-week';
import { TaskCalendarDay } from './task-calendar-day';
import { MiniCalendar } from './mini-calendar';
import { Filter, X, ChevronLeft, ChevronRight, Menu } from 'lucide-react';
import {
  format,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  startOfWeek,
  endOfWeek,
  parseISO,
} from 'date-fns';
import { ja } from 'date-fns/locale';

interface TaskCalendarViewProps {
  tasks: Task[];
  onUpdate: () => void;
  milestones?: Milestone[];
  projectId?: string;
}

type CalendarMode = 'month' | 'week' | 'day';

const STATUS_OPTIONS = [
  { value: 'todo', label: '未着手' },
  { value: 'in_progress', label: '進行中' },
  { value: 'done', label: '完了' },
];

const PRIORITY_OPTIONS = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];

export function TaskCalendarView({ tasks, onUpdate, milestones = [], projectId }: TaskCalendarViewProps) {
  const [mode, setMode] = useState<CalendarMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showFilter, setShowFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (statusFilter.length > 0 && !statusFilter.includes(task.status)) return false;
      if (priorityFilter.length > 0 && !priorityFilter.includes(task.priority)) return false;
      return true;
    });
  }, [tasks, statusFilter, priorityFilter]);

  const activeFilterCount = statusFilter.length + priorityFilter.length;

  const toggleStatus = (v: string) =>
    setStatusFilter(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const togglePriority = (v: string) =>
    setPriorityFilter(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const clearFilters = () => {
    setStatusFilter([]);
    setPriorityFilter([]);
  };

  // ナビゲーション
  const goToToday = useCallback(() => setCurrentDate(new Date()), []);
  const goToPrev = useCallback(() => {
    setCurrentDate(prev => {
      if (mode === 'month') return subMonths(prev, 1);
      if (mode === 'week') return subWeeks(prev, 1);
      return subDays(prev, 1);
    });
  }, [mode]);
  const goToNext = useCallback(() => {
    setCurrentDate(prev => {
      if (mode === 'month') return addMonths(prev, 1);
      if (mode === 'week') return addWeeks(prev, 1);
      return addDays(prev, 1);
    });
  }, [mode]);

  // ヘッダーの日付表示
  const dateLabel = useMemo(() => {
    if (mode === 'month') {
      return format(currentDate, 'yyyy年 M月', { locale: ja });
    }
    if (mode === 'week') {
      const weekStart = startOfWeek(currentDate, { locale: ja });
      const weekEnd = endOfWeek(currentDate, { locale: ja });
      return `${format(weekStart, 'yyyy年 M月d日', { locale: ja })} – ${format(weekEnd, 'M月d日', { locale: ja })}`;
    }
    return format(currentDate, 'yyyy年 M月d日(E)', { locale: ja });
  }, [currentDate, mode]);

  // ミニカレンダー用: タスクがある日付のセット
  const taskDates = useMemo(() => {
    const dates = new Set<string>();
    tasks.forEach(t => {
      if (t.dueDate) dates.add(format(parseISO(t.dueDate), 'yyyy-MM-dd'));
      if (t.startDate) dates.add(format(parseISO(t.startDate), 'yyyy-MM-dd'));
    });
    return dates;
  }, [tasks]);

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダーバー */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white flex-shrink-0">
        {/* 左: サイドバートグル + ナビゲーション */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <Menu className="w-5 h-5 text-gray-600" />
        </button>

        <button
          onClick={goToPrev}
          className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <button
          onClick={goToToday}
          className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          今日
        </button>
        <button
          onClick={goToNext}
          className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>

        <h2 className="text-lg font-medium text-gray-800 ml-2">{dateLabel}</h2>

        <div className="flex-1" />

        {/* 右: フィルター + モード切替 */}
        <div className="relative">
          <button
            onClick={() => setShowFilter(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${
              activeFilterCount > 0
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="bg-blue-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          {showFilter && (
            <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-30 p-4 w-64">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">フィルター</span>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <X className="w-3 h-3" />クリア
                  </button>
                )}
              </div>
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-500 mb-2">ステータス</p>
                <div className="space-y-1">
                  {STATUS_OPTIONS.map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={statusFilter.includes(opt.value)} onChange={() => toggleStatus(opt.value)} className="rounded text-blue-600" />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">優先度</p>
                <div className="space-y-1">
                  {PRIORITY_OPTIONS.map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={priorityFilter.includes(opt.value)} onChange={() => togglePriority(opt.value)} className="rounded text-blue-600" />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
          {(['month', 'week', 'day'] as CalendarMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                mode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {m === 'month' ? '月' : m === 'week' ? '週' : '日'}
            </button>
          ))}
        </div>
      </div>

      {/* フィルターアクティブバッジ */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-50 border-b border-gray-200 flex-shrink-0 flex-wrap">
          {statusFilter.map(v => (
            <span key={v} className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
              {STATUS_OPTIONS.find(o => o.value === v)?.label}
              <button onClick={() => toggleStatus(v)}><X className="w-3 h-3" /></button>
            </span>
          ))}
          {priorityFilter.map(v => (
            <span key={v} className="flex items-center gap-1 bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">
              {PRIORITY_OPTIONS.find(o => o.value === v)?.label}
              <button onClick={() => togglePriority(v)}><X className="w-3 h-3" /></button>
            </span>
          ))}
          <span className="text-xs text-gray-500">{filteredTasks.length} / {tasks.length} 件</span>
        </div>
      )}

      {/* メインエリア: サイドバー + カレンダー */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左サイドバー */}
        {sidebarOpen && (
          <div className="w-60 flex-shrink-0 border-r border-gray-200 bg-white p-4 overflow-y-auto">
            <MiniCalendar
              currentDate={currentDate}
              onDateSelect={(date) => setCurrentDate(date)}
              taskDates={taskDates}
            />
          </div>
        )}

        {/* カレンダーコンテンツ */}
        <div className="flex-1 overflow-auto">
          {mode === 'month' && (
            <TaskCalendar tasks={filteredTasks} onUpdate={onUpdate} milestones={milestones} projectId={projectId} currentDate={currentDate} onDateChange={setCurrentDate} />
          )}
          {mode === 'week' && (
            <TaskCalendarWeek tasks={filteredTasks} onUpdate={onUpdate} milestones={milestones} projectId={projectId} currentDate={currentDate} onDateChange={setCurrentDate} />
          )}
          {mode === 'day' && (
            <TaskCalendarDay tasks={filteredTasks} onUpdate={onUpdate} milestones={milestones} projectId={projectId} currentDate={currentDate} onDateChange={setCurrentDate} />
          )}
        </div>
      </div>
    </div>
  );
}
