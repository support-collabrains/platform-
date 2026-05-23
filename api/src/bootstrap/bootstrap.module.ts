import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BootstrapController } from './bootstrap.controller';
import { BootstrapService } from './bootstrap.service';
import { AuthentikService } from './integrations/authentik.service';
import { MailcowService } from './integrations/mailcow.service';
import { TraefikService } from './integrations/traefik.service';
import { OnboardingEvent } from './onboarding-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OnboardingEvent])],
  controllers: [BootstrapController],
  providers: [BootstrapService, AuthentikService, MailcowService, TraefikService],
  exports: [BootstrapService],
})
export class BootstrapModule {}
