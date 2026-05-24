import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { UsersModule } from './users/users.module';
import { OnboardingEvent } from './bootstrap/onboarding-event.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [OnboardingEvent],
        synchronize: true, // auto-creates onboarding_events table on first boot
        ssl: config.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
      }),
    }),
    BootstrapModule,
    UsersModule,
  ],
})
export class AppModule {}
