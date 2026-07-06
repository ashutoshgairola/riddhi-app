import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: { userId: string; email: string }) {
    return this.usersService.findById(user.userId);
  }

  @Delete('me')
  @HttpCode(204)
  async deleteMe(@CurrentUser() user: { userId: string; email: string }) {
    await this.usersService.deleteAccount(user.userId);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: { userId: string; email: string },
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(user.userId, dto);
  }

  @Get('me/preferences')
  getPreferences(@CurrentUser() user: { userId: string; email: string }) {
    return this.usersService.getPreferences(user.userId);
  }

  @Patch('me/preferences')
  updatePreferences(
    @CurrentUser() user: { userId: string; email: string },
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.usersService.updatePreferences(user.userId, dto);
  }

  @Post('me/onboarding')
  completeOnboarding(
    @CurrentUser() user: { userId: string; email: string },
    @Body() dto: CompleteOnboardingDto,
  ) {
    return this.usersService.completeOnboarding(user.userId, dto);
  }
}
