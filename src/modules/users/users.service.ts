import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  UserStatus,
  type Role,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AssignAdminUserRolesDto } from './dto/assign-admin-user-roles.dto';
import { ListAdminUsersQueryDto } from './dto/list-admin-users-query.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import * as bcrypt from 'bcryptjs';

type AdminUserWithRoles = NonNullable<
  Awaited<ReturnType<UsersService['findUserById']>>
>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAdminUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query);

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: this.userInclude(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: users.map((user) => this.toAdminUser(user)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            users: true,
            permissions: true,
          },
        },
      },
    });

    return {
      data: roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        usersCount: role._count.users,
        permissionsCount: role._count.permissions,
      })),
    };
  }

  async create(createDto: CreateAdminUserDto) {
    const email = createDto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Email is already used');
    }

    if (createDto.phone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: { phone: createDto.phone.trim(), deletedAt: null },
      });
      if (existingPhone) {
        throw new ConflictException('Phone is already used');
      }
    }

    const passwordHash = await bcrypt.hash(createDto.password, 12);

    let roleId: string | undefined;
    if (createDto.role) {
      const role = await this.prisma.role.findFirst({
        where: { name: createDto.role.trim().toUpperCase() },
      });
      if (role) {
        roleId = role.id;
      }
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        fullName: createDto.fullName.trim(),
        passwordHash,
        phone: createDto.phone?.trim() || null,
        status: createDto.isActive === false ? UserStatus.LOCKED : UserStatus.ACTIVE,
        roles: roleId
          ? {
              create: {
                roleId,
              },
            }
          : undefined,
      },
      include: this.userInclude(),
    });

    return this.toAdminUser(user);
  }

  async delete(id: string) {
    await this.getUserOrThrow(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: this.userInclude(),
    });
    return this.toAdminUser(user);
  }

  async getById(id: string) {
    return this.toAdminUser(await this.getUserOrThrow(id));
  }

  async update(id: string, updateDto: UpdateAdminUserDto) {
    await this.getUserOrThrow(id);
    const data = await this.buildUpdateData(id, updateDto);

    if (!Object.keys(data).length) {
      throw new BadRequestException('No update data provided');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: this.userInclude(),
    });

    return this.toAdminUser(user);
  }

  async lock(id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new BadRequestException('Cannot lock your own account');
    }

    await this.getUserOrThrow(id);
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { status: UserStatus.LOCKED },
        include: this.userInclude(),
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
    ]);

    return this.toAdminUser(user);
  }

  async unlock(id: string) {
    await this.getUserOrThrow(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.ACTIVE },
      include: this.userInclude(),
    });

    return this.toAdminUser(user);
  }

  async assignRoles(
    id: string,
    assignRolesDto: AssignAdminUserRolesDto,
    currentUserId: string,
  ) {
    await this.getUserOrThrow(id);
    const roleNames = this.normalizeRoleNames(assignRolesDto.roleNames);

    if (id === currentUserId && !roleNames.includes('SUPER_ADMIN')) {
      throw new BadRequestException('Cannot remove SUPER_ADMIN from yourself');
    }

    const roles = await this.prisma.role.findMany({
      where: { name: { in: roleNames } },
    });
    this.assertAllRolesExist(roleNames, roles);

    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          roles: {
            deleteMany: {},
            createMany: {
              data: roles.map((role) => ({ roleId: role.id })),
              skipDuplicates: true,
            },
          },
        },
        include: this.userInclude(),
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
    ]);

    return this.toAdminUser(user);
  }

  private buildWhere(query: ListAdminUsersQueryDto): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.role?.trim()) {
      where.roles = {
        some: {
          role: {
            name: query.role.trim().toUpperCase(),
          },
        },
      };
    }

    return where;
  }

  private async buildUpdateData(id: string, updateDto: UpdateAdminUserDto) {
    const data: Prisma.UserUpdateInput = {};

    if (updateDto.email !== undefined) {
      const email = updateDto.email.trim().toLowerCase();
      await this.assertUniqueEmail(id, email);
      data.email = email;
    }

    if (updateDto.fullName !== undefined) {
      data.fullName = updateDto.fullName.trim();
    }

    if (updateDto.phone !== undefined) {
      const phone = updateDto.phone?.trim() || null;
      await this.assertUniquePhone(id, phone);
      data.phone = phone;
    }

    return data;
  }

  private async assertUniqueEmail(id: string, email: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        email,
        NOT: { id },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Email is already used');
    }
  }

  private async assertUniquePhone(id: string, phone: string | null) {
    if (!phone) {
      return;
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        phone,
        NOT: { id },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Phone is already used');
    }
  }

  private normalizeRoleNames(roleNames: string[]) {
    const normalized = roleNames
      .map((roleName) => roleName.trim().toUpperCase())
      .filter(Boolean);

    if (!normalized.length) {
      throw new BadRequestException('At least one role is required');
    }

    return [...new Set(normalized)];
  }

  private assertAllRolesExist(roleNames: string[], roles: Role[]) {
    const existingRoleNames = new Set(roles.map((role) => role.name));
    const missingRoleNames = roleNames.filter(
      (roleName) => !existingRoleNames.has(roleName),
    );

    if (missingRoleNames.length) {
      throw new BadRequestException({
        message: 'Some roles do not exist',
        details: {
          missingRoleNames,
        },
      });
    }
  }

  private async getUserOrThrow(id: string) {
    const user = await this.findUserById(id);

    if (!user) {
      throw new NotFoundException('Admin user not found');
    }

    return user;
  }

  private async findUserById(id: string) {
    return this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.userInclude(),
    });
  }

  private userInclude() {
    return {
      roles: {
        include: {
          role: true,
        },
      },
    } as const;
  }

  private toAdminUser(user: AdminUserWithRoles) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      passwordChangedAt: user.passwordChangedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles: user.roles.map((userRole) => ({
        id: userRole.role.id,
        name: userRole.role.name,
        description: userRole.role.description,
        isSystem: userRole.role.isSystem,
      })),
    };
  }
}
