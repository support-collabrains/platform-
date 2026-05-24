import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OnboardingEvent } from './bootstrap/onboarding-event.entity';
import { DocDocument, DocNotification, DocSummary } from './documents/document.entity';
import { DocumentsModule } from './documents/documents.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [OnboardingEvent, DocDocument, DocNotification, DocSummary],
        synchronize: true, // auto-creates onboarding_events table on first boot
        ssl: config.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
      }),
    }),
    BootstrapModule,
    UsersModule,
    AdminModule,
    NotificationsModule,
    DocumentsModule,
  ],
})
export class AppModule {}
