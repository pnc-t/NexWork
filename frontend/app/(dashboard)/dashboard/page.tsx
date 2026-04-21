'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { taskService } from '@/services/task.service';
import { projectService } from '@/services/project.service';
import { Task } from '@/types/task';
import { Project } from '@/types/project';
import { CheckSquare, FolderKanban, Clock, TrendingUp, ArrowRight, Calendar, Flag, AlertTriangle, ChevronDown, Zap } from 'lucide-react';
import { format, parseISO, differenceInDays, startOfDay, isAfter } from 'date-fns';
import { ja } from 'date-fns/locale';
import { CompletionTrendChart } from '@/components/dashboard/completion-trend-chart';
import { ActivityFeed } from '@/components/dashboard/activity-feed';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showMoreFocus, setShowMoreFocus] = useState(false);
  const [showMoreUpcoming, setShowMoreUpcoming] = useState(false);
  const [showOverdue, setShowOverdue] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [tasksData, projectsData] = await Promise.all([
        taskService.getAll(),
        projectService.getAll(),
      ]);
      setTasks(tasksData);
      setProjects(projectsData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 統計情報の計算
  const overdueTasks = tasks.filter(t => {
    if (!t.dueDate || t.status === 'done') return false;
    const today = startOfDay(new Date());
    const dueDate = startOfDay(parseISO(t.dueDate));
    return isAfter(today, dueDate);
  });

  const todoCount = tasks.filter(t => t.status === 'todo').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const doneCount = tasks.filter(t => t.status === 'done').length;
  const totalTasks = tasks.length;
  const completionRate = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;

  const dueSoonCount = tasks.filter(t => {
    if (!t.dueDate || t.status === 'done') return false;
    const today = startOfDay(new Date());
    const dueDate = startOfDay(parseISO(t.dueDate));
    const daysUntilDue = differenceInDays(dueDate, today);
    return daysUntilDue >= 0 && daysUntilDue <= 3;
  }).length;

  // 今やること: 進行中 → 優先度高 → 優先度中 → 期限近い順
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const focusTasks = tasks
    .filter(t => t.status !== 'done')
    .sort((a, b) => {
      if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
      if (a.status !== 'in_progress' && b.status === 'in_progress') return 1;
      const pA = priorityOrder[a.priority] ?? 2;
      const pB = priorityOrder[b.priority] ?? 2;
      if (pA !== pB) return pA - pB;
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

  const displayedFocusTasks = focusTasks.slice(0, showMoreFocus ? 10 : 5);

  // 期限が近いタスク (期限昇順)
  const upcomingTasks = tasks
    .filter(t => {
      if (!t.dueDate || t.status === 'done') return false;
      const today = startOfDay(new Date());
      const dueDate = startOfDay(parseISO(t.dueDate));
      return differenceInDays(dueDate, today) >= 0;
    })
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  const displayedUpcomingTasks = upcomingTasks.slice(0, showMoreUpcoming ? 10 : 5);

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'done': return 'bg-green-100 text-green-700';
      case 'in_progress': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusText = (status: Task['status']) => {
    switch (status) {
      case 'done': return '完了';
      case 'in_progress': return '進行中';
      default: return '未着手';
    }
  };

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'high': return 'text-red-600';
      case 'medium': return 'text-yellow-600';
      default: return 'text-green-600';
    }
  };

  const getPriorityLabel = (priority: Task['priority']) => {
    switch (priority) {
      case 'high': return '高';
      case 'medium': return '中';
      default: return '低';
    }
  };

  const getDaysUntilDue = (dueDate: string) => {
    const today = startOfDay(new Date());
    const due = startOfDay(parseISO(dueDate));
    const days = differenceInDays(due, today);
    if (days < 0) return { text: `${Math.abs(days)}日超過`, color: 'text-red-600' };
    if (days === 0) return { text: '今日が期限', color: 'text-orange-600' };
    if (days === 1) return { text: '明日が期限', color: 'text-orange-600' };
    if (days <= 3) return { text: `残り${days}日`, color: 'text-orange-600' };
    return { text: `残り${days}日`, color: 'text-gray-500' };
  };

  const getProjectProgress = (project: Project) => {
    const projectTasks = tasks.filter(t => t.project?.id === project.id);
    if (projectTasks.length === 0) return 0;
    const completed = projectTasks.filter(t => t.status === 'done').length;
    return Math.round((completed / projectTasks.length) * 100);
  };

  const cycleStatus = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    const nextStatusMap: Record<string, string> = {
      todo: 'in_progress',
      in_progress: 'done',
      done: 'todo',
    };
    const nextStatus = nextStatusMap[task.status] || 'todo';
    try {
      await taskService.update(task.id, { status: nextStatus as any });
      loadData();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          おかえりなさい、{user?.name}さん
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {format(new Date(), 'yyyy年M月d日(E)', { locale: ja })}
        </p>
      </div>

      {/* 遅延タスクアラート */}
      {overdueTasks.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <button
            onClick={() => setShowOverdue(!showOverdue)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <span className="font-semibold text-red-800">
                {overdueTasks.length}件のタスクが期限を超過しています
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-red-600 transition-transform ${showOverdue ? 'rotate-180' : ''}`} />
          </button>
          {showOverdue && (
            <div className="mt-3 space-y-2 border-t border-red-200 pt-3">
              {overdueTasks.map(task => {
                const dueInfo = getDaysUntilDue(task.dueDate!);
                return (
                  <div
                    key={task.id}
                    onClick={() => router.push(`/tasks/${task.id}`)}
                    className="flex items-center justify-between py-2 px-3 bg-white rounded border border-red-100 cursor-pointer hover:bg-red-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-900 truncate flex-1">{task.title}</span>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className="text-xs font-medium text-red-600">{dueInfo.text}</span>
                      <button
                        onClick={(e) => cycleStatus(e, task)}
                        className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(task.status)} hover:opacity-80`}
                      >
                        {getStatusText(task.status)}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 統計カード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500 p-2 rounded-lg flex-shrink-0">
              <CheckSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500">進行中</p>
              <p className="text-2xl font-bold text-gray-900">{inProgressCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 p-2 rounded-lg flex-shrink-0">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500">期限間近（3日以内）</p>
              <p className="text-2xl font-bold text-gray-900">{dueSoonCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-green-500 p-2 rounded-lg flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500">完了率</p>
              <p className="text-2xl font-bold text-gray-900">{completionRate}%</p>
            </div>
          </div>
          {totalTasks > 0 && (
            <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full bg-green-500 transition-all"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          )}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-purple-500 p-2 rounded-lg flex-shrink-0">
              <FolderKanban className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500">プロジェクト</p>
              <p className="text-2xl font-bold text-gray-900">{projects.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* タスク分布バー */}
      {totalTasks > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">タスク全体（{totalTasks}件）</h2>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />完了 {doneCount}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />進行中 {inProgressCount}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" />未着手 {todoCount}
              </span>
            </div>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-200">
            {doneCount > 0 && (
              <div className="bg-green-500 transition-all" style={{ width: `${(doneCount / totalTasks) * 100}%` }} />
            )}
            {inProgressCount > 0 && (
              <div className="bg-blue-500 transition-all" style={{ width: `${(inProgressCount / totalTasks) * 100}%` }} />
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 今やること */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              <h2 className="text-base font-semibold text-gray-900">今やること</h2>
            </div>
            <button
              onClick={() => router.push('/tasks')}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
            >
              すべて見る <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {displayedFocusTasks.length > 0 ? (
              <>
                {displayedFocusTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => router.push(`/tasks/${task.id}`)}
                    className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-medium text-gray-900 flex-1 truncate">
                        {task.title}
                      </h3>
                      <button
                        onClick={(e) => cycleStatus(e, task)}
                        className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${getStatusColor(task.status)} hover:opacity-80`}
                        title="クリックでステータス変更"
                      >
                        {getStatusText(task.status)}
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      <span className={`flex items-center gap-0.5 ${getPriorityColor(task.priority)}`}>
                        <Flag className="w-3 h-3" />
                        優先度{getPriorityLabel(task.priority)}
                      </span>
                      {task.dueDate && (
                        <span className={`flex items-center gap-0.5 ${getDaysUntilDue(task.dueDate).color}`}>
                          <Calendar className="w-3 h-3" />
                          {getDaysUntilDue(task.dueDate).text}
                        </span>
                      )}
                      {task.project && (
                        <span className="flex items-center gap-0.5 text-gray-500">
                          <FolderKanban className="w-3 h-3" />
                          {task.project.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {focusTasks.length > 5 && (
                  <button
                    onClick={() => setShowMoreFocus(!showMoreFocus)}
                    className="w-full p-3 text-xs text-blue-600 hover:bg-gray-50 flex items-center justify-center gap-1"
                  >
                    {showMoreFocus ? '折りたたむ' : `残り${focusTasks.length - 5}件を表示`}
                    <ChevronDown className={`w-3 h-3 transition-transform ${showMoreFocus ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </>
            ) : (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-400">未完了のタスクはありません</p>
                <button
                  onClick={() => router.push('/tasks')}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >
                  タスクを追加する
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 期限が近いタスク */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              <h2 className="text-base font-semibold text-gray-900">期限が近いタスク</h2>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {displayedUpcomingTasks.length > 0 ? (
              <>
                {displayedUpcomingTasks.map((task) => {
                  const dueInfo = getDaysUntilDue(task.dueDate!);
                  return (
                    <div
                      key={task.id}
                      onClick={() => router.push(`/tasks/${task.id}`)}
                      className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <h3 className="text-sm font-medium text-gray-900 flex-1 truncate">
                          {task.title}
                        </h3>
                        {/* ステータスバッジ: 一貫したステータスカラー */}
                        <button
                          onClick={(e) => cycleStatus(e, task)}
                          className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${getStatusColor(task.status)} hover:opacity-80`}
                          title="クリックでステータス変更"
                        >
                          {getStatusText(task.status)}
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3 text-gray-500">
                          <span className="flex items-center gap-0.5">
                            <Calendar className="w-3 h-3" />
                            {format(parseISO(task.dueDate!), 'M月d日(E)', { locale: ja })}
                          </span>
                          <span className={`flex items-center gap-0.5 ${getPriorityColor(task.priority)}`}>
                            <Flag className="w-3 h-3" />
                            優先度{getPriorityLabel(task.priority)}
                          </span>
                        </div>
                        <span className={`font-medium ${dueInfo.color}`}>{dueInfo.text}</span>
                      </div>
                    </div>
                  );
                })}
                {upcomingTasks.length > 5 && (
                  <button
                    onClick={() => setShowMoreUpcoming(!showMoreUpcoming)}
                    className="w-full p-3 text-xs text-blue-600 hover:bg-gray-50 flex items-center justify-center gap-1"
                  >
                    {showMoreUpcoming ? '折りたたむ' : `残り${upcomingTasks.length - 5}件を表示`}
                    <ChevronDown className={`w-3 h-3 transition-transform ${showMoreUpcoming ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-sm text-gray-400">
                期限が近いタスクはありません
              </div>
            )}
          </div>
        </div>

        {/* 完了率推移チャート */}
        <div className="lg:col-span-2">
          <CompletionTrendChart tasks={tasks} />
        </div>

        {/* 最近のアクティビティ */}
        <div className="lg:col-span-2">
          <ActivityFeed tasks={tasks} />
        </div>

        {/* プロジェクト */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 lg:col-span-2">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-purple-500" />
              <h2 className="text-base font-semibold text-gray-900">プロジェクト</h2>
            </div>
            <button
              onClick={() => router.push('/projects')}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
            >
              すべて見る <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="p-4">
            {projects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {projects.slice(0, 4).map((project) => {
                  const progress = getProjectProgress(project);
                  const projectTasks = tasks.filter(t => t.project?.id === project.id);
                  const completedTasks = projectTasks.filter(t => t.status === 'done').length;
                  return (
                    <div
                      key={project.id}
                      onClick={() => router.push(`/projects/${project.id}`)}
                      className="p-4 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">{project.name}</h3>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {completedTasks} / {projectTasks.length} タスク完了
                          </p>
                        </div>
                        <span className={`text-sm font-bold ${progress === 100 ? 'text-green-600' : 'text-blue-600'}`}>
                          {progress}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 transition-all duration-300 ${
                            progress === 100 ? 'bg-green-500' :
                            progress >= 50 ? 'bg-blue-500' :
                            'bg-orange-500'
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-400">プロジェクトがありません</p>
                <button
                  onClick={() => router.push('/projects')}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >
                  プロジェクトを作成する
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
