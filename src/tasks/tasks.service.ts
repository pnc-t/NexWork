import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebSocketsGateway } from '../websockets/websockets.gateway';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { ReorderSubtasksDto } from './dto/reorder-subtasks.dto';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';

@Injectable()
export class TasksService {
  constructor(
      private readonly prisma: PrismaService,
      private readonly websockets: WebSocketsGateway,
  ) {
  }

  async create(userId: string, createTaskDto: CreateTaskDto) {
    const {projectId, dependsOn, assigneeId, ...taskData} = createTaskDto;

    await this.checkProjectAccess(projectId, userId);

    if (dependsOn && dependsOn.length > 0) {
      await this.validateDependencies(dependsOn, projectId);
    }

    const task = await this.prisma.task.create({
      data: {
        ...taskData,
        projectId,
        createdById: userId,
        assigneeId: assigneeId || undefined,
        dependencies: dependsOn
            ? {
              create: dependsOn.map((taskId) => ({
                dependsOnId: taskId,
              })),
            }
            : undefined,
      },
      include: this.getTaskInclude(),
    });

    // 活動履歴を記録
    await this.createActivityLog(task.id, userId, 'created', null, null, null, 'タスクを作成しました');

    this.websockets.notifyTaskCreated(projectId, task);

    return task;
  }

  async findAll(userId: string, projectId?: string) {
    const where: any = {};

    if (projectId) {
      await this.checkProjectAccess(projectId, userId);
      where.projectId = projectId;
    } else {
      where.project = {
        members: {
          some: {
            userId,
          },
        },
      };
    }

    return this.prisma.task.findMany({
      where,
      include: this.getTaskInclude(),
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: {id: taskId},
      include: this.getTaskInclude(),
    });

    if (!task) {
      throw new NotFoundException('タスクが見つかりません');
    }

    await this.checkProjectAccess(task.projectId, userId);

    return task;
  }

  async update(taskId: string, userId: string, updateTaskDto: UpdateTaskDto) {
    const task = await this.findOne(taskId, userId);
    const oldTask = {...task};

    // ステータス変更に応じて実績日時を自動設定
    let dataToUpdate: any = { ...updateTaskDto };

    if (updateTaskDto.status && updateTaskDto.status !== oldTask.status) {
      const now = new Date();

      // todo → in_progress: actualStartDate を記録
      if (oldTask.status === 'todo' && updateTaskDto.status === 'in_progress') {
        if (!oldTask.actualStartDate) {
          dataToUpdate.actualStartDate = now;
        }
      }

      // → done: actualEndDate を記録
      if (updateTaskDto.status === 'done') {
        dataToUpdate.actualEndDate = now;
        if (!oldTask.actualStartDate) {
          dataToUpdate.actualStartDate = now;
        }
      }

      // done → in_progress: actualEndDate をクリア
      if (oldTask.status === 'done' && updateTaskDto.status === 'in_progress') {
        dataToUpdate.actualEndDate = null;
      }

      // → todo: 両方クリア（リセット）
      if (updateTaskDto.status === 'todo') {
        dataToUpdate.actualStartDate = null;
        dataToUpdate.actualEndDate = null;
      }
    }

    const updatedTask = await this.prisma.task.update({
      where: {id: taskId},
      data: dataToUpdate,
      include: this.getTaskInclude(),
    });

    // 活動履歴を記録
    await this.trackChanges(taskId, userId, oldTask, updatedTask);

    this.websockets.notifyTaskUpdated(task.projectId, taskId, updatedTask);

    return updatedTask;
  }

  async remove(taskId: string, userId: string) {
    const task = await this.findOne(taskId, userId);

    await this.prisma.task.delete({
      where: {id: taskId},
    });

    this.websockets.notifyTaskDeleted(task.projectId, taskId);

    return {message: 'タスクを削除しました'};
  }

  async getTasksByStatus(userId: string, projectId: string) {
    await this.checkProjectAccess(projectId, userId);

    const tasks = await this.prisma.task.findMany({
      where: {projectId},
      include: this.getTaskInclude(),
    });

    return {
      todo: tasks.filter((t) => t.status === 'todo'),
      in_progress: tasks.filter((t) => t.status === 'in_progress'),
      done: tasks.filter((t) => t.status === 'done'),
    };
  }

