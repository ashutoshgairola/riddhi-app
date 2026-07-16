import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StatementsService } from './statements.service';
import { ParseStatementDto } from './dto/parse-statement.dto';
import { ImportStatementDto } from './dto/import-statement.dto';

@UseGuards(JwtAuthGuard)
@Controller('statements')
export class StatementsController {
  constructor(private readonly statements: StatementsService) {}

  @Post('parse')
  parse(
    @CurrentUser() user: { userId: string; email: string },
    @Body() dto: ParseStatementDto,
  ) {
    return this.statements.parse(user.userId, dto);
  }

  @Post('import')
  import(
    @CurrentUser() user: { userId: string; email: string },
    @Body() dto: ImportStatementDto,
  ) {
    return this.statements.import(user.userId, dto);
  }
}
