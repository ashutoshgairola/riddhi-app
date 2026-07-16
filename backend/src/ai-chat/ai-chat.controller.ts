import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AiChatService } from './ai-chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatStreamEvent } from './stream-events';

type AuthedUser = { userId: string; email: string };

// Express only defines res.flush() when the compression middleware is active,
// so it isn't on the base Response type — declare it as optional.
type FlushableResponse = Response & { flush?: () => void };

// Below common proxy idle timeouts (~15s on ngrok etc.), with margin so a
// heartbeat always lands before the pipe is considered idle.
const HEARTBEAT_MS = 10_000;

@UseGuards(JwtAuthGuard)
@Controller('ai-chat')
export class AiChatController {
  constructor(private readonly aiChatService: AiChatService) {}

  /**
   * Streaming chat turn. Raw SSE over POST (Nest's @Sse() is GET/Observable
   * oriented and can't carry a body): text deltas, tool activity, widgets.
   */
  @Post('stream')
  async stream(
    @CurrentUser() user: AuthedUser,
    @Body() dto: SendMessageDto,
    @Res() res: FlushableResponse,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Prove the pipe is open on the client's first read. During the agent's
    // opening phase (adaptive thinking + a tool call) little data flows, so an
    // immediate heartbeat keeps proxies from treating the socket as idle before
    // the first real event lands.
    if (!res.writableEnded) {
      res.write(': ping\n\n');
      res.flush?.();
    }

    const write = (event: ChatStreamEvent): void => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        res.flush?.();
      }
    };

    // Keeps proxies from timing out the connection while tools execute.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': ping\n\n');
        res.flush?.();
      }
    }, HEARTBEAT_MS);

    // If the client disconnects mid-turn, abort the in-flight agent work
    // instead of running the loop to completion against a dead socket.
    const abort = new AbortController();
    res.on('close', () => abort.abort());

    try {
      await this.aiChatService.runTurn(
        user.userId,
        dto.threadId ?? null,
        dto.message,
        write,
        { clientMsgId: dto.clientMsgId, signal: abort.signal },
      );
    } catch (err) {
      write({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Unexpected error running turn',
        retryable: true,
      });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }

  /** Non-streaming fallback: same turn, blocks buffered into one response. */
  @Post('messages')
  sendMessage(@CurrentUser() user: AuthedUser, @Body() dto: SendMessageDto) {
    return this.aiChatService.runTurnBuffered(
      user.userId,
      dto.threadId ?? null,
      dto.message,
      dto.clientMsgId,
    );
  }

  @Get('threads')
  listThreads(@CurrentUser() user: AuthedUser) {
    return this.aiChatService.listThreads(user.userId);
  }

  @Get('threads/:id')
  getThread(
    @CurrentUser() user: AuthedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.aiChatService.getThread(user.userId, id);
  }

  @Delete('threads/:id')
  deleteThread(
    @CurrentUser() user: AuthedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.aiChatService.deleteThread(user.userId, id);
  }

  @Post('actions/:id/confirm')
  confirmAction(
    @CurrentUser() user: AuthedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.aiChatService.confirmAction(user.userId, id);
  }

  @Post('actions/:id/cancel')
  cancelAction(
    @CurrentUser() user: AuthedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.aiChatService.cancelAction(user.userId, id);
  }
}
