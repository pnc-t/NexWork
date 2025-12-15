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
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

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
}