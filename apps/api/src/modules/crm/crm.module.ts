import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuth, RequirePermissions, type TenantAuth } from '../../common/auth-context';
import { CompaniesService } from './companies.service';
import { ContactsService } from './contacts.service';
// Importés comme valeurs (pas `import type`) : le pipe de validation a besoin
// de la classe à l'exécution pour valider et filtrer les paramètres de requête.
import {
  CompanyQuery,
  ContactQuery,
  CreateCompanyDto,
  CreateContactDto,
  CreateTagDto,
  TagListQuery,
  UpdateCompanyDto,
  UpdateContactDto,
  UpdateTagDto,
} from './dto/crm.dto';
import { TagsService } from './tags.service';

@ApiTags('contacts')
@ApiBearerAuth()
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  @RequirePermissions('contacts.view')
  @ApiOperation({ summary: 'Contacts visibles par le rôle (recherche, filtres, curseur)' })
  list(@CurrentAuth() auth: TenantAuth, @Query() query: ContactQuery) {
    return this.contacts.list(auth, query);
  }

  @Post()
  @RequirePermissions('contacts.create')
  @ApiOperation({ summary: 'Créer un contact' })
  create(@CurrentAuth() auth: TenantAuth, @Body() dto: CreateContactDto) {
    return this.contacts.create(auth, dto);
  }

  @Get(':id')
  @RequirePermissions('contacts.view')
  @ApiOperation({ summary: 'Fiche contact' })
  findOne(@CurrentAuth() auth: TenantAuth, @Param('id', ParseUUIDPipe) id: string) {
    return this.contacts.findOne(auth, id);
  }

  @Patch(':id')
  @RequirePermissions('contacts.update')
  @ApiOperation({ summary: 'Modifier un contact' })
  update(
    @CurrentAuth() auth: TenantAuth,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contacts.update(auth, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('contacts.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un contact (suppression logique)' })
  async remove(@CurrentAuth() auth: TenantAuth, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.contacts.remove(auth, id);
  }
}

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  @RequirePermissions('companies.view')
  @ApiOperation({ summary: 'Entreprises visibles par le rôle' })
  list(@CurrentAuth() auth: TenantAuth, @Query() query: CompanyQuery) {
    return this.companies.list(auth, query);
  }

  @Post()
  @RequirePermissions('companies.manage')
  @ApiOperation({ summary: 'Créer une entreprise' })
  create(@CurrentAuth() auth: TenantAuth, @Body() dto: CreateCompanyDto) {
    return this.companies.create(auth, dto);
  }

  @Get(':id')
  @RequirePermissions('companies.view')
  @ApiOperation({ summary: 'Fiche entreprise' })
  findOne(@CurrentAuth() auth: TenantAuth, @Param('id', ParseUUIDPipe) id: string) {
    return this.companies.findOne(auth, id);
  }

  @Patch(':id')
  @RequirePermissions('companies.manage')
  @ApiOperation({ summary: 'Modifier une entreprise' })
  update(
    @CurrentAuth() auth: TenantAuth,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companies.update(auth, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('companies.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une entreprise (suppression logique)' })
  async remove(@CurrentAuth() auth: TenantAuth, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.companies.remove(auth, id);
  }
}

@ApiTags('tags')
@ApiBearerAuth()
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @RequirePermissions('contacts.view')
  @ApiOperation({ summary: "Étiquettes de l'organisation" })
  list(@CurrentAuth() auth: TenantAuth, @Query() query: TagListQuery) {
    return this.tags.list(auth, query);
  }

  @Post()
  @RequirePermissions('tags.manage')
  @ApiOperation({ summary: 'Créer une étiquette' })
  create(@CurrentAuth() auth: TenantAuth, @Body() dto: CreateTagDto) {
    return this.tags.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions('tags.manage')
  @ApiOperation({ summary: 'Renommer ou recolorer une étiquette' })
  update(@CurrentAuth() auth: TenantAuth, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTagDto) {
    return this.tags.update(auth, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tags.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une étiquette (les liens tombent en cascade)' })
  async remove(@CurrentAuth() auth: TenantAuth, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tags.remove(auth, id);
  }
}

@Module({
  controllers: [ContactsController, CompaniesController, TagsController],
  providers: [ContactsService, CompaniesService, TagsService],
})
export class CrmModule {}
