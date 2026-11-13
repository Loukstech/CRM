import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentAuth, Public, UserScoped } from '../../common/auth-context';
import { getConfig } from '../../config/env';
import { AuthService } from './auth.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  SwitchOrganizationDto,
  TokenDto,
} from './dto/auth.dto';

/** Limite renforcée sur les routes sensibles (force brute, bourrage d'identifiants). */
export const AuthRateLimit = () =>
  Throttle({
    default: {
      limit: () => getConfig().AUTH_RATE_LIMIT_MAX,
      ttl: () => getConfig().RATE_LIMIT_WINDOW_SECONDS * 1000,
    },
  });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Public()
  @AuthRateLimit()
  @ApiOperation({ summary: 'Créer un compte et sa première organisation' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @Public()
  @AuthRateLimit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Se connecter' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @Public()
  @AuthRateLimit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renouveler les jetons (rotation à usage unique)' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UserScoped()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Révoquer la session courante' })
  async logout(@CurrentAuth() auth: AuthUser): Promise<void> {
    await this.auth.logout(auth);
  }

  @Get('me')
  @UserScoped()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profil, organisations et permissions effectives' })
  me(@CurrentAuth() auth: AuthUser) {
    return this.auth.me(auth);
  }

  @Post('switch-organization')
  @UserScoped()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Changer d'organisation active (appartenance vérifiée côté serveur)" })
  switchOrganization(@CurrentAuth() auth: AuthUser, @Body() dto: SwitchOrganizationDto) {
    return this.auth.switchOrganization(auth, dto);
  }

  @Post('email/verify')
  @Public()
  @AuthRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Confirmer l'adresse e-mail avec le jeton reçu" })
  async verifyEmail(@Body() dto: TokenDto): Promise<void> {
    await this.auth.verifyEmail(dto.token);
  }

  @Post('email/resend')
  @UserScoped()
  @AuthRateLimit()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Renvoyer l'e-mail de vérification" })
  async resendVerification(@CurrentAuth() auth: AuthUser): Promise<void> {
    await this.auth.resendVerification(auth);
  }

  @Post('password/forgot')
  @Public()
  @AuthRateLimit()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Demander un lien de réinitialisation (réponse identique si le compte est inconnu)',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.auth.forgotPassword(dto);
  }

  @Post('password/reset')
  @Public()
  @AuthRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Définir un nouveau mot de passe ; révoque toutes les sessions' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto);
  }
}
