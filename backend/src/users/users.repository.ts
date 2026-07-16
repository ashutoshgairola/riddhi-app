import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { UserPreferences } from './user-preferences.entity';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(UserPreferences)
    private readonly preferencesRepo: Repository<UserPreferences>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  save(user: User): Promise<User> {
    return this.userRepo.save(user);
  }

  findPreferencesByUserId(userId: string): Promise<UserPreferences | null> {
    return this.preferencesRepo.findOne({ where: { userId } });
  }

  savePreferences(preferences: UserPreferences): Promise<UserPreferences> {
    return this.preferencesRepo.save(preferences);
  }

  createDefaultPreferences(userId: string): UserPreferences {
    return this.preferencesRepo.create({ userId });
  }
}
