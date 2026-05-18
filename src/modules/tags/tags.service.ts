import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TagType } from '../../../generated/prisma/client';
import { slugify } from '../../common/utils/slug.util';
import { PrismaService } from '../../database/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { ListTagsQueryDto } from './dto/list-tags-query.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

type TagWithCounts = NonNullable<Awaited<ReturnType<TagsService['findById']>>>;

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListTagsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query);

    const [total, tags] = await this.prisma.$transaction([
      this.prisma.tag.count({ where }),
      this.prisma.tag.findMany({
        where,
        include: this.tagInclude(),
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: tags.map((tag) => this.toTag(tag)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(createDto: CreateTagDto) {
    const slug = await this.prepareSlug(createDto.name, createDto.slug);

    const tag = await this.prisma.tag.create({
      data: {
        name: createDto.name.trim(),
        slug,
        type: createDto.type ?? TagType.PRODUCT,
        description: this.nullableTrim(createDto.description),
      },
      include: this.tagInclude(),
    });

    return this.toTag(tag);
  }

  async getById(id: string) {
    return this.toTag(await this.getTagOrThrow(id));
  }

  async update(id: string, updateDto: UpdateTagDto) {
    await this.getTagOrThrow(id);
    const data = await this.buildUpdateData(id, updateDto);

    if (!Object.keys(data).length) {
      throw new BadRequestException('No update data provided');
    }

    const tag = await this.prisma.tag.update({
      where: { id },
      data,
      include: this.tagInclude(),
    });

    return this.toTag(tag);
  }

  async remove(id: string) {
    await this.getTagOrThrow(id);
    await this.prisma.tag.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  private buildWhere(query: ListTagsQueryDto): Prisma.TagWhereInput {
    const where: Prisma.TagWhereInput = {
      deletedAt: null,
    };
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.type) {
      where.type = query.type;
    }

    return where;
  }

  private async buildUpdateData(id: string, updateDto: UpdateTagDto) {
    const data: Prisma.TagUncheckedUpdateInput = {};

    if (updateDto.name !== undefined) {
      data.name = updateDto.name.trim();
    }

    if (updateDto.slug !== undefined) {
      data.slug = await this.prepareSlug(
        updateDto.name ?? '',
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

    return data;
  }

  private async prepareSlug(name: string, slug?: string, id?: string) {
    const normalizedSlug = slugify(slug?.trim() || name);

    if (!normalizedSlug) {
      throw new BadRequestException('Slug is required');
    }

    await this.assertUniqueSlug(normalizedSlug, id);

    return normalizedSlug;
  }

  private async assertUniqueSlug(slug: string, id?: string) {
    const existing = await this.prisma.tag.findFirst({
      where: {
        slug,
        ...(id ? { NOT: { id } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Tag slug is already used');
    }
  }

  private async getTagOrThrow(id: string) {
    const tag = await this.findById(id);

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return tag;
  }

  private async findById(id: string) {
    return this.prisma.tag.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.tagInclude(),
    });
  }

  private tagInclude() {
    return {
      _count: {
        select: {
          products: true,
          blogPosts: true,
        },
      },
    } as const;
  }

  private nullableTrim(value?: string | null) {
    return value?.trim() || null;
  }

  private toTag(tag: TagWithCounts) {
    return {
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      type: tag.type,
      description: tag.description,
      productsCount: tag._count.products,
      blogPostsCount: tag._count.blogPosts,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    };
  }
}
