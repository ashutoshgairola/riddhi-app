import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goal } from './goal.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Goal])],
  exports: [TypeOrmModule],
})
export class GoalsModule {}