  async addAssignee(taskId: string, userId: string, assigneeId: string) {
    const task = await this.findOne(taskId, userId);

    const existingAssignment = await this.prisma.taskAssignee.findFirst({
      where: {
        taskId,
        userId: assigneeId,
      },
    });

    if (existingAssignment) {
      throw new BadRequestException('このユーザーは既に担当者として登録されています');
    }

    const assignment = await this.prisma.taskAssignee.create({
      data: {
        taskId,
        userId: assigneeId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    // 活動履歴を記録
    await this.createActivityLog(
        taskId,
        userId,
        'assigned',
        null,
        null,
        null,
        `${assignment.user.name}を担当者に追加しました`,
    );

    return assignment;
  }

  async removeAssignee(taskId: string, userId: string, assigneeId: string) {
    await this.findOne(taskId, userId);

    const assignment = await this.prisma.taskAssignee.findFirst({
      where: {
        taskId,
        userId: assigneeId,
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('担当者が見つかりません');
    }

    await this.prisma.taskAssignee.delete({
      where: {id: assignment.id},
    });

    // 活動履歴を記録
    await this.createActivityLog(
        taskId,
        userId,
        'assigned',
        null,
        null,
        null,
        `${assignment.user.name}を担当者から外しました`,
    );

    return {message: '担当者を削除しました'};
  }

  // コメント機能
  async getComments(taskId: string, userId: string) {
    await this.findOne(taskId, userId);

    return this.prisma.taskComment.findMany({
      where: {taskId},
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async createComment(taskId: string, userId: string, createCommentDto: CreateCommentDto) {
    const task = await this.findOne(taskId, userId);

    const comment = await this.prisma.taskComment.create({
      data: {
        taskId,
        userId,
        content: createCommentDto.content,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    // 活動履歴を記録
    await this.createActivityLog(taskId, userId, 'commented', null, null, null, 'コメントを追加しました');

    // WebSocket通知
    this.websockets.notifyCommentAdded(task.projectId, taskId, comment);

    return comment;
  }

  async updateComment(
      taskId: string,
      commentId: string,
      userId: string,
      updateCommentDto: UpdateCommentDto,
  ) {
    const task = await this.findOne(taskId, userId);

    const comment = await this.prisma.taskComment.findUnique({
      where: {id: commentId},
    });

    if (!comment) {
      throw new NotFoundException('コメントが見つかりません');
    }

    if (comment.userId !== userId) {
      throw new ForbiddenException('このコメントを編集する権限がありません');
    }

    const updatedComment = await this.prisma.taskComment.update({
      where: {id: commentId},
      data: updateCommentDto,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    // WebSocket通知
    this.websockets.notifyCommentUpdated(task.projectId, taskId, commentId, updatedComment);

    return updatedComment;
  }

  async deleteComment(taskId: string, commentId: string, userId: string) {
    const task = await this.findOne(taskId, userId);

    const comment = await this.prisma.taskComment.findUnique({
      where: {id: commentId},
    });

    if (!comment) {
      throw new NotFoundException('コメントが見つかりません');
    }

    if (comment.userId !== userId) {
      throw new ForbiddenException('このコメントを削除する権限がありません');
    }

    await this.prisma.taskComment.delete({
      where: {id: commentId},
    });

    // WebSocket通知
    this.websockets.notifyCommentDeleted(task.projectId, taskId, commentId);

    return {message: 'コメントを削除しました'};
  }

  // サブタスク機能
  async getSubtasks(taskId: string, userId: string) {
    await this.findOne(taskId, userId);

    return this.prisma.subtask.findMany({
      where: {taskId},
      orderBy: {
        order: 'asc',
      },
    });
  }

  async createSubtask(taskId: string, userId: string, createSubtaskDto: CreateSubtaskDto) {
    const task = await this.findOne(taskId, userId);

    const maxOrder = await this.prisma.subtask.findFirst({
      where: {taskId},
      orderBy: {order: 'desc'},
      select: {order: true},
    });

    const subtask = await this.prisma.subtask.create({
      data: {
        taskId,
        title: createSubtaskDto.title,
        order: (maxOrder?.order ?? -1) + 1,
      },
    });

    // 活動履歴を記録
    await this.createActivityLog(taskId, userId, 'updated', null, null, null, 'サブタスクを追加しました');

    // WebSocket通知
    this.websockets.notifySubtaskAdded(task.projectId, taskId, subtask);

    return subtask;
  }

  async updateSubtask(
      taskId: string,
      subtaskId: string,
      userId: string,
      updateSubtaskDto: UpdateSubtaskDto,
  ) {
    const task = await this.findOne(taskId, userId);

    const subtask = await this.prisma.subtask.findUnique({
      where: {id: subtaskId},
    });

    if (!subtask || subtask.taskId !== taskId) {
      throw new NotFoundException('サブタスクが見つかりません');
    }

    const updated = await this.prisma.subtask.update({
      where: {id: subtaskId},
      data: updateSubtaskDto,
    });

    // 活動履歴を記録
    if (updateSubtaskDto.completed !== undefined) {
      await this.createActivityLog(
          taskId,
          userId,
          'updated',
          null,
          null,
          null,
          `サブタスク「${subtask.title}」を${updateSubtaskDto.completed ? '完了' : '未完了'}にしました`,
      );
    }

    // WebSocket通知
    this.websockets.notifySubtaskUpdated(task.projectId, taskId, subtaskId, updated);

    return updated;
  }

  async deleteSubtask(taskId: string, subtaskId: string, userId: string) {
    const task = await this.findOne(taskId, userId);

    const subtask = await this.prisma.subtask.findUnique({
      where: {id: subtaskId},
    });

    if (!subtask || subtask.taskId !== taskId) {
      throw new NotFoundException('サブタスクが見つかりません');
    }

    await this.prisma.subtask.delete({
      where: {id: subtaskId},
    });

    // 活動履歴を記録
    await this.createActivityLog(taskId, userId, 'updated', null, null, null, 'サブタスクを削除しました');

    // WebSocket通知
    this.websockets.notifySubtaskDeleted(task.projectId, taskId, subtaskId);

    return {message: 'サブタスクを削除しました'};
  }

  async reorderSubtasks(taskId: string, userId: string, reorderDto: ReorderSubtasksDto) {
    await this.findOne(taskId, userId);

    const {subtaskIds} = reorderDto;

    await this.prisma.$transaction(
        subtaskIds.map((id, index) =>
            this.prisma.subtask.update({
              where: {id},
              data: {order: index},
            }),
        ),
    );

    return {message: 'サブタスクの順序を更新しました'};
  }

  // 添付ファイル機能
  async getAttachments(taskId: string, userId: string) {
    await this.findOne(taskId, userId);

    return this.prisma.taskAttachment.findMany({
      where: {taskId},
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async createAttachment(
      taskId: string,
      userId: string,
      filename: string,
      fileUrl: string,
      fileSize: number,
      mimeType: string,
  ) {
    await this.findOne(taskId, userId);

    const attachment = await this.prisma.taskAttachment.create({
      data: {
        taskId,
        userId,
        filename,
        fileUrl,
        fileSize,
        mimeType,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    // 活動履歴を記録
    await this.createActivityLog(taskId, userId, 'updated', null, null, null, `ファイル「${filename}」を添付しました`);

    return attachment;
  }

  async deleteAttachment(taskId: string, attachmentId: string, userId: string) {
    await this.findOne(taskId, userId);

    const attachment = await this.prisma.taskAttachment.findUnique({
      where: {id: attachmentId},
    });

    if (!attachment || attachment.taskId !== taskId) {
      throw new NotFoundException('添付ファイルが見つかりません');
    }

    await this.prisma.taskAttachment.delete({
      where: {id: attachmentId},
    });

    // 活動履歴を記録
    await this.createActivityLog(taskId, userId, 'updated', null, null, null, `ファイル「${attachment.filename}」を削除しました`);

    return {message: '添付ファイルを削除しました'};
  }

  // 活動履歴機能
  async getActivityLogs(taskId: string, userId: string) {
    await this.findOne(taskId, userId);

    return this.prisma.activityLog.findMany({
      where: {taskId},
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // 依存関係管理
  async addDependency(taskId: string, userId: string, dependsOnId: string) {
    const task = await this.findOne(taskId, userId);
    const dependsOnTask = await this.findOne(dependsOnId, userId);

    // 同じプロジェクト内のタスクかチェック
    if (task.projectId !== dependsOnTask.projectId) {
      throw new BadRequestException('依存タスクは同じプロジェクト内である必要があります');
    }

    // 自分自身への依存は不可
    if (taskId === dependsOnId) {
      throw new BadRequestException('自分自身に依存することはできません');
    }

    // 既存の依存関係チェック
    const existingDependency = await this.prisma.taskDependency.findFirst({
      where: {
        taskId,
        dependsOnId,
      },
    });

    if (existingDependency) {
      throw new BadRequestException('この依存関係は既に存在します');
    }

    // 循環依存チェック
    const wouldCreateCycle = await this.checkCyclicDependency(dependsOnId, taskId);
    if (wouldCreateCycle) {
      throw new BadRequestException('循環依存が発生するため、この依存関係は追加できません');
    }

    const dependency = await this.prisma.taskDependency.create({
      data: {
        taskId,
        dependsOnId,
      },
      include: {
        dependsOn: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    // 活動履歴を記録
    await this.createActivityLog(
      taskId,
      userId,
      'updated',
      null,
      null,
      null,
      `依存タスク「${dependsOnTask.title}」を追加しました`,
    );

    return dependency;
  }

  async removeDependency(taskId: string, userId: string, dependsOnId: string) {
    await this.findOne(taskId, userId);

    const dependency = await this.prisma.taskDependency.findFirst({
      where: {
        taskId,
        dependsOnId,
      },
      include: {
        dependsOn: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!dependency) {
      throw new NotFoundException('依存関係が見つかりません');
    }

    await this.prisma.taskDependency.delete({
      where: { id: dependency.id },
    });

    // 活動履歴を記録
    await this.createActivityLog(
      taskId,
      userId,
      'updated',
      null,
      null,
      null,
      `依存タスク「${dependency.dependsOn.title}」を削除しました`,
    );

    return { message: '依存関係を削除しました' };
  }

  // 工数記録機能
  async getTimeEntries(taskId: string, userId: string) {
    await this.findOne(taskId, userId);

    return this.prisma.timeEntry.findMany({
      where: { taskId },
      include: {
        user: {
          select: { id: true, name: true, avatar: true },
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createTimeEntry(taskId: string, userId: string, dto: CreateTimeEntryDto) {
    await this.findOne(taskId, userId);

    const entry = await this.prisma.timeEntry.create({
      data: {
        taskId,
        userId,
        hours: dto.hours,
        description: dto.description,
        date: dto.date ? new Date(dto.date) : new Date(),
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        endTime: dto.endTime ? new Date(dto.endTime) : undefined,
      },
      include: {
        user: {
          select: { id: true, name: true, avatar: true },
        },
      },
    });

    // 活動履歴を記録
    await this.createActivityLog(taskId, userId, 'updated', null, null, null, `工数 ${dto.hours}時間 を記録しました`);

    // タスクの実績工数を自動更新
    await this.recalcActualHours(taskId);

    return entry;
  }

  async updateTimeEntry(taskId: string, entryId: string, userId: string, dto: UpdateTimeEntryDto) {
    await this.findOne(taskId, userId);

    const entry = await this.prisma.timeEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.taskId !== taskId) {
      throw new NotFoundException('工数記録が見つかりません');
    }
    if (entry.userId !== userId) {
      throw new ForbiddenException('他のユーザーの工数記録は編集できません');
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id: entryId },
      data: {
        ...(dto.hours !== undefined && { hours: dto.hours }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.startTime !== undefined && { startTime: new Date(dto.startTime) }),
        ...(dto.endTime !== undefined && { endTime: new Date(dto.endTime) }),
      },
      include: {
        user: {
          select: { id: true, name: true, avatar: true },
        },
      },
    });

    await this.recalcActualHours(taskId);
    return updated;
  }

  async deleteTimeEntry(taskId: string, entryId: string, userId: string) {
    await this.findOne(taskId, userId);

    const entry = await this.prisma.timeEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.taskId !== taskId) {
      throw new NotFoundException('工数記録が見つかりません');
    }
    if (entry.userId !== userId) {
      throw new ForbiddenException('他のユーザーの工数記録は削除できません');
    }

    await this.prisma.timeEntry.delete({ where: { id: entryId } });
    await this.recalcActualHours(taskId);

    return { message: '工数記録を削除しました' };
  }

  private async recalcActualHours(taskId: string) {
    const aggregate = await this.prisma.timeEntry.aggregate({
      where: { taskId },
      _sum: { hours: true },
    });
    await this.prisma.task.update({
      where: { id: taskId },
      data: { actualHours: aggregate._sum.hours ?? 0 },
    });
  }

  // 循環依存チェック（深さ優先探索）
  private async checkCyclicDependency(startTaskId: string, targetTaskId: string): Promise<boolean> {
    const visited = new Set<string>();
    const stack = [startTaskId];

    while (stack.length > 0) {
      const currentId = stack.pop()!;

      if (currentId === targetTaskId) {
        return true;
      }

      if (visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);

      const dependencies = await this.prisma.taskDependency.findMany({
        where: { taskId: currentId },
        select: { dependsOnId: true },
      });

      for (const dep of dependencies) {
        stack.push(dep.dependsOnId);
      }
    }

    return false;
  }

  // プライベートヘルパーメソッド
  private async checkProjectAccess(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId,
      },
    });

    if (!member) {
      throw new ForbiddenException('このプロジェクトへのアクセス権限がありません');
    }
  }

  private async validateDependencies(taskIds: string[], projectId: string) {
    const tasks = await this.prisma.task.findMany({
      where: {
        id: {in: taskIds},
        projectId,
      },
    });

    if (tasks.length !== taskIds.length) {
      throw new BadRequestException('無効な依存タスクが含まれています');
    }
  }

  private getTaskInclude() {
    return {
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
        },
      },
      assignees: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      dependencies: {
        include: {
          dependsOn: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      },
      dependents: {
        include: {
          task: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      },
      milestone: {
        select: {
          id: true,
          name: true,
          dueDate: true,
          status: true,
        },
      },
      tags: {
        include: {
          tag: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
        },
      },
    };
  }

  private async createActivityLog(
      taskId: string,
      userId: string,
      action: string,
      fieldName: string | null,
      oldValue: string | null,
      newValue: string | null,
      description: string,
  ) {
    await this.prisma.activityLog.create({
      data: {
        taskId,
        userId,
        action,
        fieldName,
        oldValue,
        newValue,
        description,
      },
    });
    }

  private async trackChanges(taskId: string, userId: string, oldTask: any, newTask: any) {
    const changes: Array<{ field: string; oldValue: string; newValue: string; description: string }> = [];

    if (oldTask.status !== newTask.status) {
      const statusMap = { todo: '未着手', in_progress: '進行中', done: '完了' };
      changes.push({
        field: 'status',
        oldValue: statusMap[oldTask.status],
        newValue: statusMap[newTask.status],
        description: `ステータスを${statusMap[oldTask.status]}から${statusMap[newTask.status]}に変更しました`,
      });
    }

    if (oldTask.priority !== newTask.priority) {
      const priorityMap = { low: '低', medium: '中', high: '高' };
      changes.push({
        field: 'priority',
        oldValue: priorityMap[oldTask.priority],
        newValue: priorityMap[newTask.priority],
        description: `優先度を${priorityMap[oldTask.priority]}から${priorityMap[newTask.priority]}に変更しました`,
      });
    }

    if (oldTask.title !== newTask.title) {
      changes.push({
        field: 'title',
        oldValue: oldTask.title,
        newValue: newTask.title,
        description: 'タイトルを変更しました',
      });
    }

    // 開始日の変更追跡
    const oldStartDateStr = oldTask.startDate ? new Date(oldTask.startDate).toISOString() : 'なし';
    const newStartDateStr = newTask.startDate ? new Date(newTask.startDate).toISOString() : 'なし';

    if (oldStartDateStr !== newStartDateStr) {
      changes.push({
        field: 'startDate',
        oldValue: oldStartDateStr,
        newValue: newStartDateStr,
        description: '開始日を変更しました',
      });
    }

    // 修正: dueDateをISO文字列に変換
    const oldDueDateStr = oldTask.dueDate ? new Date(oldTask.dueDate).toISOString() : 'なし';
    const newDueDateStr = newTask.dueDate ? new Date(newTask.dueDate).toISOString() : 'なし';

    if (oldDueDateStr !== newDueDateStr) {
      changes.push({
        field: 'dueDate',
        oldValue: oldDueDateStr,
        newValue: newDueDateStr,
        description: '期限を変更しました',
      });
    }

    for (const change of changes) {
      await this.createActivityLog(
        taskId,
        userId,
        'updated',
        change.field,
        change.oldValue,
        change.newValue,
        change.description,
      );
    }
  }
}