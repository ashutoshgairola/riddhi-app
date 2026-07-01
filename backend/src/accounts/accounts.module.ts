import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Account])],
  exports: [TypeOrmModule],
})
export class AccountsModule {}
