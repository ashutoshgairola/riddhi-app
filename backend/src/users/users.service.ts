import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { User } from './user.entity';
import { UserPreferences } from './user-preferences.entity';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    Object.assign(user, dto);
    return this.usersRepository.save(user);
  }

  async getPreferences(userId: string): Promise<UserPreferences> {
    let prefs = await this.usersRepository.findPreferencesByUserId(userId);
    if (!prefs) {
      prefs = this.usersRepository.createDefaultPreferences(userId);
      prefs = await this.usersRepository.savePreferences(prefs);
    }
    return prefs;
  }

  async updatePreferences(
    userId: string,
    dto: UpdatePreferencesDto,
  ): Promise<UserPreferences> {
    const prefs = await this.getPreferences(userId);
    Object.assign(prefs, dto);
    return this.usersRepository.savePreferences(prefs);
  }
}
