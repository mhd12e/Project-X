import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VaultCredential } from './vault-credential.entity';
import { VaultService } from './vault.service';
import { VaultController } from './vault.controller';
import { CredentialTesterService } from './credential-tester.service';

@Module({
  imports: [TypeOrmModule.forFeature([VaultCredential])],
  controllers: [VaultController],
  providers: [VaultService, CredentialTesterService],
  exports: [VaultService],
})
export class VaultModule {}
