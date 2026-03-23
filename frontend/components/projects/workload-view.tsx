'use client';

import { useMemo } from 'react';
import { Task } from '@/types/task';
import { UserAvatar } from '@/components/ui/user-avatar';

interface WorkloadViewProps {
  tasks: Task[];
}

interface MemberWorkload {
  userId: string;
  name: string;
  avatar?: string | null;
  totalTasks: number;
  todoCount: number;
  inProgressCount: number;
  doneCount: number;
  estimatedHours: number;
  actualHours: number;
  completionRate: number;
}

export function WorkloadView({ tasks }: WorkloadViewProps) {
  const workloads = useMemo(() => {
    const memberMap = new Map<string, MemberWorkload>();

    for (const task of tasks) {
      const assignees = task.assignees || [];
      if (assignees.length === 0) continue;

      for (const assignee of assignees) {
        const userId = assignee.user.id;
        if (!memberMap.has(userId)) {
          memberMap.set(userId, {
            userId,
            name: assignee.user.name,
            avatar: assignee.user.avatar,
            totalTasks: 0,
            todoCount: 0,
            inProgressCount: 0,
            doneCount: 0,
            estimatedHours: 0,
            actualHours: 0,
            completionRate: 0,
          });
        }

        const member = memberMap.get(userId)!;
        member.totalTasks++;
        if (task.status === 'todo') member.todoCount++;
        else if (task.status === 'in_progress') member.inProgressCount++;
        else if (task.status === 'done') member.doneCount++;
        member.estimatedHours += task.estimatedHours || 0;
        member.actualHours += task.actualHours || 0;
      }
    }

    for (const member of memberMap.values()) {
      member.completionRate = member.totalTasks > 0
        ? Math.round((member.doneCount / member.totalTasks) * 100)
        : 0;
    }

    return Array.from(memberMap.values()).sort((a, b) => b.totalTasks - a.totalTasks);
  }, [tasks]);

  const maxTasks = Math.max(...workloads.map((w) => w.totalTasks), 1);

  if (workloads.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200 p-12 text-center">
        <p className="text-gray-500">担当者が割り当てられたタスクがありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {workloads.map((member) => (
        <div key={member.userId} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3 mb-3">
            <UserAvatar
              name={member.name}
              avatar={member.avatar}
              size="md"
            />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900">{member.name}</h3>
              <p className="text-xs text-gray-500">
                {member.totalTasks}タスク / 完了率 {member.completionRate}%
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">工数</p>
              <p className="text-sm font-medium text-gray-900">
                {member.actualHours > 0 ? `${member.actualHours}h` : '-'}
                {member.estimatedHours > 0 && (
                  <span className="text-gray-400"> / {member.estimatedHours}h</span>
                )}
              </p>
            </div>
          </div>

          {/* タスク分布バー */}
          <div className="flex h-5 rounded-full overflow-hidden bg-gray-100">
            {member.doneCount > 0 && (
              <div
                className="bg-green-500 flex items-center justify-center"
                style={{ width: `${(member.doneCount / maxTasks) * 100}%` }}
              >
                {member.doneCount >= 2 && (
                  <span className="text-[10px] text-white font-medium">{member.doneCount}</span>
                )}
              </div>
            )}
            {member.inProgressCount > 0 && (
              <div
                className="bg-blue-500 flex items-center justify-center"
                style={{ width: `${(member.inProgressCount / maxTasks) * 100}%` }}
              >
                {member.inProgressCount >= 2 && (
                  <span className="text-[10px] text-white font-medium">{member.inProgressCount}</span>
                )}
              </div>
            )}
            {member.todoCount > 0 && (
              <div
                className="bg-gray-300 flex items-center justify-center"
                style={{ width: `${(member.todoCount / maxTasks) * 100}%` }}
              >
                {member.todoCount >= 2 && (
                  <span className="text-[10px] text-gray-600 font-medium">{member.todoCount}</span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />完了 {member.doneCount}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />進行中 {member.inProgressCount}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />未着手 {member.todoCount}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
