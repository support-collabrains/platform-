import { Module } from '@nestjs/common';
import { LdapMetadataService } from './ldap-metadata.service';

@Module({
  providers: [LdapMetadataService],
  exports: [LdapMetadataService],
})
export class LdapModule {}
