import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * Standalone DataSource for CLI migrations (typeorm migration:run, etc.)
 * At runtime, TypeORM is configured via TypeOrmModule.forRootAsync in AppModule.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
});
