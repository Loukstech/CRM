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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuth, RequirePermissions, type TenantAuth } from '../../common/auth-context';
import { PERMISSIONS } from '../permissions/permission-catalog';
import { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('permissions')
  @RequirePermissions('roles.view')
  @ApiOperation({ summary: 'Catalogue des permissions attribuables' })
  catalog() {
    return PERMISSIONS;
  }

  @Get('roles')
  @RequirePermissions('roles.view')
  @ApiOperation({ summary: "Rôles de l'organisation active" })
  list(@CurrentAuth() auth: TenantAuth) {
    return this.roles.list(auth);
  }

  @Post('roles')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Créer un rôle personnalisé' })
  create(@CurrentAuth() auth: TenantAuth, @Body() dto: CreateRoleDto) {
    return this.roles.create(auth, dto);
  }

  @Patch('roles/:id')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Modifier un rôle personnalisé' })
  update(
    @CurrentAuth() auth: TenantAuth,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.roles.update(auth, id, dto);
  }

  @Delete('roles/:id')
  @RequirePermissions('roles.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un rôle personnalisé non utilisé' })
  async remove(@CurrentAuth() auth: TenantAuth, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.roles.remove(auth, id);
  }
}

@Module({
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
