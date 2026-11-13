import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength, Validate, ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import { Prisma } from '@prisma/client';

const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));
const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

@ValidatorConstraint({ name: 'isCurrencyCode' })
class IsCurrencyCodeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && CURRENCIES.has(value);
  }
  defaultMessage(): string {
    return 'currency doit être un code ISO 4217 en majuscules (ex. EUR, XOF, USD)';
  }
}

@ValidatorConstraint({ name: 'isCountryCode' })
class IsCountryCodeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value)) return false;
    // Codes réservés que Intl sait nommer mais qui ne sont pas des pays
    // (ZZ = région inconnue, XA/XB = pseudo-locales).
    if (value === 'ZZ' || value === 'XA' || value === 'XB') return false;
    // Intl renvoie le code tel quel lorsqu'il ne correspond à aucun pays.
    return REGION_NAMES.of(value) !== value;
  }
  defaultMessage(): string {
    return 'country doit être un code pays ISO 3166-1 alpha-2 en majuscules (ex. FR, BJ, CA)';
  }
}

@ValidatorConstraint({ name: 'isIanaTimezone' })
class IsIanaTimezoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length > 64) return false;
    try {
      // Accepte les zones canoniques et leurs alias (ex. Africa/Porto-Novo).
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }
  defaultMessage(): string {
    return 'timezone doit être un fuseau horaire IANA valide (ex. Europe/Paris, Africa/Porto-Novo)';
  }
}

export const IsCurrencyCode = () => Validate(IsCurrencyCodeConstraint);
export const IsCountryCode = () => Validate(IsCountryCodeConstraint);
export const IsIanaTimezone = () => Validate(IsIanaTimezoneConstraint);

/** Supprime les espaces de début et de fin d'une chaîne reçue. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** Texte court obligatoire, sans caractères de contrôle. */
export const IsDisplayName = (maxLength: number) =>
  applyDecorators(
    Trim(),
    IsString(),
    MinLength(1),
    MaxLength(maxLength),
    // eslint-disable-next-line no-control-regex
    Matches(/^[^\u0000-\u001f\u007f]*$/, { message: 'caractères de contrôle interdits' }),
  );

/**
 * Politique de mot de passe (NIST SP 800-63B) : longueur plutôt que règles de
 * composition. 12 caractères minimum, 128 maximum (borne anti-déni de service
 * sur le hachage).
 */
export const IsPassword = () => applyDecorators(IsString(), MinLength(12), MaxLength(128));

/**
 * Vrai si l'erreur Prisma est une violation d'unicité sur le modèle donné.
 *
 * On se fie au modèle et non à `meta.target` : Prisma laisse ce dernier à
 * null pour les contraintes composites et les index partiels.
 */
export function isUniqueViolation(error: unknown, model: Prisma.ModelName): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    error.meta?.modelName === model
  );
}
