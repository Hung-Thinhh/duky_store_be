import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BlogReusableBlockType,
  Prisma,
} from '../../../generated/prisma/client';
import { slugify } from '../../common/utils/slug.util';
import { PrismaService } from '../../database/prisma.service';
import { CreateBlogReusableBlockDto } from './dto/create-blog-reusable-block.dto';
import { ListBlogReusableBlocksQueryDto } from './dto/list-blog-reusable-blocks-query.dto';
import { UpdateBlogReusableBlockDto } from './dto/update-blog-reusable-block.dto';

@Injectable()
export class BlogReusableBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListBlogReusableBlocksQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;
    const where = this.buildWhere(query);
    const [total, blocks] = await this.prisma.$transaction([
      this.prisma.blogReusableBlock.count({ where }),
      this.prisma.blogReusableBlock.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: blocks.map((block) => this.toReusableBlock(block)),
      pagination: this.toPagination(page, limit, total),
    };
  }

  async getById(id: string) {
    const block = await this.getBlockOrThrow(id);
    return this.toReusableBlock(block);
  }

  async create(createDto: CreateBlogReusableBlockDto, userId?: string) {
    const html = createDto.html.trim();
    if (!html) {
      throw new BadRequestException('Reusable block HTML is required');
    }

    const slug = await this.prepareSlug(createDto.name, createDto.slug);
    const block = await this.prisma.blogReusableBlock.create({
      data: {
        name: createDto.name.trim(),
        slug,
        type: createDto.type ?? BlogReusableBlockType.CUSTOM,
        description: this.nullableTrim(createDto.description),
        html,
        isActive: createDto.isActive ?? true,
        sortOrder: createDto.sortOrder ?? 0,
        createdById: userId,
        updatedById: userId,
      },
    });

    return this.toReusableBlock(block);
  }

  async update(id: string, updateDto: UpdateBlogReusableBlockDto, userId?: string) {
    await this.getBlockOrThrow(id);
    const data: Prisma.BlogReusableBlockUpdateInput = {};

    if (updateDto.name !== undefined) {
      data.name = updateDto.name.trim();
    }

    if (updateDto.slug !== undefined || updateDto.name !== undefined) {
      data.slug = await this.prepareSlug(
        updateDto.name ?? undefined,
        updateDto.slug,
        id,
      );
    }

    if (updateDto.type !== undefined) {
      data.type = updateDto.type;
    }

    if (updateDto.description !== undefined) {
      data.description = this.nullableTrim(updateDto.description);
    }

    if (updateDto.html !== undefined) {
      const html = updateDto.html.trim();
      if (!html) {
        throw new BadRequestException('Reusable block HTML is required');
      }
      data.html = html;
    }

    if (updateDto.isActive !== undefined) {
      data.isActive = updateDto.isActive;
    }

    if (updateDto.sortOrder !== undefined) {
      data.sortOrder = updateDto.sortOrder;
    }

    if (userId) {
      data.updatedBy = { connect: { id: userId } };
    }

    if (!Object.keys(data).length) {
      throw new BadRequestException('No update data provided');
    }

    const block = await this.prisma.blogReusableBlock.update({
      where: { id },
      data,
    });

    return this.toReusableBlock(block);
  }

  async remove(id: string, userId?: string) {
    await this.getBlockOrThrow(id);
    await this.prisma.blogReusableBlock.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        ...(userId ? { updatedById: userId } : {}),
      },
    });

    return { success: true };
  }

  private buildWhere(
    query: ListBlogReusableBlocksQueryDto,
  ): Prisma.BlogReusableBlockWhereInput {
    const where: Prisma.BlogReusableBlockWhereInput = {
      deletedAt: null,
    };
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    return where;
  }

  private async getBlockOrThrow(id: string) {
    const block = await this.prisma.blogReusableBlock.findFirst({
      where: { id, deletedAt: null },
    });

    if (!block) {
      throw new NotFoundException('Reusable block not found');
    }

    return block;
  }

  private async prepareSlug(name?: string, requestedSlug?: string, currentId?: string) {
    const rawSlug = requestedSlug?.trim() || name?.trim();
    if (!rawSlug) {
      throw new BadRequestException('Reusable block slug or name is required');
    }

    const baseSlug = slugify(rawSlug);
    let slug = baseSlug;
    let suffix = 1;

    while (
      await this.prisma.blogReusableBlock.findFirst({
        where: {
          slug,
          ...(currentId ? { id: { not: currentId } } : {}),
        },
        select: { id: true },
      })
    ) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    return slug;
  }

  private nullableTrim(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed || null;
  }

  private toReusableBlock(block: Prisma.BlogReusableBlockGetPayload<object>) {
    return block;
  }

  private toPagination(page: number, limit: number, total: number) {
    return {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
