import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContentStatus,
  Prisma,
  SeoEntityType,
} from '../../../generated/prisma/client';
import { slugify } from '../../common/utils/slug.util';
import { PrismaService } from '../../database/prisma.service';
import { SeoMetadataDto } from '../categories/dto/seo-metadata.dto';
import { CreateBlogCategoryDto } from './dto/create-blog-category.dto';
import { ListBlogCategoriesQueryDto } from './dto/list-blog-categories-query.dto';
import { UpdateBlogCategoryDto } from './dto/update-blog-category.dto';

type SeoData = Omit<
  Prisma.SeoMetadataUncheckedCreateInput,
  'id' | 'entityType' | 'entityId' | 'createdAt' | 'updatedAt'
>;

@Injectable()
export class BlogCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin(query: ListBlogCategoriesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query, false);
    const [total, categories] = await this.prisma.$transaction([
      this.prisma.blogCategory.count({ where }),
      this.prisma.blogCategory.findMany({
        where,
        include: this.categoryInclude(),
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: categories.map((category) => this.toCategory(category)),
      pagination: this.toPagination(page, limit, total),
    };
  }

  async listPublic() {
    const categories = await this.prisma.blogCategory.findMany({
      where: {
        deletedAt: null,
        status: ContentStatus.PUBLISHED,
      },
      include: this.categoryInclude(),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return { data: categories.map((category) => this.toCategory(category)) };
  }

  async create(createDto: CreateBlogCategoryDto) {
    const slug = await this.prepareSlug(createDto.name, createDto.slug);
    await this.assertValidParent(createDto.parentId);

    const category = await this.prisma.blogCategory.create({
      data: {
        name: createDto.name.trim(),
        slug,
        description: this.nullableTrim(createDto.description),
        parentId: createDto.parentId ?? null,
        sortOrder: createDto.sortOrder ?? 0,
        status: createDto.status ?? ContentStatus.PUBLISHED,
      },
    });

    await this.upsertSeo(category.id, createDto.seo);

    return this.getById(category.id);
  }

  async getById(id: string) {
    const category = await this.getCategoryOrThrow(id);
    const seo = await this.findSeo(id);

    return this.toCategory(category, seo);
  }

  async getPublicBySlug(slug: string) {
    const category = await this.prisma.blogCategory.findFirst({
      where: {
        slug,
        deletedAt: null,
        status: ContentStatus.PUBLISHED,
      },
      include: this.categoryInclude(),
    });

    if (!category) {
      throw new NotFoundException('Blog category not found');
    }

    const seo = await this.findSeo(category.id);

    return this.toCategory(category, seo);
  }

  async update(id: string, updateDto: UpdateBlogCategoryDto) {
    await this.getCategoryOrThrow(id);
    await this.assertValidParent(updateDto.parentId, id);
    const data = await this.buildUpdateData(id, updateDto);

    if (!Object.keys(data).length && !updateDto.seo) {
      throw new BadRequestException('No update data provided');
    }

    if (Object.keys(data).length) {
      await this.prisma.blogCategory.update({ where: { id }, data });
    }

    await this.upsertSeo(id, updateDto.seo);

    return this.getById(id);
  }

  async remove(id: string) {
    await this.getCategoryOrThrow(id);
    await this.prisma.blogCategory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  private buildWhere(
    query: ListBlogCategoriesQueryDto,
    publicOnly: boolean,
  ): Prisma.BlogCategoryWhereInput {
    const where: Prisma.BlogCategoryWhereInput = {
      deletedAt: null,
      ...(publicOnly ? { status: ContentStatus.PUBLISHED } : {}),
    };
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.status && !publicOnly) {
      where.status = query.status;
    }

    if (query.parentId !== undefined) {
      where.parentId = query.parentId || null;
    }

    return where;
  }

  private async buildUpdateData(
    id: string,
    updateDto: UpdateBlogCategoryDto,
  ) {
    const data: Prisma.BlogCategoryUncheckedUpdateInput = {};

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

    if (updateDto.description !== undefined) {
      data.description = this.nullableTrim(updateDto.description);
    }

    if (updateDto.parentId !== undefined) {
      data.parentId = updateDto.parentId || null;
    }

    if (updateDto.sortOrder !== undefined) {
      data.sortOrder = updateDto.sortOrder;
    }

    if (updateDto.status !== undefined) {
      data.status = updateDto.status;
    }

    return data;
  }

  private async prepareSlug(name: string, slug?: string, id?: string) {
    const normalizedSlug = slugify(slug?.trim() || name);

    if (!normalizedSlug) {
      throw new BadRequestException('Slug is required');
    }

    const existing = await this.prisma.blogCategory.findFirst({
      where: {
        slug: normalizedSlug,
        ...(id ? { NOT: { id } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Blog category slug is already used');
    }

    return normalizedSlug;
  }

  private async assertValidParent(parentId?: string | null, id?: string) {
    if (!parentId) {
      return;
    }

    if (parentId === id) {
      throw new BadRequestException('Category cannot be its own parent');
    }

    let parent = await this.prisma.blogCategory.findFirst({
      where: { id: parentId, deletedAt: null },
      select: { id: true, parentId: true },
    });

    if (!parent) {
      throw new BadRequestException('Parent blog category does not exist');
    }

    while (parent?.parentId) {
      if (parent.parentId === id) {
        throw new BadRequestException('Category parent would create a cycle');
      }

      parent = await this.prisma.blogCategory.findFirst({
        where: { id: parent.parentId, deletedAt: null },
        select: { id: true, parentId: true },
      });
    }
  }

  private async getCategoryOrThrow(id: string) {
    const category = await this.prisma.blogCategory.findFirst({
      where: { id, deletedAt: null },
      include: this.categoryInclude(),
    });

    if (!category) {
      throw new NotFoundException('Blog category not found');
    }

    return category;
  }

  private async findSeo(entityId: string) {
    return this.prisma.seoMetadata.findUnique({
      where: {
        entityType_entityId: {
          entityType: SeoEntityType.BLOG_CATEGORY,
          entityId,
        },
      },
    });
  }

  private async upsertSeo(entityId: string, seoDto?: SeoMetadataDto) {
    if (!seoDto) {
      return;
    }

    const seoData = this.buildSeoData(seoDto);

    if (!Object.keys(seoData).length) {
      return;
    }

    await this.prisma.seoMetadata.upsert({
      where: {
        entityType_entityId: {
          entityType: SeoEntityType.BLOG_CATEGORY,
          entityId,
        },
      },
      create: {
        entityType: SeoEntityType.BLOG_CATEGORY,
        entityId,
        ...seoData,
      },
      update: seoData,
    });
  }

  private buildSeoData(seoDto: SeoMetadataDto) {
    const data: SeoData = {};

    if (seoDto.metaTitle !== undefined) data.metaTitle = this.nullableTrim(seoDto.metaTitle);
    if (seoDto.metaDescription !== undefined) data.metaDescription = this.nullableTrim(seoDto.metaDescription);
    if (seoDto.canonicalUrl !== undefined) data.canonicalUrl = this.nullableTrim(seoDto.canonicalUrl);
    if (seoDto.ogTitle !== undefined) data.ogTitle = this.nullableTrim(seoDto.ogTitle);
    if (seoDto.ogDescription !== undefined) data.ogDescription = this.nullableTrim(seoDto.ogDescription);
    if (seoDto.ogImageMediaId !== undefined) data.ogImageMediaId = seoDto.ogImageMediaId || null;
    if (seoDto.twitterTitle !== undefined) data.twitterTitle = this.nullableTrim(seoDto.twitterTitle);
    if (seoDto.twitterDescription !== undefined) data.twitterDescription = this.nullableTrim(seoDto.twitterDescription);
    if (seoDto.schemaType !== undefined) data.schemaType = this.nullableTrim(seoDto.schemaType);
    if (seoDto.schemaJson !== undefined) data.schemaJson = seoDto.schemaJson as Prisma.InputJsonValue;
    if (seoDto.breadcrumbJson !== undefined) data.breadcrumbJson = seoDto.breadcrumbJson as Prisma.InputJsonValue;
    if (seoDto.noIndex !== undefined) data.noIndex = seoDto.noIndex;
    if (seoDto.noFollow !== undefined) data.noFollow = seoDto.noFollow;

    return data;
  }

  private categoryInclude(): Prisma.BlogCategoryInclude {
    return {
      parent: { select: { id: true, name: true, slug: true } },
      _count: { select: { children: true, posts: true } },
    };
  }

  private nullableTrim(value?: string | null) {
    return value?.trim() || null;
  }

  private toPagination(page: number, limit: number, total: number) {
    return { page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  private toCategory(category: any, seo?: unknown) {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      parentId: category.parentId,
      parent: category.parent,
      sortOrder: category.sortOrder,
      status: category.status,
      childrenCount: category._count.children,
      postsCount: category._count.posts,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      seo,
    };
  }
}
