import { Controller, Get, Patch, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreditCardService } from './credit-card.service';
import { UpdateCardDto } from './dto/update-card.dto';

@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class CreditCardController {
  constructor(private readonly creditCardService: CreditCardService) {}

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
}
