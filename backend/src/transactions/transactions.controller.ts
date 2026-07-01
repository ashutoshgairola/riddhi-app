import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';

@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  findAll(
    @CurrentUser() user: { userId: string; email: string },
    @Query() query: QueryTransactionsDto,
  ) {
    return this.transactionsService.findAll(user.userId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: { userId: string; email: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactionsService.findOne(id, user.userId);
  }

  @Post()
  create(
    @CurrentUser() user: { userId: string; email: string },
    @Body() dto: CreateTransactionDto,
  ) {
    return this.transactionsService.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string; email: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactionsService.update(id, user.userId, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: { userId: string; email: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactionsService.remove(id, user.userId);
  }
}
