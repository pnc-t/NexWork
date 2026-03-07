import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Delete,
  Query,
  UseGuards,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { UsersService } from './users.service';
import { ProjectsService } from '../projects/projects.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@SkipThrottle({ auth: true })
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId);
  }

  @Get('search')
  async searchUsers(@Query('q') query: string) {
    return this.usersService.searchUsers(query);
  }

  @Get('me/projects')
  async getMyProjects(@CurrentUser('id') userId: string) {
    return this.usersService.getMyProjects(userId);
  }

  @Get('me/tasks')
  async getMyTasks(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
  ) {
    return this.usersService.getMyTasks(userId, status);
  }

  @Get('me/activity')
  async getActivityLog(@CurrentUser('id') userId: string) {
    return this.usersService.getActivityLog(userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch('me/profile')
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, updateProfileDto);
  }

  @Post('me/change-password')
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(userId, changePasswordDto);
  }

  @Delete('me')
  async deleteAccount(
    @CurrentUser('id') userId: string,
    @Body('password') password: string,
  ) {
    return this.usersService.deleteAccount(userId, password);
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: './uploads/avatars',
        filename: (req: any, file, cb) => {
          const userId = req.user?.id || 'unknown';
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `${userId}-${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|gif|webp)$/)) {
          cb(new BadRequestException('画像ファイルのみアップロードできます'), false);
        } else {
          cb(null, true);
        }
      },
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    }),
  )
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('ファイルを選択してください');
    }
    return this.usersService.updateAvatar(userId, `/uploads/avatars/${file.filename}`);
  }

  @Delete('me/avatar')
  async deleteAvatar(@CurrentUser('id') userId: string) {
    return this.usersService.deleteAvatar(userId);
  }

  // ================ 招待エンドポイント ================

  @Get('me/invitations')
  async getMyInvitations(@CurrentUser('id') userId: string) {
    return this.projectsService.getMyInvitations(userId);
  }

  @Post('me/invitations/:invitationId/respond')
  async respondToInvitation(
    @CurrentUser('id') userId: string,
    @Param('invitationId') invitationId: string,
    @Body('action') action: 'accept' | 'decline',
  ) {
    return this.projectsService.respondToInvitation(invitationId, userId, action);
  }
}