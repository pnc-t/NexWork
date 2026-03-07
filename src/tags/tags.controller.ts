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
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@SkipThrottle({ auth: true })
@Controller('tags')
@UseGuards(JwtAuthGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() createTagDto: CreateTagDto,
  ) {
    return this.tagsService.create(userId, createTagDto);
  }

  @Get()
  findAll(
    @CurrentUser('id') userId: string,
    @Query('projectId') projectId: string,
  ) {
    return this.tagsService.findAll(userId, projectId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tagsService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() updateTagDto: UpdateTagDto,
  ) {
    return this.tagsService.update(id, userId, updateTagDto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tagsService.remove(id, userId);
  }

  // タスクへのタグ付け
  @Post('task/:taskId/tag/:tagId')
  addTagToTask(
    @Param('taskId') taskId: string,
    @Param('tagId') tagId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tagsService.addTagToTask(taskId, tagId, userId);
  }

  @Delete('task/:taskId/tag/:tagId')
  removeTagFromTask(
    @Param('taskId') taskId: string,
    @Param('tagId') tagId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tagsService.removeTagFromTask(taskId, tagId, userId);
  }
}