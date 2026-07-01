import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionCategory } from './category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionCategory])],
  exports: [TypeOrmModule],
})
export class CategoriesModule {}
