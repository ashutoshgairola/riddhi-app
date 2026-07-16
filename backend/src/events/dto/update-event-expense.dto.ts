import { PartialType } from '@nestjs/mapped-types';
import { CreateEventExpenseDto } from './create-event-expense.dto';

export class UpdateEventExpenseDto extends PartialType(CreateEventExpenseDto) {}
