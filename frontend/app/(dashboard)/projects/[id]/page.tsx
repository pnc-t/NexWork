'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { projectService } from '@/services/project.service';
import { taskService } from '@/services/task.service';
import { milestoneService } from '@/services/milestone.service';
import { useAuthStore } from '@/lib/auth-store';
import { Project } from '@/types/project';
import { Task, Milestone } from '@/types/task';
import { wsClient } from '@/lib/websocket-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Users, Calendar as CalendarIcon, LayoutGrid, List, BarChart3, GitBranch, Trash2, MoreVertical, X } from 'lucide-react';
import { CreateTaskDialog } from '@/components/tasks/create-task-dialog';
import { TaskBoard } from '@/components/tasks/task-board';
import { TaskList } from '@/components/tasks/task-list';
import { TaskCalendarView } from '@/components/tasks/task-calendar-view';
import { GanttChart } from '@/components/tasks/gantt-chart';
import { WBSView } from '@/components/tasks/wbs-view';
import { MemberManagement } from '@/components/projects/member-management';

type ViewMode = 'board' | 'list' | 'calendar' | 'gantt' | 'wbs';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { user } = useAuthStore();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<{
    todo: Task[];
    in_progress: Task[];
    done: Task[];
  }>({ todo: [], in_progress: [], done: [] });
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showMemberDialog, setShowMemberDialog] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('gantt');
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwner = project?.members.some(m => m.user.id === user?.id && m.role === 'owner') ?? false;

  useEffect(() => {
    loadProject();
    loadTasks();
    loadMilestones();

    wsClient.joinProject(projectId);

    const handleTaskCreated = (data: any) => {
      if (data.projectId === projectId) {
        loadTasks();
      }
    };

    const handleTaskUpdated = (data: any) => {
      if (data.projectId === projectId) {
        loadTasks();
      }
    };

    const handleTaskDeleted = (data: any) => {
      if (data.projectId === projectId) {
        loadTasks();
      }
    };

    const handleMemberAdded = (data: any) => {
      if (data.projectId === projectId) {
        loadProject();
      }
    };

    const handleMemberRemoved = (data: any) => {
      if (data.projectId === projectId) {
        loadProject();
      }
    };

    wsClient.on('task:created', handleTaskCreated);
    wsClient.on('task:updated', handleTaskUpdated);
    wsClient.on('task:deleted', handleTaskDeleted);
    wsClient.on('member:added', handleMemberAdded);
    wsClient.on('member:removed', handleMemberRemoved);

    return () => {
      wsClient.leaveProject(projectId);
      wsClient.off('task:created', handleTaskCreated);
      wsClient.off('task:updated', handleTaskUpdated);
      wsClient.off('task:deleted', handleTaskDeleted);
      wsClient.off('member:added', handleMemberAdded);
      wsClient.off('member:removed', handleMemberRemoved);
    };
  }, [projectId]);


  // ガントモード時はmainのスクロールとパディングを無効化
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    if (viewMode === 'gantt') {
      main.style.overflowY = 'hidden';
      main.style.padding = '0';
    }
    return () => {
      main.style.overflowY = '';
      main.style.padding = '';
    };
  }, [viewMode]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const loadProject = async () => {
    try {
      const data = await projectService.getById(projectId);
      setProject(data);
    } catch (error) {
      console.error('Failed to load project:', error);
    }
  };

  const loadTasks = async () => {
    try {
      const data = await taskService.getByStatus(projectId);
      setTasks(data);
      const all = [...data.todo, ...data.in_progress, ...data.done];
      setAllTasks(all);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load tasks:', error);
      setIsLoading(false);
    }
  };

  const loadMilestones = async () => {
    try {
      const data = await milestoneService.getAll(projectId);
      setMilestones(data);
    } catch (error) {
      console.error('Failed to load milestones:', error);
    }
  };

  const handleTaskCreated = () => {
    loadTasks();
    setShowCreateDialog(false);
  };

  const handleDeleteProject = () => {
    setShowDeleteDialog(true);
    setShowMenu(false);
  };

  const executeDeleteProject = async () => {
    setDeleteError('');
    try {
      await projectService.delete(projectId);
      router.push('/projects');
    } catch (err: any) {
      setDeleteError(err.response?.data?.message || 'プロジェクトの削除に失敗しました');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">プロジェクトが見つかりません</p>
      </div>
    );
  }

  return (
    <div className={viewMode === 'gantt' ? 'flex flex-col h-full' : ''}>
      {/* ヘッダー */}
      <div className={`flex items-start justify-between ${viewMode === 'gantt' ? 'px-4 lg:px-6 pt-3 pb-1 flex-shrink-0' : 'mb-6'}`}>
        <div className="flex-1 min-w-0">
          {viewMode === 'gantt' ? (
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-gray-900 truncate">{project.name}</h1>
              <button
                onClick={() => setShowMemberDialog(true)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors flex-shrink-0"
              >
                <Users className="w-3 h-3" />
                <span>{project.members.length}</span>
              </button>
              <span className="text-xs text-gray-500 flex-shrink-0">{allTasks.length} タスク</span>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              {project.description && (
                <p className="text-gray-600 mt-1">{project.description}</p>
              )}
              <div className="flex items-center gap-4 mt-3">
                <button
                  onClick={() => setShowMemberDialog(true)}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <Users className="w-4 h-4" />
                  <span>{project.members.length} メンバー</span>
                </button>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>{allTasks.length} タスク</span>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOwner && (
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-40">
                  <button
                    onClick={handleDeleteProject}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 rounded-md"
                  >
                    <Trash2 className="w-4 h-4" />
                    削除
                  </button>
                </div>
              )}
            </div>
          )}
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            タスクを追加
          </Button>
        </div>
      </div>

      {/* ビュー切り替え */}
      <div className={`flex gap-2 border-b border-gray-200 overflow-x-auto flex-shrink-0 ${viewMode === 'gantt' ? 'px-4 lg:px-6' : 'mb-6'}`}>
        <button
          onClick={() => setViewMode('board')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${
            viewMode === 'board'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          <span>ボード</span>
        </button>
        <button
          onClick={() => setViewMode('list')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${
            viewMode === 'list'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <List className="w-4 h-4" />
          <span>リスト</span>
        </button>
        <button
          onClick={() => setViewMode('calendar')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${
            viewMode === 'calendar'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          <span>カレンダー</span>
        </button>
        <button
          onClick={() => setViewMode('gantt')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${
            viewMode === 'gantt'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>ガントチャート</span>
        </button>
        <button
          onClick={() => setViewMode('wbs')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${
            viewMode === 'wbs'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          <span>WBS</span>
        </button>
      </div>

      {/* コンテンツエリア */}
      {viewMode === 'board' && <TaskBoard tasks={tasks} onUpdate={loadTasks} />}
      {viewMode === 'list' && <TaskList tasks={allTasks} onUpdate={loadTasks} />}
      {viewMode === 'calendar' && <TaskCalendarView tasks={allTasks} onUpdate={loadTasks} milestones={milestones} projectId={projectId} />}
      {viewMode === 'gantt' && (
        <div className="flex-1 overflow-hidden">
          <GanttChart tasks={allTasks} onUpdate={loadTasks} milestones={milestones} />
        </div>
      )}
      {viewMode === 'wbs' && <WBSView tasks={allTasks} onUpdate={loadTasks} />}

      {/* ダイアログ */}
      <CreateTaskDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={handleTaskCreated}
        projectId={projectId}
      />

      <MemberManagement
        open={showMemberDialog}
        onClose={() => setShowMemberDialog(false)}
        project={project}
        onUpdate={loadProject}
      />

      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">プロジェクトの削除</h2>
              <button
                onClick={() => {
                  setShowDeleteDialog(false);
                  setConfirmName('');
                  setDeleteError('');
                }}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                「{project?.name}」を削除すると、以下のデータが永続的に削除されます：
              </p>

              <ul className="text-sm text-gray-600 mb-6 list-disc list-inside space-y-1">
                <li>全てのタスクとサブタスク</li>
                <li>メンバー情報</li>
                <li>マイルストーン</li>
              </ul>

              <p className="text-sm text-gray-700 font-medium mb-2">
                確認のためにプロジェクト名を入力してください：
              </p>

              <div className="mb-4">
                <Label htmlFor="confirmProjectName" className="text-gray-900">
                  <span className="font-semibold">{project?.name}</span>
                </Label>
                <Input
                  id="confirmProjectName"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder="プロジェクト名を入力"
                  className="mt-1"
                />
              </div>

              {deleteError && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm mb-4">
                  {deleteError}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setConfirmName('');
                    setDeleteError('');
                  }}
                  className="flex-1"
                >
                  キャンセル
                </Button>
                <button
                  disabled={confirmName !== project?.name}
                  onClick={executeDeleteProject}
                  className="flex-1 h-10 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}