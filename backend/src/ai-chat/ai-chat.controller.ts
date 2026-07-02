import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AiChatService, ChatResult } from './ai-chat.service';
import { ChatRequestDto } from './dto/chat.dto';

@UseGuards(JwtAuthGuard)
@Controller('ai-chat')
export class AiChatController {
  constructor(private readonly aiChatService: AiChatService) {}

  @Post()
  chat(
    @CurrentUser() user: { userId: string; email: string },
    @Body() dto: ChatRequestDto,
  ): Promise<ChatResult> {
    return this.aiChatService.chat(user.userId, dto);
  }
}
