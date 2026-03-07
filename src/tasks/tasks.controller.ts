import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { ReorderSubtasksDto } from './dto/reorder-subtasks.dto';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle({ auth: true })
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() createTaskDto: CreateTaskDto,
  ) {
    return this.tasksService.create(userId, createTaskDto);
  }

  @Get()
  findAll(
    @CurrentUser('id') userId: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.tasksService.findAll(userId, projectId);
  }

  @Get('by-status')
  getByStatus(
    @CurrentUser('id') userId: string,
    @Query('projectId') projectId: string,
  ) {
    return this.tasksService.getTasksByStatus(userId, projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tasksService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    return this.tasksService.update(id, userId, updateTaskDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tasksService.remove(id, userId);
  }

  // 担当者管理
  @Post(':id/assignees/:assigneeId')
  addAssignee(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Param('assigneeId') assigneeId: string,
  ) {
    return this.tasksService.addAssignee(id, userId, assigneeId);
  }

  @Delete(':id/assignees/:assigneeId')
  removeAssignee(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Param('assigneeId') assigneeId: string,
  ) {
    return this.tasksService.removeAssignee(id, userId, assigneeId);
  }

  // コメント機能
  @Get(':id/comments')
  getComments(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tasksService.getComments(id, userId);
  }

  @Post(':id/comments')
  createComment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() createCommentDto: CreateCommentDto,
  ) {
    return this.tasksService.createComment(id, userId, createCommentDto);
  }

  @Patch(':id/comments/:commentId')
  updateComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
    @Body() updateCommentDto: UpdateCommentDto,
  ) {
    return this.tasksService.updateComment(id, commentId, userId, updateCommentDto);
  }

  @Delete(':id/comments/:commentId')
  deleteComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tasksService.deleteComment(id, commentId, userId);
  }

  // サブタスク機能
  @Get(':id/subtasks')
  getSubtasks(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tasksService.getSubtasks(id, userId);
  }

  @Post(':id/subtasks')
  createSubtask(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() createSubtaskDto: CreateSubtaskDto,
  ) {
    return this.tasksService.createSubtask(id, userId, createSubtaskDto);
  }

  @Patch(':id/subtasks/:subtaskId')
  updateSubtask(
    @Param('id') id: string,
    @Param('subtaskId') subtaskId: string,
    @CurrentUser('id') userId: string,
    @Body() updateSubtaskDto: UpdateSubtaskDto,
  ) {
    return this.tasksService.updateSubtask(id, subtaskId, userId, updateSubtaskDto);
  }

  @Delete(':id/subtasks/:subtaskId')
  deleteSubtask(
    @Param('id') id: string,
    @Param('subtaskId') subtaskId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tasksService.deleteSubtask(id, subtaskId, userId);
  }

  @Post(':id/subtasks/reorder')
  reorderSubtasks(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() reorderDto: ReorderSubtasksDto,
  ) {
    return this.tasksService.reorderSubtasks(id, userId, reorderDto);
  }

  // 添付ファイル機能
  @Get(':id/attachments')
  getAttachments(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tasksService.getAttachments(id, userId);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('ファイルがアップロードされていません');
    }

    // ファイルサイズ制限 (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('ファイルサイズは10MB以下にしてください');
    }

    // ファイルを保存（実際の実装では S3 や他のストレージサービスを使用）
    // ここでは簡易的な例
    const filename = file.originalname;
    const fileUrl = `/uploads/${Date.now()}-${filename}`;
    const fileSize = file.size;
    const mimeType = file.mimetype;

    // TODO: 実際のファイル保存処理を実装
    // 例: await this.uploadToS3(file);

    return this.tasksService.createAttachment(
      id,
      userId,
      filename,
      fileUrl,
      fileSize,
      mimeType,
    );
  }

  @Delete(':id/attachments/:attachmentId')
  deleteAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tasksService.deleteAttachment(id, attachmentId, userId);
  }

  // 活動履歴機能
  @Get(':id/activity')
  getActivityLogs(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tasksService.getActivityLogs(id, userId);
  }

  // 工数記録機能
  @Get(':id/time-entries')
  getTimeEntries(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tasksService.getTimeEntries(id, userId);
  }

  @Post(':id/time-entries')
  createTimeEntry(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTimeEntryDto,
  ) {
    return this.tasksService.createTimeEntry(id, userId, dto);
  }

  @Patch(':id/time-entries/:entryId')
  updateTimeEntry(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateTimeEntryDto,
  ) {
    return this.tasksService.updateTimeEntry(id, entryId, userId, dto);
  }

  @Delete(':id/time-entries/:entryId')
  deleteTimeEntry(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tasksService.deleteTimeEntry(id, entryId, userId);
  }

  // 依存関係管理
  @Post(':id/dependencies/:dependsOnId')
  addDependency(
    @Param('id') id: string,
    @Param('dependsOnId') dependsOnId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tasksService.addDependency(id, userId, dependsOnId);
  }

  @Delete(':id/dependencies/:dependsOnId')
  removeDependency(
    @Param('id') id: string,
    @Param('dependsOnId') dependsOnId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tasksService.removeDependency(id, userId, dependsOnId);
  }
}