import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  IsCountryCode,
  IsCurrencyCode,
  IsDisplayName,
  IsIanaTimezone,
  IsPassword,
  Trim,
} from '../../../common/validators';

export class RegisterDto {
  @ApiProperty({ example: 'ada@exemple.com' })
  @Trim()
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsPassword()
  password: string;

  @ApiPropertyOptional({ description: 'Doit être identique au mot de passe.' })
  @IsOptional()
  @IsString()
  confirmPassword?: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @IsDisplayName(200)
  name: string;

  @ApiProperty({ example: 'Acme SARL' })
  @IsDisplayName(200)
  organizationName: string;

  @ApiProperty({ example: 'BJ', description: 'ISO 3166-1 alpha-2' })
  @IsCountryCode()
  country: string;

  @ApiProperty({ example: 'XOF', description: 'ISO 4217' })
  @IsCurrencyCode()
  currency: string;

  @ApiProperty({ example: 'Africa/Porto-Novo', description: 'Fuseau IANA' })
  @IsIanaTimezone()
  timezone: string;
}

export class LoginDto {
  @ApiProperty()
  @Trim()
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: "Organisation à activer ; ignorée si l'utilisateur n'en est pas membre actif.",
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  refreshToken: string;
}

export class TokenDto {
  @ApiProperty({ description: 'Jeton reçu par e-mail.' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @Trim()
  @IsEmail()
  @MaxLength(320)
  email: string;
}

export class ResetPasswordDto extends TokenDto {
  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsPassword()
  password: string;
}

export class SwitchOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  organizationId: string;
}
