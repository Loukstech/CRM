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
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { MembershipStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  type AuthUser,
  CurrentAuth,
  Public,
  RequirePermissions,
  type TenantAuth,
  UserScoped,
} from '../../common/auth-context';
import { CursorPaginationQuery } from '../../common/pagination';
import { IsDisplayName, IsPassword, Trim } from '../../common/validators';
import { AuthRateLimit } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { InvitationsService } from './invitations.service';
import { MembersService } from './members.service';

class UpdateMemberDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ enum: MembershipStatus })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
}

class CreateInvitationDto {
  @ApiProperty({ example: 'collegue@exemple.com' })
  @Trim()
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roleId: string;
}

class AcceptInvitationDto {
  @ApiProperty({ description: "Jeton reçu dans l'e-mail d'invitation." })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;
}

class AcceptInvitationSignupDto extends AcceptInvitationDto {
  @ApiProperty({ example: 'Grace Hopper' })
  @IsDisplayName(200)
  name: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsPassword()
  password: string;
}

@ApiTags('members')
@ApiBearerAuth()
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermissions('members.view')
  @ApiOperation({ summary: "Membres de l'organisation active" })
  list(@CurrentAuth() auth: TenantAuth, @Query() query: CursorPaginationQuery) {
    return this.members.list(auth, query);
  }

  @Patch(':id')
  @RequirePermissions('members.update')
  @ApiOperation({ summary: "Changer le rôle ou le statut d'un membre" })
  update(
    @CurrentAuth() auth: TenantAuth,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.members.update(auth, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('members.remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Retirer un membre de l'organisation" })
  async remove(@CurrentAuth() auth: TenantAuth, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.members.remove(auth, id);
  }
}

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @RequirePermissions('members.view')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invitations en attente' })
  list(@CurrentAuth() auth: TenantAuth) {
    return this.invitations.list(auth);
  }

  @Post()
  @RequirePermissions('members.invite')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inviter une personne par e-mail' })
  create(@CurrentAuth() auth: TenantAuth, @Body() dto: CreateInvitationDto) {
    return this.invitations.create(auth, dto);
  }

  @Delete(':id')
  @RequirePermissions('members.invite')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Révoquer une invitation en attente' })
  async revoke(@CurrentAuth() auth: TenantAuth, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.invitations.revoke(auth, id);
  }

  @Post('accept')
  @UserScoped()
  @AuthRateLimit()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accepter une invitation avec un compte existant' })
  accept(@CurrentAuth() auth: AuthUser, @Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(auth, dto.token);
  }

  @Post('accept-signup')
  @Public()
  @AuthRateLimit()
  @ApiOperation({ summary: 'Accepter une invitation en créant son compte' })
  async acceptWithSignup(@Body() dto: AcceptInvitationSignupDto) {
    const { userId, organizationId } = await this.invitations.acceptWithSignup(dto);
    return this.auth.openSession(userId, organizationId);
  }
}

@Module({
  controllers: [MembersController, InvitationsController],
  providers: [MembersService, InvitationsService],
})
export class MembershipsModule {}
