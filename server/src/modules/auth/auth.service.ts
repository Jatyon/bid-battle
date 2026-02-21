import { Injectable, Logger, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '@config/services/config.service';
import { UsersService } from '@modules/users/services/users.service';
import { User } from '@modules/users/entities/user.entity';
import { AuthRegisterDto, AuthLoginDto, RefreshTokenDto } from './dto';
import { IAuthJwtPayload, IAuthTokens } from './interfaces';
import { I18nContext, I18nService } from 'nestjs-i18n';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger: Logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: AppConfigService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async validateJwtUser(payload: IAuthJwtPayload, i18n: I18nService): Promise<User> {
    const user = await this.usersService.findOneBy({ id: payload.sub });

    if (!user) throw new UnauthorizedException(i18n.t('users.user_not_found'));

    return user;
  }

  async register(registerDto: AuthRegisterDto, i18n: I18nContext): Promise<void> {
    const { email, password } = registerDto;

    const existingUser = await this.usersService.findOneBy({ email });

    if (existingUser) throw new ConflictException(i18n.t(`auth.errors.user_with_email_#email_exists`, { args: { email } }));

    const salt: string = await bcrypt.genSalt(this.configService.jwt.saltOrRounds);

    const hashedPassword: string = await bcrypt.hash(password, salt);

    const user = this.usersService.create({
      ...registerDto,
      password: hashedPassword,
    });

    await this.usersService.save(user);
  }

  async login(authLoginDto: AuthLoginDto, i18n: I18nContext): Promise<IAuthTokens> {
    const user = await this.validateUser(authLoginDto.email, authLoginDto.password);

    if (!user) throw new UnauthorizedException(i18n.t('auth.errors.invalid_credential'));

    await this.usersService.updateBy(
      { id: user.id },
      {
        lastLoginAt: new Date(),
      },
    );

    return this.generateAuthTokens(user);
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto, i18n: I18nContext): Promise<IAuthTokens> {
    let payload: IAuthJwtPayload;

    try {
      payload = await this.jwtService.verify(refreshTokenDto.refreshToken);
    } catch {
      throw new UnauthorizedException(i18n.t(`auth.errors.refresh_token_not_recognized`));
    }

    const user = await this.usersService.findOneBy({ email: payload.email, id: payload.sub });

    if (!user) throw new UnauthorizedException(i18n.t('auth.errors.invalid_credential'));

    return this.generateAuthTokens(user);
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findOneWithPasswordByEmail(email);

    if (user && user.password && (await bcrypt.compare(password, user.password))) return Object.fromEntries(Object.entries(user).filter(([key]) => key !== 'password')) as User;

    return null;
  }

  private async generateAuthTokens(user: User): Promise<IAuthTokens> {
    const payload: IAuthJwtPayload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { payload },
        {
          expiresIn: this.configService.jwt.tokenLife,
        },
      ),
      this.jwtService.signAsync(
        { payload },
        {
          expiresIn: this.configService.jwt.refreshTokenLife,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
