'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Task, Milestone } from '@/types/task';
import { useAuthStore } from '@/lib/auth-store';
import { taskService } from '@/services/task.service';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  differenceInDays,
  addDays,
  isAfter,
  startOfDay,
  parseISO,
  isWeekend,
  isSameDay,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { AlertTriangle, CheckCircle, Clock, User, Filter, Link2, ZoomIn, ZoomOut, Crosshair, Flag, ChevronDown, ChevronRight } from 'lucide-react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useGanttBarDrag } from '@/hooks/use-gantt-bar-drag';

interface GanttChartProps {
  tasks: Task[];
  onUpdate: () => void;
  milestones?: Milestone[];
}

interface MilestoneGroup {
  milestone: Milestone | null;
  tasks: Task[];
  isExpanded: boolean;
}

export function GanttChart({ tasks, onUpdate, milestones = [] }: GanttChartProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [showMyTasksOnly, setShowMyTasksOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'dueDate' | 'priority' | 'status'>('dueDate');
  const [showDependencies, setShowDependencies] = useState(true);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectPreviewEnd, setConnectPreviewEnd] = useState<{ x: number; y: number } | null>(null);
  const [cellWidth, setCellWidth] = useState(50);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);

  const [hoveredConnectId, setHoveredConnectId] = useState<string | null>(null);
  const [hoveredDepIndex, setHoveredDepIndex] = useState<number | null>(null);
  const [groupByMilestone, setGroupByMilestone] = useState(true);
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    if (milestones.length > 0) {
      milestones.forEach(m => ids.add(m.id));
    }
    ids.add('none');
    return ids;
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const todayMarkerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const taskRowsRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // connectFrom を ref でも保持（window イベント内でクロージャ汚染を防ぐ）
  const connectFromRef = useRef<string | null>(null);

  // タスクのY座標（DOM実測値）: taskId → バー中心Y (taskRowsRef基準)
  const [taskYPositions, setTaskYPositions] = useState<Map<string, number>>(new Map());

  // フィルタリングとソート
  const filteredTasks = useMemo(() => {
    let filtered = tasks;

    if (filterStatus !== 'all') {
      filtered = filtered.filter(t => t.status === filterStatus);
    }

    if (filterPriority !== 'all') {
      filtered = filtered.filter(t => t.priority === filterPriority);
    }

    if (showMyTasksOnly) {
      filtered = filtered.filter(t => t.assignee?.id === user?.id ||
        t.assignees?.some(a => a.user.id === user?.id));
    }

    // ソート
    filtered.sort((a, b) => {
      if (sortBy === 'dueDate') {
        // 開始日を優先（ガントバーの左端位置＝左上から右下の並び順を実現）
        const aStart = a.startDate ? new Date(a.startDate).getTime()
          : a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bStart = b.startDate ? new Date(b.startDate).getTime()
          : b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (aStart !== bStart) return aStart - bStart;
        // 開始日が同じ場合は締切日で比較
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return aDue - bDue;
      } else if (sortBy === 'priority') {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      } else {
        const statusOrder = { todo: 0, in_progress: 1, done: 2 };
        return statusOrder[a.status] - statusOrder[b.status];
      }
    });

    return filtered;
  }, [tasks, filterStatus, filterPriority, showMyTasksOnly, sortBy, user]);

  // マイルストーンごとのグループ化
  const milestoneGroups = useMemo(() => {
    if (!groupByMilestone || milestones.length === 0) {
      return [{
        milestone: null,
        tasks: filteredTasks,
        isExpanded: true,
      }];
    }

    const grouped = new Map<string | null, Task[]>();

    filteredTasks.forEach(task => {
      const milestoneId = task.milestone?.id || null;
      if (!grouped.has(milestoneId)) {
        grouped.set(milestoneId, []);
      }
      grouped.get(milestoneId)!.push(task);
    });

    const groups: MilestoneGroup[] = [];

    milestones
      .filter(milestone => grouped.has(milestone.id))
      .sort((a, b) => {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      })
      .forEach(milestone => {
        groups.push({
          milestone,
          tasks: grouped.get(milestone.id)!,
          isExpanded: expandedMilestones.has(milestone.id),
        });
      });

    if (grouped.has(null)) {
      groups.push({
        milestone: null,
        tasks: grouped.get(null)!,
        isExpanded: expandedMilestones.has('none'),
      });
    }

    return groups;
  }, [filteredTasks, milestones, expandedMilestones, groupByMilestone]);

  // DOM実測でタスクのY座標を更新（milestoneGroups変化後に実行）
  useEffect(() => {
    if (!taskRowsRef.current) return;
    const container = taskRowsRef.current;
    const containerRect = container.getBoundingClientRect();
    const rows = container.querySelectorAll<HTMLElement>('[data-gantt-task-id]');
    const newMap = new Map<string, number>();
    rows.forEach((row) => {
      const taskId = row.dataset.ganttTaskId;
      if (!taskId) return;
      const rect = row.getBoundingClientRect();
      // 計画バー: top=8px, height=28px → 中心 = 8 + 14 = 22px
      newMap.set(taskId, rect.top - containerRect.top + 22);
    });
    setTaskYPositions(newMap);
  }, [milestoneGroups, groupByMilestone]);

  // タスクの日付範囲を計算
  const dateRange = useMemo(() => {
    const today = new Date();
    const tasksWithDates = filteredTasks.filter(t => t.dueDate || t.startDate);

    if (tasksWithDates.length === 0) {
      return {
        start: startOfMonth(today),
        end: endOfMonth(addDays(today, 30)),
      };
    }

    const allDates: Date[] = [];
    tasksWithDates.forEach(t => {
      if (t.startDate) allDates.push(parseISO(t.startDate));
      if (t.dueDate) allDates.push(parseISO(t.dueDate));
    });

    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));

    return {
      start: startOfMonth(minDate),
      end: endOfMonth(addDays(maxDate, 7)),
    };
  }, [filteredTasks]);

  const days = useMemo(() => {
    return eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
  }, [dateRange]);

  const totalDays = days.length;

  // ガントバードラッグ
  const ganttDrag = useGanttBarDrag({ cellWidth, days, onUpdate });

  // 初回マウント時のみ今日へ自動スクロール
  const hasScrolledToToday = useRef(false);
  useEffect(() => {
    if (!hasScrolledToToday.current && days.length > 0) {
      scrollToToday();
      hasScrolledToToday.current = true;
    }
  }, [days]);

  const scrollToToday = () => {
    if (todayMarkerRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const marker = todayMarkerRef.current;
      const containerRect = container.getBoundingClientRect();
      const markerRect = marker.getBoundingClientRect();
      const scrollLeft = markerRect.left - containerRect.left + container.scrollLeft - containerRect.width / 2;
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  };

  // タスクのステータスと進捗を判定
  const getTaskStatus = (task: Task) => {
    const today = startOfDay(new Date());
    const dueDate = task.dueDate ? startOfDay(parseISO(task.dueDate)) : null;

    if (task.status === 'done') {
      return {
        type: 'completed',
        label: '完了',
        bgColor: 'bg-green-500',
        textColor: 'text-green-700',
        borderColor: 'border-green-500',
        icon: CheckCircle,
      };
    }

    if (!dueDate) {
      return {
        type: 'no-date',
        label: '期限なし',
        bgColor: 'bg-gray-400',
        textColor: 'text-gray-700',
        borderColor: 'border-gray-400',
        icon: Clock,
      };
    }

    if (isAfter(today, dueDate)) {
      return {
        type: 'overdue',
        label: '遅延',
        bgColor: 'bg-red-500',
        textColor: 'text-red-700',
        borderColor: 'border-red-500',
        icon: AlertTriangle,
      };
    }

    const daysUntilDue = differenceInDays(dueDate, today);
    if (daysUntilDue <= 3) {
      return {
        type: 'urgent',
        label: '期限間近',
        bgColor: 'bg-orange-500',
        textColor: 'text-orange-700',
        borderColor: 'border-orange-500',
        icon: Clock,
      };
    }

    if (task.status === 'in_progress') {
      return {
        type: 'in-progress',
        label: '進行中',
        bgColor: 'bg-blue-500',
        textColor: 'text-blue-700',
        borderColor: 'border-blue-500',
        icon: Clock,
      };
    }

    return {
      type: 'on-track',
      label: '未着手',
      bgColor: 'bg-gray-500',
      textColor: 'text-gray-700',
      borderColor: 'border-gray-500',
      icon: Clock,
    };
  };

  // 日時をピクセル位置に変換（時刻の端数を反映）
  const dateToPixel = (date: Date): number | null => {
    const dayStart = startOfDay(date);
    const idx = days.findIndex(d => startOfDay(d).getTime() === dayStart.getTime());
    if (idx === -1) return null;
    const fraction = (date.getHours() * 60 + date.getMinutes()) / (24 * 60);
    return idx * cellWidth + fraction * cellWidth;
  };

  // タスクバーの位置とサイズを計算
  const getTaskBarStyle = (task: Task) => {
    if (!task.dueDate && !task.startDate) return null;

    let leftPx: number;
    let rightPx: number;

    if (task.startDate) {
      const startDate = parseISO(task.startDate);
      const px = dateToPixel(startDate);
      if (px !== null) {
        leftPx = px;
      } else if (startOfDay(startDate).getTime() < startOfDay(days[0]).getTime()) {
        leftPx = 0;
      } else {
        leftPx = -1; // 範囲外
      }
    } else {
      leftPx = -1;
    }

    if (task.dueDate) {
      const dueDate = parseISO(task.dueDate);
      const px = dateToPixel(dueDate);
      if (px !== null) {
        rightPx = px;
      } else if (startOfDay(dueDate).getTime() > startOfDay(days[days.length - 1]).getTime()) {
        rightPx = days.length * cellWidth;
      } else {
        rightPx = -1;
      }
    } else {
      rightPx = -1;
    }

    if (leftPx === -1 && rightPx === -1) return null;
    if (leftPx === -1) leftPx = Math.max(0, rightPx - 7 * cellWidth);
    if (rightPx === -1) rightPx = Math.min(days.length * cellWidth, leftPx + 7 * cellWidth);
    if (rightPx <= leftPx) rightPx = leftPx + cellWidth;

    return {
      left: `${leftPx}px`,
      width: `${rightPx - leftPx}px`,
    };
  };

  // 実績バーのスタイルを計算
  const getActualBarStyle = (task: Task) => {
    if (!task.actualStartDate) return null;

    const actualStart = parseISO(task.actualStartDate);
    const actualEnd = task.actualEndDate ? parseISO(task.actualEndDate) : new Date();

    let startPx = dateToPixel(actualStart);
    if (startPx === null) {
      if (startOfDay(actualStart).getTime() < startOfDay(days[0]).getTime()) {
        startPx = 0;
      } else {
        return null;
      }
    }

    let endPx = dateToPixel(actualEnd);
    if (endPx === null) {
      if (startOfDay(actualEnd).getTime() > startOfDay(days[days.length - 1]).getTime()) {
        endPx = days.length * cellWidth;
      } else {
        return null;
      }
    }

    if (endPx <= startPx) endPx = startPx + cellWidth;

    return {
      left: `${startPx}px`,
      width: `${endPx - startPx}px`,
    };
  };

  // 実績バーの色を決定
  const getActualBarColor = (task: Task) => {
    if (!task.actualEndDate) {
      // 進行中
      if (task.dueDate && isAfter(new Date(), parseISO(task.dueDate))) {
        return 'bg-red-200 border-red-500'; // 期限超過中
      }
      return 'bg-blue-200 border-blue-500'; // 順調に進行中
    }

    // 完了済み - 期限との比較
    if (task.dueDate) {
      const actualEnd = startOfDay(parseISO(task.actualEndDate));
      const dueDate = startOfDay(parseISO(task.dueDate));
      if (isAfter(actualEnd, dueDate)) {
        return 'bg-red-200 border-red-500'; // 遅延完了
      }
    }
    return 'bg-green-200 border-green-500'; // 予定通りまたは早期完了
  };

  const isMyTask = (task: Task) => {
    return task.assignee?.id === user?.id ||
      task.assignees?.some(a => a.user.id === user?.id);
  };

  const getPriorityInfo = (priority: string) => {
    switch (priority) {
      case 'high':
        return { label: '高', color: 'bg-red-500', textColor: 'text-red-700' };
      case 'medium':
        return { label: '中', color: 'bg-yellow-500', textColor: 'text-yellow-700' };
      case 'low':
        return { label: '低', color: 'bg-green-500', textColor: 'text-green-700' };
      default:
        return { label: '-', color: 'bg-gray-500', textColor: 'text-gray-700' };
    }
  };

  const getProgressPercentage = (task: Task) => {
    if (task.status === 'done') return 100;
    if (task.status === 'in_progress') return 50;
    return 0;
  };

  const stats = useMemo(() => {
    const total = filteredTasks.length;
    const completed = filteredTasks.filter(t => t.status === 'done').length;
    const inProgress = filteredTasks.filter(t => t.status === 'in_progress').length;
    const overdue = filteredTasks.filter(t => {
      const status = getTaskStatus(t);
      return status.type === 'overdue';
    }).length;
    const myTasks = filteredTasks.filter(t => isMyTask(t)).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, inProgress, overdue, myTasks, completionRate };
  }, [filteredTasks]);

  // タスクバーの位置情報を取得するヘルパー関数
  const getTaskBarPosition = (task: Task): { startX: number; endX: number } | null => {
    const barStyle = getTaskBarStyle(task);
    if (!barStyle) return null;

    const left = parseInt(barStyle.left);
    const width = parseInt(barStyle.width);
    return {
      startX: left,
      endX: left + width,
    };
  };

  // 依存関係の計算（DOM実測Y座標を使用）
  const dependencyLines = useMemo(() => {
    if (!showDependencies) return [];

    const lines: Array<{
      fromTaskId: string;
      toTaskId: string;
      fromY: number;
      toY: number;
      fromEndX: number;
      toStartX: number;
    }> = [];

    // タスクIDからタスクオブジェクトへのマップ
    const taskMap = new Map<string, Task>();
    milestoneGroups.forEach(group => {
      if (!group.isExpanded) return;
      group.tasks.forEach((task) => {
        taskMap.set(task.id, task);
      });
    });

    // 依存関係の線を計算
    taskMap.forEach((task) => {
      if (!task.dependencies) return;

      const toY = taskYPositions.get(task.id);
      if (toY === undefined) return;

      const toBarPos = getTaskBarPosition(task);
      if (!toBarPos) return;

      task.dependencies.forEach((dep) => {
        const fromY = taskYPositions.get(dep.dependsOn.id);
        if (fromY === undefined) return;

        const fromTask = taskMap.get(dep.dependsOn.id);
        if (!fromTask) return;

        const fromBarPos = getTaskBarPosition(fromTask);
        if (!fromBarPos) return;

        lines.push({
          fromTaskId: fromTask.id,
          toTaskId: task.id,
          fromY,
          toY,
          fromEndX: fromBarPos.endX,
          toStartX: toBarPos.startX,
        });
      });
    });

    return lines;
  }, [milestoneGroups, days, showDependencies, cellWidth, groupByMilestone, taskYPositions]);

  // 接続モード用: タスクIDからバー位置へのマップ（DOM実測Y座標を使用）
  const taskPositionMap = useMemo(() => {
    const map = new Map<string, { startX: number; endX: number; y: number }>();
    milestoneGroups.forEach(group => {
      if (!group.isExpanded) return;
      group.tasks.forEach(task => {
        const barPos = getTaskBarPosition(task);
        const y = taskYPositions.get(task.id);
        if (barPos && y !== undefined) {
          map.set(task.id, {
            startX: barPos.startX,
            endX: barPos.endX,
            y,
          });
        }
      });
    });
    return map;
  }, [milestoneGroups, days, cellWidth, groupByMilestone, taskYPositions]);

  // Escapeキーで接続モードをキャンセル
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && connectMode) {
        setConnectFrom(null);
        setConnectPreviewEnd(null);
        setConnectMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connectMode]);

  // connectFrom を ref に同期（window mousemove クロージャ内で最新値を参照するため）
  useEffect(() => { connectFromRef.current = connectFrom; }, [connectFrom]);

  // SVG の実座標を使ったプレビューライン更新（window レベルで追跡）
  useEffect(() => {
    if (!connectMode) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!connectFromRef.current) return;
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      setConnectPreviewEnd({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [connectMode]);

  const dependencyCount = useMemo(() => {
    return filteredTasks.reduce((count, task) => {
      return count + (task.dependencies?.length || 0);
    }, 0);
  }, [filteredTasks]);

  // 接続モード: connectFrom からの依存関係が既に存在するタスクIDのセット
  const alreadyConnectedIds = useMemo(() => {
    if (!connectFrom) return new Set<string>();
    const set = new Set<string>();
    tasks.forEach(task => {
      if (task.dependencies?.some(dep => dep.dependsOn.id === connectFrom)) {
        set.add(task.id);
      }
    });
    return set;
  }, [connectFrom, tasks]);

  const handleDeleteDependency = async (taskId: string, dependsOnId: string) => {
    try {
      await taskService.removeDependency(taskId, dependsOnId);
      onUpdate();
    } catch (error) {
      console.error('依存関係の削除に失敗:', error);
    }
  };

  const getAssigneeName = (task: Task): string => {
    if (task.assignee) return task.assignee.name;
    if (task.assignees && task.assignees.length > 0) return task.assignees.map(a => a.user.name).join(', ');
    return '未割当';
  };

  const toggleMilestone = (milestoneId: string) => {
    const newExpanded = new Set(expandedMilestones);
    if (newExpanded.has(milestoneId)) {
      newExpanded.delete(milestoneId);
    } else {
      newExpanded.add(milestoneId);
    }
    setExpandedMilestones(newExpanded);
  };

  const expandAllMilestones = () => {
    const ids = new Set<string>();
    milestones.forEach(m => ids.add(m.id));
    ids.add('none');
    setExpandedMilestones(ids);
  };

  const collapseAllMilestones = () => {
    setExpandedMilestones(new Set());
  };

  const calculateGroupProgress = (groupTasks: Task[]): number => {
    if (groupTasks.length === 0) return 0;
    const completed = groupTasks.filter(t => t.status === 'done').length;
    return Math.round((completed / groupTasks.length) * 100);
  };

  // タスクの進捗状況を判定（予定通り、遅延、進んでいる）
  const getTaskProgressStatus = (task: Task) => {
    if (!task.dueDate || !task.startDate) return 'unknown';
    if (task.status === 'done') return 'completed';

    const today = startOfDay(new Date());
    const startDate = startOfDay(parseISO(task.startDate));
    const dueDate = startOfDay(parseISO(task.dueDate));

    // スケジュール進捗：どこまで進むべきか
    const totalDays = differenceInDays(dueDate, startDate);
    if (totalDays <= 0) return 'unknown';

    const elapsedDays = differenceInDays(today, startDate);
    const expectedProgress = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));

    const actualProgress = task.progress || 0;
    const margin = 5; // 5%の余裕

    if (actualProgress >= expectedProgress - margin) {
      return 'on-track'; // 予定通り
    } else if (isAfter(today, dueDate)) {
      return 'overdue'; // 期限超過
    } else {
      return 'behind'; // 遅れている
    }
  };

  const renderGroupHeader = (group: MilestoneGroup) => {
    const stats = {
      total: group.tasks.length,
      completed: group.tasks.filter(t => t.status === 'done').length,
      inProgress: group.tasks.filter(t => t.status === 'in_progress').length,
    };
    const progress = calculateGroupProgress(group.tasks);

    return (
      <div className="flex border-b border-gray-200 bg-gradient-to-r from-indigo-50/80 to-blue-50/80 h-16">
        {/* 左側（固定） */}
        <div className="w-96 flex-shrink-0 px-3 border-r border-gray-200 h-full flex items-center sticky left-0 z-30 bg-indigo-50/80">
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={() => toggleMilestone(group.milestone?.id || 'none')}
              className="p-1 hover:bg-indigo-100 rounded transition-colors flex-shrink-0"
            >
              {group.isExpanded ? (
                <ChevronDown className="w-5 h-5 text-gray-700" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-700" />
              )}
            </button>

            {group.milestone ? (
              <>
                <Flag className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-gray-900 text-sm truncate">{group.milestone.name}</h3>
                  <p className="text-xs text-gray-600">
                    期限: {format(parseISO(group.milestone.dueDate), 'M/dd', { locale: ja })}
                    {group.milestone.status === 'completed' && ' (完了)'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <Clock className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <h3 className="font-bold text-gray-600 text-sm">マイルストーン未設定</h3>
              </>
            )}
          </div>
        </div>

        {/* 右側（スクロール可能） */}
        <div className="flex-1 px-3 h-full flex items-center gap-4 text-sm min-w-0">
          <span className="text-gray-600 flex-shrink-0">{stats.total}タスク</span>
          <span className="text-green-600 flex-shrink-0">完了: {stats.completed}</span>
          <span className="text-blue-600 flex-shrink-0">進行中: {stats.inProgress}</span>
          <span className="text-gray-700 font-semibold flex-shrink-0">進捗: {progress}%</span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white flex flex-col h-full">
      {/* ツールバー（1行に統合） */}
      <div className="px-3 py-1.5 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* フィルター */}
          <Filter className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs border border-gray-300 rounded px-1.5 py-1"
          >
            <option value="all">全ステータス</option>
            <option value="todo">未着手</option>
            <option value="in_progress">進行中</option>
            <option value="done">完了</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="text-xs border border-gray-300 rounded px-1.5 py-1"
          >
            <option value="all">全優先度</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-xs border border-gray-300 rounded px-1.5 py-1"
          >
            <option value="dueDate">期限順</option>
            <option value="priority">優先度順</option>
            <option value="status">ステータス順</option>
          </select>

          {milestones.length > 0 && (
            <>
              <div className="w-px h-4 bg-gray-300" />
              <button
                onClick={() => setGroupByMilestone(!groupByMilestone)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  groupByMilestone
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Flag className="w-3 h-3 inline mr-0.5" />
                マイルストーン別
              </button>
              {groupByMilestone && (
                <>
                  <button onClick={expandAllMilestones} className="text-[10px] text-gray-500 hover:text-gray-900">すべて展開</button>
                  <button onClick={collapseAllMilestones} className="text-[10px] text-gray-500 hover:text-gray-900">すべて折りたたむ</button>
                </>
              )}
            </>
          )}

          <div className="w-px h-4 bg-gray-300" />

          {/* ズーム */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded p-0.5">
            <button
              onClick={() => setCellWidth(30)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                cellWidth === 30 ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <ZoomOut className="w-3 h-3 inline" />
            </button>
            <button
              onClick={() => setCellWidth(50)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                cellWidth === 50 ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              中
            </button>
            <button
              onClick={() => setCellWidth(70)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                cellWidth === 70 ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <ZoomIn className="w-3 h-3 inline" />
            </button>
          </div>

          <button
            onClick={scrollToToday}
            className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
          >
            <Crosshair className="w-3 h-3 inline mr-0.5" />
            今日へ移動
          </button>
          <button
            onClick={() => setShowDependencies(!showDependencies)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              showDependencies
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Link2 className="w-3 h-3 inline mr-0.5" />
            依存関係{dependencyCount > 0 && ` (${dependencyCount})`}
          </button>
          <button
            onClick={() => {
              setConnectMode(!connectMode);
              setConnectFrom(null);
              setConnectPreviewEnd(null);
            }}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              connectMode
                ? 'bg-orange-500 text-white ring-2 ring-orange-300'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title="タスクバーをクリックして依存関係を作成"
          >
            <Link2 className="w-3 h-3 inline mr-0.5" />
            {connectMode
              ? (connectFrom ? '接続先を選択...' : '接続元を選択...')
              : '依存関係を結ぶ'}
          </button>
          <button
            onClick={() => setShowMyTasksOnly(!showMyTasksOnly)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              showMyTasksOnly
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <User className="w-3 h-3 inline mr-0.5" />
            自分のタスクのみ
          </button>

          {/* 統計情報（インライン） */}
          <div className="w-px h-4 bg-gray-300" />
          <span className="text-[10px] text-gray-500">
            完了 {stats.completed}/{stats.total} · 進行中 {stats.inProgress} · 遅延 {stats.overdue} · 達成率 {stats.completionRate}%
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto" ref={scrollContainerRef}
        onPointerMove={ganttDrag.dragState ? ganttDrag.onPointerMove : undefined}
        onPointerUp={ganttDrag.dragState ? ganttDrag.onPointerUp : undefined}
      >
        <div style={{ minWidth: `${384 + totalDays * cellWidth}px` }} className="relative" ref={contentRef}>
          {/* タイムラインヘッダー */}
          <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-30">
            <div className="w-96 flex-shrink-0 p-3 border-r border-gray-200 h-20 flex items-center sticky left-0 z-30 bg-gray-50">
              <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-700 w-full">
                <div className="col-span-5">タスク</div>
                <div className="col-span-2">優先度</div>
                <div className="col-span-2">担当者</div>
                <div className="col-span-3">期間</div>
              </div>
            </div>
            <div className="flex-1 flex h-20 relative">
              {days.map((day, index) => {
                const isFirstOfMonth = day.getDate() === 1;
                const isToday = isSameDay(day, new Date());
                const isWeekendDay = isWeekend(day);

                return (
                  <div
                    key={index}
                    ref={isToday ? todayMarkerRef : undefined}
                    className={`flex flex-col justify-center items-center border-r border-gray-200 ${
                      isToday ? 'bg-blue-100 border-l-2 border-l-blue-600' :
                      isWeekendDay ? 'bg-gray-100' : ''
                    }`}
                    style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px`, flexShrink: 0 }}
                  >
                    {isFirstOfMonth && (
                      <div className="text-xs font-bold text-gray-800 mb-1">
                        {format(day, 'M月', { locale: ja })}
                      </div>
                    )}
                    <div className={`text-xs ${
                      isToday ? 'text-blue-700 font-bold' :
                      isWeekendDay ? 'text-red-500' : 'text-gray-600'
                    }`}>
                      {format(day, 'd')}
                    </div>
                    <div className={`text-[10px] ${
                      isToday ? 'text-blue-600' :
                      isWeekendDay ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {format(day, 'E', { locale: ja })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* タスク行 */}
          <div
            className={`relative z-0${connectMode ? ' cursor-crosshair' : ''}`}
            ref={taskRowsRef}
            onClick={() => {
              if (connectMode && connectFrom) {
                setConnectFrom(null);
                setConnectPreviewEnd(null);
              }
            }}
          >
            {milestoneGroups.every(g => g.tasks.length === 0) ? (
              <div className="p-12 text-center text-gray-500">
                <Clock className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>表示するタスクがありません</p>
              </div>
            ) : (
              <>
              {milestoneGroups.map((group) => (
                <div key={group.milestone?.id || 'none'}>
                  {/* グループヘッダー（マイルストーン別表示時のみ） */}
                  {groupByMilestone && milestones.length > 0 && group.tasks.length > 0 && renderGroupHeader(group)}

                  {/* グループ内タスク */}
                  {group.isExpanded && group.tasks.map((task, rowIndex) => {
                const status = getTaskStatus(task);
                const barStyle = getTaskBarStyle(task);
                const myTask = isMyTask(task);
                const Icon = status.icon;
                const priority = getPriorityInfo(task.priority);
                const progress = getProgressPercentage(task);

                return (
                  <div
                    key={task.id}
                    data-gantt-task-id={task.id}
                    data-start-date={task.startDate || ''}
                    data-due-date={task.dueDate || ''}
                    className={`flex border-b border-gray-200 transition-colors ${
                      myTask ? 'bg-blue-50' : 'bg-white'
                    }`}
                  >
                    {/* タスク情報 */}
                    <div
                      className={`w-96 flex-shrink-0 p-3 border-r border-gray-200 h-24 flex items-center sticky left-0 z-40 cursor-pointer hover:bg-gray-100 transition-colors ${
                        myTask ? 'bg-blue-50' : 'bg-white'
                      }`}
                      onClick={() => router.push(`/tasks/${task.id}`)}
                    >
                      <div className="grid grid-cols-12 gap-2 items-center text-sm w-full">
                        <div className="col-span-5 min-w-0">
                          <div className="flex items-center gap-2">
                            {myTask && (
                              <User className="w-3 h-3 text-blue-600 flex-shrink-0" />
                            )}
                            <div className={`w-1 h-8 rounded ${priority.color} flex-shrink-0`} />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-gray-900 truncate text-xs">
                                {task.title}
                              </p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Icon className={`w-3 h-3 ${status.textColor}`} />
                                <span className={`text-[10px] ${status.textColor}`}>
                                  {status.label}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="col-span-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${priority.textColor} bg-opacity-10`}>
                            {priority.label}
                          </span>
                        </div>

                        <div className="col-span-2">
                          {task.assignee ? (
                            <div className="flex items-center gap-1">
                              <UserAvatar name={task.assignee.name} avatar={task.assignee.avatar} size="xs" />
                            </div>
                          ) : task.assignees && task.assignees.length > 0 ? (
                            <div className="flex items-center gap-1">
                              <UserAvatar name={task.assignees[0].user.name} avatar={task.assignees[0].user.avatar} size="xs" />
                              {task.assignees.length > 1 && (
                                <span className="text-[10px] text-gray-500">
                                  +{task.assignees.length - 1}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-400">未割当</span>
                          )}
                        </div>

                        <div className="col-span-3">
                          <div className="text-[10px] text-gray-600">
                            {task.startDate ? (
                              <span>{format(parseISO(task.startDate), 'M/d')}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                            <span className="mx-1">→</span>
                            {task.dueDate ? (
                              <span>{format(parseISO(task.dueDate), 'M/d')}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* タイムラインバー */}
                    <div className="flex-1 relative h-24">
                      {/* グリッド線 */}
                      <div className="absolute inset-0 flex">
                        {days.map((day, i) => (
                          <div
                            key={i}
                            className={`border-r border-gray-100 ${
                              isWeekend(day) ? 'bg-gray-50' : ''
                            }`}
                            style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px`, flexShrink: 0 }}
                          />
                        ))}
                      </div>

                      {/* 今日の線 */}
                      {(() => {
                        const today = new Date();
                        const todayIndex = days.findIndex(day => isSameDay(day, today));
                        if (todayIndex !== -1) {
                          const isFirstExpandedGroup = group === milestoneGroups.find(g => g.isExpanded && g.tasks.length > 0);
                          const isFirstTask = rowIndex === 0;
                          return (
                            <div
                              className="absolute w-0.5 bg-blue-600 pointer-events-none"
                              style={{
                                left: `${(todayIndex + 0.5) * cellWidth}px`,
                                top: 0,
                                bottom: 0,
                                zIndex: 25,
                              }}
                            >
                              {isFirstTask && isFirstExpandedGroup && (
                                <div className="absolute left-1/2 transform -translate-x-1/2 -top-0">
                                  <div className="bg-blue-600 text-white text-[9px] px-1 py-0.5 rounded whitespace-nowrap shadow">
                                    今日
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {barStyle && (() => {
                        const progressStatus = getTaskProgressStatus(task);
                        // 進捗状況に応じたバーの色分け
                        const progressStatusColor = {
                          'on-track': 'bg-blue-500 border-blue-600',      // 予定通り
                          'behind': 'bg-yellow-500 border-yellow-600',    // 遅れている
                          'overdue': 'bg-red-500 border-red-600',         // 期限超過
                          'completed': 'bg-green-500 border-green-600',   // 完了
                          'unknown': status.bgColor + ' ' + status.borderColor
                        }[progressStatus];

                        const barLeft = parseInt(barStyle.left);
                        const barWidth = parseInt(barStyle.width);
                        const previewStyle = ganttDrag.getPreviewStyle(task.id, barLeft, barWidth);
                        const isDragging = ganttDrag.dragState?.taskId === task.id;
                        const datePreview = ganttDrag.getDatePreview(task.id, task.startDate, task.dueDate);

                        return (
                        <div
                          className={`absolute ${progressStatusColor} rounded-lg shadow-sm flex items-center border-2 group z-0 select-none transition-all ${
                            isDragging ? 'shadow-lg opacity-80 z-30 cursor-grabbing' :
                            connectMode && connectFrom && alreadyConnectedIds.has(task.id) ? 'cursor-not-allowed opacity-40' :
                            connectMode ? 'cursor-pointer' : 'cursor-grab'
                          } ${connectMode && connectFrom === task.id ? 'ring-2 ring-orange-400 ring-offset-1' : ''} ${
                            connectMode && connectFrom && task.id !== connectFrom && !alreadyConnectedIds.has(task.id) && hoveredConnectId === task.id ? 'ring-2 ring-green-400 ring-offset-1 brightness-110' : ''
                          }`}
                          style={{
                            left: previewStyle.left,
                            width: previewStyle.width,
                            top: '8px',
                            height: '28px',
                            minWidth: '60px',
                          }}
                          onMouseEnter={(e) => {
                            e.stopPropagation();
                            if (!ganttDrag.dragState && !connectMode) setHoveredTaskId(task.id);
                            if (connectMode) setHoveredConnectId(task.id);
                          }}
                          onMouseLeave={() => { setHoveredTaskId(null); setHoveredConnectId(null); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!connectMode) return;
                            if (!connectFrom) {
                              setConnectFrom(task.id);
                            } else if (connectFrom === task.id) {
                              setConnectFrom(null);
                              setConnectPreviewEnd(null);
                            } else if (alreadyConnectedIds.has(task.id)) {
                              // 既に依存関係あり - 何もしない
                              return;
                            } else {
                              taskService.addDependency(task.id, connectFrom).then(() => {
                                onUpdate();
                                setConnectFrom(null);
                                setConnectPreviewEnd(null);
                              }).catch(err => console.error('依存関係の追加に失敗:', err));
                            }
                          }}
                        >
                          {/* Left resize handle */}
                          <div
                            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 rounded-l-lg z-10"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              ganttDrag.onPointerDown(e, task.id, 'resize-left', barLeft, barWidth);
                            }}
                          />

                          <div
                            className="flex items-center px-2 flex-1 min-w-0"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              ganttDrag.onPointerDown(e, task.id, 'move', barLeft, barWidth);
                            }}
                          >
                          <Icon className="w-3 h-3 text-white flex-shrink-0" />
                          <span className="text-[10px] text-white font-medium truncate ml-1">
                            {task.title}
                          </span>
                          {task.dueDate && (
                            <span className="text-[9px] text-white opacity-75 ml-auto flex-shrink-0">
                              {format(parseISO(task.dueDate), 'HH:mm')}
                            </span>
                          )}
                          </div>

                          {/* Right resize handle */}
                          <div
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 rounded-r-lg z-10"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              ganttDrag.onPointerDown(e, task.id, 'resize-right', barLeft, barWidth);
                            }}
                          />

                          {/* Date preview tooltip during drag */}
                          {isDragging && datePreview && (
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg z-50 pointer-events-none">
                              {datePreview.newStart ? format(datePreview.newStart, 'M/d') : '-'}
                              {' → '}
                              {datePreview.newEnd ? format(datePreview.newEnd, 'M/d') : '-'}
                            </div>
                          )}

                          {/* ツールチップ */}
                          {hoveredTaskId === task.id && (() => {
                            const progressStatus = getTaskProgressStatus(task);
                            const progressStatusText = {
                              'on-track': '予定通り ✓',
                              'behind': '遅れている ⚠',
                              'overdue': '期限超過 ✕',
                              'completed': '完了 ✓',
                              'unknown': '-'
                            }[progressStatus];
                            const progressStatusColor = {
                              'on-track': 'text-green-300',
                              'behind': 'text-yellow-300',
                              'overdue': 'text-red-300',
                              'completed': 'text-green-300',
                              'unknown': 'text-gray-300'
                            }[progressStatus];

                            return (
                              <div
                                className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg z-40 pointer-events-none whitespace-normal max-w-xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="font-semibold mb-2">{task.title}</div>
                                <div className="space-y-1 text-gray-200 border-b border-gray-700 pb-2 mb-2">
                                  <div className="font-medium text-white">計画</div>
                                  <div>開始: {task.startDate ? format(parseISO(task.startDate), 'yyyy/M/d') : '未設定'}</div>
                                  <div>期限: {task.dueDate ? format(parseISO(task.dueDate), 'yyyy/M/d') : '未設定'}</div>
                                </div>
                                {task.actualStartDate && (
                                  <div className="space-y-1 text-gray-200 border-b border-gray-700 pb-2 mb-2">
                                    <div className="font-medium text-white">実績</div>
                                    <div>開始: {format(parseISO(task.actualStartDate), 'yyyy/M/d HH:mm')}</div>
                                    <div>
                                      {task.actualEndDate
                                        ? `終了: ${format(parseISO(task.actualEndDate), 'yyyy/M/d HH:mm')}`
                                        : '進行中'
                                      }
                                    </div>
                                  </div>
                                )}
                                <div className="space-y-1 text-gray-200 border-b border-gray-700 pb-2 mb-2">
                                  <div className={`font-semibold ${progressStatusColor}`}>{progressStatusText}</div>
                                  <div>進捗: {progress}%</div>
                                </div>
                                {(task.estimatedHours || task.actualHours) && (
                                  <div className="space-y-1 text-gray-200 border-b border-gray-700 pb-2 mb-2">
                                    {task.estimatedHours && (
                                      <div>推定工数: {task.estimatedHours}h</div>
                                    )}
                                    {task.actualHours && (
                                      <div>実績工数: {task.actualHours}h</div>
                                    )}
                                    {task.estimatedHours && task.actualHours && (
                                      <div className={task.actualHours > task.estimatedHours ? 'text-orange-300' : 'text-green-300'}>
                                        差分: {task.actualHours > task.estimatedHours ? '+' : ''}{task.actualHours - task.estimatedHours}h
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="text-gray-200">担当: {getAssigneeName(task)}</div>
                                <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                              </div>
                            );
                          })()}

                          {/* 接続モード用ツールチップ */}
                          {connectMode && hoveredConnectId === task.id && (() => {
                            let msg = '';
                            let bgColor = '#374151';
                            if (!connectFrom) {
                              msg = 'クリックして接続元に設定';
                              bgColor = '#374151';
                            } else if (connectFrom === task.id) {
                              msg = 'クリックでキャンセル';
                              bgColor = '#c2410c';
                            } else if (alreadyConnectedIds.has(task.id)) {
                              msg = '既に依存関係があります';
                              bgColor = '#b91c1c';
                            } else {
                              msg = 'クリックして依存関係を追加';
                              bgColor = '#15803d';
                            }
                            return (
                              <div
                                className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 text-white text-xs rounded-lg px-3 py-1.5 shadow-lg z-50 pointer-events-none whitespace-nowrap font-medium"
                                style={{ backgroundColor: bgColor }}
                              >
                                {msg}
                                <div
                                  className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent"
                                  style={{ borderTopColor: bgColor }}
                                />
                              </div>
                            );
                          })()}
                        </div>
                        );
                      })()}

                      {/* 実績バー（下段） */}
                      {(() => {
                        const actualStyle = getActualBarStyle(task);
                        if (!actualStyle) return null;

                        const actualColor = getActualBarColor(task);

                        return (
                          <div
                            className={`absolute ${actualColor} rounded shadow-sm flex items-center px-2 border z-0`}
                            style={{
                              ...actualStyle,
                              top: '30px',
                              height: '24px',
                            }}
                            onMouseEnter={(e) => { e.stopPropagation(); setHoveredTaskId(task.id); }}
                            onMouseLeave={() => setHoveredTaskId(null)}
                          >
                            <span className="text-[9px] text-gray-700 font-medium truncate">
                              実績
                              {!task.actualEndDate && ' (進行中)'}
                            </span>
                          </div>
                        );
                      })()}

                      {/* 今日の線 */}
                    </div>
                  </div>
                  );
                  })}
                </div>
              ))}

              {/* 依存関係の矢印 & 接続プレビュー（SVGオーバーレイ） */}
              {((showDependencies && dependencyLines.length > 0) || (connectMode && connectFrom)) && (
                <svg
                  ref={svgRef}
                  className="absolute left-96 z-20"
                  style={{
                    pointerEvents: 'none',
                    width: `${days.length * cellWidth}px`,
                    height: `${(() => {
                      let totalHeight = 0;
                      const headerHeight = 64; // h-16 = 64px
                      const rowHeight = 96; // h-24 = 96px
                      const showGroupHeaders = groupByMilestone && milestones.length > 0;
                      milestoneGroups.forEach(group => {
                        if (showGroupHeaders && group.tasks.length > 0) {
                          totalHeight += headerHeight;
                        }
                        if (group.isExpanded) {
                          totalHeight += group.tasks.length * rowHeight;
                        }
                      });
                      return totalHeight;
                    })()}px`,
                    top: 0,
                  }}
                >
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon
                        points="0 0, 10 3.5, 0 7"
                        fill="#8b5cf6"
                      />
                    </marker>
                    <marker
                      id="arrowhead-preview"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon
                        points="0 0, 10 3.5, 0 7"
                        fill="#f97316"
                      />
                    </marker>
                  </defs>
                  {/* 接続プレビューライン */}
                  {connectMode && connectFrom && connectPreviewEnd && (() => {
                    const fromPos = taskPositionMap.get(connectFrom);
                    if (!fromPos) return null;
                    return (
                      <g key="connect-preview">
                        <line
                          x1={fromPos.endX} y1={fromPos.y}
                          x2={connectPreviewEnd.x} y2={connectPreviewEnd.y}
                          stroke="#f97316"
                          strokeWidth="2"
                          strokeDasharray="5 3"
                          opacity="0.85"
                          markerEnd="url(#arrowhead-preview)"
                        />
                        <circle cx={fromPos.endX} cy={fromPos.y} r="5" fill="#f97316" opacity="0.9" />
                      </g>
                    );
                  })()}

                  {showDependencies && dependencyLines.map((line, index) => {
                    const startX = line.fromEndX;
                    const endX = line.toStartX;
                    const midX = startX + (endX - startX) / 2;
                    const midY = (line.fromY + line.toY) / 2;
                    const isHovered = hoveredDepIndex === index;

                    const path = line.fromY === line.toY
                      ? `M ${startX} ${line.fromY} L ${endX - 5} ${line.toY}`
                      : `M ${startX} ${line.fromY} C ${midX} ${line.fromY}, ${midX} ${line.toY}, ${endX - 5} ${line.toY}`;

                    return (
                      <g key={index} className="dependency-line" data-from={line.fromTaskId} data-to={line.toTaskId}>
                        {/* 依存関係ライン（見た目） */}
                        <path
                          d={path}
                          fill="none"
                          stroke={isHovered ? '#7c3aed' : '#8b5cf6'}
                          strokeWidth={isHovered ? 2.5 : 2}
                          strokeDasharray="4 2"
                          markerEnd="url(#arrowhead)"
                          opacity={isHovered ? 1 : 0.7}
                          style={{ pointerEvents: 'none' }}
                        />
                        <circle
                          cx={startX}
                          cy={line.fromY}
                          r={isHovered ? 5 : 4}
                          fill={isHovered ? '#7c3aed' : '#8b5cf6'}
                          opacity={isHovered ? 1 : 0.7}
                          style={{ pointerEvents: 'none' }}
                        />
                        {/* 接続モード時のみ: 透明なhoverエリアと削除ボタン */}
                        {connectMode && (
                          <>
                            <path
                              d={path}
                              fill="none"
                              stroke="transparent"
                              strokeWidth="14"
                              style={{ pointerEvents: 'all', cursor: 'pointer' }}
                              onMouseEnter={() => setHoveredDepIndex(index)}
                              onMouseLeave={() => setHoveredDepIndex(null)}
                            />
                            {isHovered && (
                              <g>
                                <rect
                                  x={midX - 50}
                                  y={midY - 34}
                                  width="100"
                                  height="18"
                                  rx="4"
                                  fill="#1f2937"
                                  opacity="0.9"
                                  style={{ pointerEvents: 'none' }}
                                />
                                <text
                                  x={midX}
                                  y={midY - 22}
                                  textAnchor="middle"
                                  fill="white"
                                  fontSize="11"
                                  style={{ pointerEvents: 'none' }}
                                >
                                  クリックで削除
                                </text>
                                <g
                                  transform={`translate(${midX}, ${midY})`}
                                  style={{ pointerEvents: 'all', cursor: 'pointer' }}
                                  onMouseEnter={() => setHoveredDepIndex(index)}
                                  onMouseLeave={() => setHoveredDepIndex(null)}
                                  onClick={() => handleDeleteDependency(line.toTaskId, line.fromTaskId)}
                                >
                                  <circle r="11" fill="#ef4444" />
                                  <line x1="-5" y1="-5" x2="5" y2="5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                                  <line x1="5" y1="-5" x2="-5" y2="5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                                </g>
                              </g>
                            )}
                          </>
                        )}
                      </g>
                    );
                  })}
                </svg>
              )}

              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
