import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { PeriodDto, PeriodKey } from './dto/period.dto';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  getOverview(
    @CurrentUser() user: { userId: string; email: string },
    @Query() query: PeriodDto,
  ) {
    const period: PeriodKey = query.period ?? '1m';
    return this.reportsService.getOverview(user.userId, period);
  }

  @Get('income-vs-expense')
  getIncomeVsExpense(
    @CurrentUser() user: { userId: string; email: string },
    @Query() query: PeriodDto,
  ) {
    const period: PeriodKey = query.period ?? '6m';
    return this.reportsService.getIncomeVsExpense(user.userId, period);
  }

  @Get('categories')
  getCategories(
    @CurrentUser() user: { userId: string; email: string },
    @Query() query: PeriodDto,
  ) {
    const period: PeriodKey = query.period ?? '1m';
    return this.reportsService.getCategories(user.userId, period);
  }

  @Get('net-worth-trend')
  getNetWorthTrend(
    @CurrentUser() user: { userId: string; email: string },
    @Query() query: PeriodDto,
  ) {
    const period: PeriodKey = query.period ?? '6m';
    return this.reportsService.getNetWorthTrend(user.userId, period);
  }
}
