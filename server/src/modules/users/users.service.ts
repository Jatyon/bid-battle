import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FileUploadService, IUploadedFile } from '@shared/file-upload';
import { UserRepository } from './repositories/users.repository';
import { User } from './entities/user.entity';
import { PublicUserProfileResponse, SearchUsersDto, UpdateProfileDto } from './dto';
import { UserToken } from './entities';
import { DeepPartial, FindOptionsWhere, UpdateResult } from 'typeorm';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

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

  async searchPublicUsers(queryDto: SearchUsersDto): Promise<PublicUserProfileResponse[]> {
    const users = await this.userRepository.searchUsers(queryDto);
    return users.map((user) => new PublicUserProfileResponse(user));
  }

  async getPublicProfile(userId: number): Promise<PublicUserProfileResponse> {
    const user = await this.userRepository.findOneBy({ id: userId });

    if (!user) throw new NotFoundException('user.error.user_not_found');

    return new PublicUserProfileResponse(user);
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

  async updateProfile(userId: number, dto: UpdateProfileDto): Promise<User> {
    const user = await this.userRepository.findOneBy({ id: userId });

    if (!user) throw new NotFoundException('user.error.user_not_found');

    if (dto.firstName) user.firstName = dto.firstName;
    if (dto.lastName) user.lastName = dto.lastName;

    return this.userRepository.save(user);
  }

  async updateAvatar(userId: number, file: Express.Multer.File): Promise<User> {
    const user = await this.userRepository.findOneBy({ id: userId });

    if (!user) throw new NotFoundException('user.error.user_not_found');

    const options = this.fileUploadService.getAvatarUploadOptions();

    let uploadedFile: IUploadedFile;
    try {
      uploadedFile = await this.fileUploadService.uploadSingle(file, options);
    } catch {
      throw new BadRequestException('user.error.update_avatar_failed');
    }

    const oldAvatarPath = user.avatar ?? null;

    user.avatar = uploadedFile.url;
    const savedUser = await this.userRepository.save(user);

    if (oldAvatarPath) {
      await this.fileUploadService.deleteFile(oldAvatarPath).catch((err) => {
        this.logger.warn(
          `Failed to delete old avatar for user ${userId}: ${err instanceof Error ? err.message : String(err)} — stale file left on disk, recoverable via cleanup job`,
        );
      });
    }

    return savedUser;
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
