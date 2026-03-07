import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AiChatService } from './ai-chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import type { AiProviderType } from './providers/ai-provider.factory';

@SkipThrottle({ auth: true })
@Controller('ai-chat')
@UseGuards(JwtAuthGuard)
export class AiChatController {
  constructor(private readonly aiChatService: AiChatService) {}

  @Post('conversations')
  async createConversation(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.aiChatService.createConversation(userId, dto);
  }

  @Get('conversations')
  async getConversations(@CurrentUser('id') userId: string) {
    return this.aiChatService.getConversations(userId);
  }

  @Get('conversations/:id')
  async getConversation(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
  ) {
    return this.aiChatService.getConversation(conversationId, userId);
  }

  @Delete('conversations/:id')
  async deleteConversation(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
  ) {
    return this.aiChatService.deleteConversation(conversationId, userId);
  }

  @Post('messages')
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
    @Query('provider') provider?: AiProviderType,
  ) {
    return this.aiChatService.sendMessageSync(userId, dto, provider);
  }
}
