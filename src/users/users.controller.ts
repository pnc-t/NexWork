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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
}