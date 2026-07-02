import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoalsModule } from '../goals/goals.module';
import { User } from './user.entity';
import { UserPreferences } from './user-preferences.entity';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserPreferences]), GoalsModule],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}
