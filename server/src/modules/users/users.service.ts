import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FileUploadService, IUploadedFile } from '@shared/file-upload';
import { UserRepository } from './repositories/users.repository';
import { User } from './entities/user.entity';
import { UpdateProfileDto } from './dto';
import { UserToken } from './entities';
import { DeepPartial, FindOptionsWhere, UpdateResult } from 'typeorm';
import { I18nContext } from 'nestjs-i18n';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly fileUploadService: FileUploadService,
  ) {}

  findOneBy(data: FindOptionsWhere<User>): Promise<User | null> {
    return this.userRepository.findOneBy(data);
  }

  findOneWithPasswordByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOneWithPasswordByEmail(email);
  }

  create(data: DeepPartial<User>): User {
    return this.userRepository.create(data);
  }

  save(data: DeepPartial<User>): Promise<User> {
    return this.userRepository.save(data);
  }

  updateBy(where: FindOptionsWhere<User>, data: Partial<User>): Promise<UpdateResult> {
    return this.userRepository.update(where, data);
  }

  async updateProfile(userId: number, dto: UpdateProfileDto, i18n: I18nContext): Promise<User> {
    const user = await this.userRepository.findOneBy({ id: userId });

    if (!user) throw new NotFoundException(i18n.t('user.error.user_not_found'));

    if (dto.firstName) user.firstName = dto.firstName;
    if (dto.lastName) user.lastName = dto.lastName;

    return this.userRepository.save(user);
  }

  async updateAvatar(userId: number, file: Express.Multer.File, i18n: I18nContext): Promise<User> {
    const user = await this.userRepository.findOneBy({ id: userId });

    if (!user) throw new NotFoundException(i18n.t('user.error.user_not_found'));

    const options = this.fileUploadService.getAvatarUploadOptions();

    let uploadedFile: IUploadedFile;
    try {
      uploadedFile = await this.fileUploadService.uploadSingle(file, options, i18n);
    } catch {
      throw new BadRequestException(i18n.t('user.error.update_avatar_failed'));
    }

    if (user.avatar) await this.fileUploadService.deleteFile(user.avatar);

    user.avatar = uploadedFile.url;
    return this.userRepository.save(user);
  }

  async deleteAccount(userId: number): Promise<void> {
    await this.userRepository.manager.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.softDelete(User, { id: userId });
      await transactionalEntityManager.delete(UserToken, { userId });
    });
  }

  async deleteAvatar(userId: number): Promise<void> {
    const user = await this.userRepository.findOneBy({ id: userId });

    if (!user || !user.avatar) return;

    await this.fileUploadService.deleteFile(user.avatar);

    user.avatar = null;
    await this.userRepository.save(user);
  }
}
