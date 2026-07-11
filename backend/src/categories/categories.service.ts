import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { CategoriesRepository } from './categories.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { TransactionCategory } from './category.entity';

export interface CategoryTree extends TransactionCategory {
  children: CategoryTree[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  async findAll(userId: string): Promise<TransactionCategory[]> {
    return this.categoriesRepository.findAllByUser(userId);
  }

  async findAllAsTree(userId: string): Promise<CategoryTree[]> {
    const categories = await this.categoriesRepository.findAllByUser(userId);

    const map = new Map<string, CategoryTree>();
    const roots: CategoryTree[] = [];

    // First pass: build map
    for (const cat of categories) {
      map.set(cat.id, { ...cat, children: [] });
    }

    // Second pass: assign children
    for (const cat of map.values()) {
      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId)!.children.push(cat);
      } else {
        roots.push(cat);
      }
    }

    return roots;
  }

  async findOne(id: string, userId: string): Promise<TransactionCategory> {
    const category = await this.categoriesRepository.findOneByUser(id, userId);
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(
    userId: string,
    dto: CreateCategoryDto,
  ): Promise<TransactionCategory> {
    const category = this.categoriesRepository.create({ ...dto, userId });
    return this.categoriesRepository.save(category);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateCategoryDto,
  ): Promise<TransactionCategory> {
    const category = await this.findOne(id, userId);
    Object.assign(category, dto);
    return this.categoriesRepository.save(category);
  }

  async remove(id: string, userId: string): Promise<void> {
    const category = await this.findOne(id, userId);
    try {
      await this.categoriesRepository.remove(category);
    } catch (err) {
      const code =
        (err as { code?: string }).code ??
        (err as { driverError?: { code?: string } }).driverError?.code;
      if (code === '23503') {
        throw new ConflictException(
          'Category still has transactions — reassign them before deleting.',
        );
      }
      throw err;
    }
  }
}
