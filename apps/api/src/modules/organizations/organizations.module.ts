import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';

// OrganizationProvisioner est fourni par AuthModule (global) : l'inscription en a besoin.
@Module({ controllers: [OrganizationsController] })
export class OrganizationsModule {}
