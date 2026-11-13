import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsDisplayName, Trim } from '../../../common/validators';
import { PERMISSION_SCOPES, type PermissionScopeName } from '../../permissions/permission-catalog';

export class PermissionGrantDto {
  @ApiProperty({ example: 'members.view' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  key: string;

  @ApiPropertyOptional({ enum: PERMISSION_SCOPES, default: 'ORGANIZATION' })
  @IsOptional()
  @IsIn(PERMISSION_SCOPES)
  scope?: PermissionScopeName;
}

export class CreateRoleDto {
  @ApiProperty({ example: 'Responsable commercial' })
  @IsDisplayName(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({ type: [PermissionGrantDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PermissionGrantDto)
  permissions: PermissionGrantDto[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDisplayName(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    type: [PermissionGrantDto],
    description: 'Remplace intégralement la liste des permissions du rôle.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PermissionGrantDto)
  permissions?: PermissionGrantDto[];
}
