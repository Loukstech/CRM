import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ContactStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { CursorPaginationQuery } from '../../../common/pagination';
import { IsCountryCode, IsDisplayName, Trim } from '../../../common/validators';

/**
 * Convention de mise à jour : un champ absent (`undefined`) reste inchangé,
 * un champ présent à `null` est effacé. Le client web envoie donc explicitement
 * `null` pour vider un champ facultatif.
 */

// ───────────────────────────── Entreprises ─────────────────────────────

export class CreateCompanyDto {
  @ApiProperty({ example: 'Times Trading Inter' })
  @IsDisplayName(200)
  name: string;

  @ApiPropertyOptional({ example: 'timestradinginter.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Trim()
  @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, { message: 'domain doit être un nom de domaine valide' })
  domain?: string | null;

  @ApiPropertyOptional({ example: 'Négoce' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Trim()
  industry?: string | null;

  @ApiPropertyOptional({ example: '+229 01 23 45 67 89' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Trim()
  phone?: string | null;

  @ApiPropertyOptional({ example: 'https://timestradinginter.com' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Trim()
  @Matches(/^https?:\/\/\S+$/i, { message: 'website doit être une URL http(s)' })
  website?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Trim()
  addressLine?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Trim()
  city?: string | null;

  @ApiPropertyOptional({ example: 'BJ' })
  @IsOptional()
  @IsCountryCode()
  country?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  notes?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Membre propriétaire (défaut : soi-même).' })
  @IsOptional()
  @IsUUID()
  ownerMembershipId?: string | null;
}

/** Tous les champs deviennent facultatifs ; `null` efface, l'absence ne change rien. */
export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {}

export class CompanyQuery extends CursorPaginationQuery {
  @ApiPropertyOptional({ description: 'Recherche sur le nom, le domaine et la ville.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Trim()
  q?: string;

  @ApiPropertyOptional({ enum: ['recent', 'name'], default: 'recent' })
  @IsOptional()
  @IsIn(['recent', 'name'])
  sort?: 'recent' | 'name';
}

// ───────────────────────────── Contacts ─────────────────────────────

export class CreateContactDto {
  @ApiPropertyOptional({ example: 'Grâce' })
  @IsOptional()
  @IsDisplayName(100)
  firstName?: string | null;

  @ApiPropertyOptional({ example: 'Houngbo' })
  @IsOptional()
  @IsDisplayName(100)
  lastName?: string | null;

  @ApiPropertyOptional({ example: 'grace@exemple.com' })
  @IsOptional()
  @IsEmail({}, { message: 'email doit être une adresse valide' })
  @MaxLength(320)
  @Trim()
  email?: string | null;

  @ApiPropertyOptional({ example: '+229 97 00 00 00' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Trim()
  phone?: string | null;

  @ApiPropertyOptional({ example: 'Directrice achats' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Trim()
  jobTitle?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  companyId?: string | null;

  @ApiPropertyOptional({ enum: ContactStatus, default: ContactStatus.LEAD })
  @IsOptional()
  @IsEnum(ContactStatus)
  status?: ContactStatus;

  @ApiPropertyOptional({ example: 'Salon professionnel' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Trim()
  source?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  notes?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Membre propriétaire (défaut : soi-même).' })
  @IsOptional()
  @IsUUID()
  ownerMembershipId?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'Remplace intégralement les étiquettes.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  tagIds?: string[];
}

export class UpdateContactDto extends CreateContactDto {}

export class ContactQuery extends CursorPaginationQuery {
  @ApiPropertyOptional({ description: 'Recherche sur le nom, le prénom, l’e-mail, le téléphone.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Trim()
  q?: string;

  @ApiPropertyOptional({ enum: ContactStatus })
  @IsOptional()
  @IsEnum(ContactStatus)
  status?: ContactStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tagId?: string;

  @ApiPropertyOptional({ enum: ['recent', 'name'], default: 'recent' })
  @IsOptional()
  @IsIn(['recent', 'name'])
  sort?: 'recent' | 'name';
}

// ───────────────────────────── Étiquettes ─────────────────────────────

export class CreateTagDto {
  @ApiProperty({ example: 'Client historique' })
  @IsDisplayName(60)
  name: string;

  @ApiPropertyOptional({ example: '#2563eb', default: '#64748b' })
  @IsOptional()
  @Matches(/^#[0-9a-f]{6}$/i, { message: 'color doit être au format #rrggbb' })
  color?: string;
}

export class UpdateTagDto extends PartialType(CreateTagDto) {}

export class TagListQuery {
  @ApiPropertyOptional({ description: 'Recherche sur le nom de l’étiquette.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Trim()
  q?: string;

  @ApiPropertyOptional({ default: false, description: 'Inclure le nombre de contacts étiquetés.' })
  @IsOptional()
  // `Boolean('false')` vaut true : on interprète explicitement la chaîne.
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  withCount?: boolean;
}
