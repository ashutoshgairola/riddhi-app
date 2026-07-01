import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionCategory } from './category.entity';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionCategory])],
  controllers: [CategoriesController],
  providers: [CategoriesRepository, CategoriesService],
  exports: [TypeOrmModule, CategoriesService],
})
export class CategoriesModule {}
