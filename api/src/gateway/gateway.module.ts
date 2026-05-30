import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DashboardController } from './dashboard.controller';
import { PaperlessProxyController } from './paperless-proxy.controller';
import { ImmichProxyController } from './immich-proxy.controller';
import { LdapModule } from '../ldap/ldap.module';

@Module({
  imports: [HttpModule, LdapModule],
  controllers: [DashboardController, PaperlessProxyController, ImmichProxyController],
})
export class GatewayModule {}
