import { Controller, Get, Patch, Post, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreditCardService } from './credit-card.service';
import { UpdateCardDto } from './dto/update-card.dto';
import { PayCardDto } from './dto/pay-card.dto';

@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class CreditCardController {
  constructor(private readonly creditCardService: CreditCardService) {}

  @Get('cards/due')
  getBillsDue(@CurrentUser() user: { userId: string; email: string }) {
    return this.creditCardService.getBillsDue(user.userId);
  }

  @Get(':id/card')
  getSummary(
    @CurrentUser() user: { userId: string; email: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creditCardService.getSummary(id, user.userId);
  }

  @Patch(':id/card')
  updateConfig(
    @CurrentUser() user: { userId: string; email: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCardDto,
  ) {
    return this.creditCardService.updateConfig(id, user.userId, dto);
  }

  @Post(':id/card/pay')
  pay(
    @CurrentUser() user: { userId: string; email: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayCardDto,
  ) {
    return this.creditCardService.pay(id, user.userId, dto);
  }
}
