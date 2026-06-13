import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CategoryStatus,
  Prisma,
  SeoEntityType,
} from '../../../generated/prisma/client';
import { slugify } from '../../common/utils/slug.util';
import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { SeoMetadataDto } from './dto/seo-metadata.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { GscService } from '../seo/gsc.service';

type CategoryWithRelations = NonNullable<
  Awaited<ReturnType<CategoriesService['findCategoryById']>>
>;

type SeoData = Omit<
  Prisma.SeoMetadataUncheckedCreateInput,
  'id' | 'entityType' | 'entityId' | 'createdAt' | 'updatedAt'
>;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gscService: GscService,
  ) {}

  async list(query: ListCategoriesQueryDto) {
    const page = query.page;
    const limit = query.limit;
    const where = this.buildWhere(query);

    const take = limit;
    const skip = page && limit ? (page - 1) * limit : undefined;

    const [total, categories] = await this.prisma.$transaction([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        include: this.categoryInclude(),
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        ...(skip !== undefined ? { skip } : {}),
        ...(take !== undefined ? { take } : {}),
      }),
    ]);

    return {
      data: categories.map((category) => this.toCategory(category)),
      pagination: {
        page: page ?? 1,
        limit: limit ?? total,
        total,
        totalPages: limit ? Math.ceil(total / limit) : 1,
      },
    };
  }

  async listPublic() {
    const categories = await this.prisma.category.findMany({
      where: {
        deletedAt: null,
        status: CategoryStatus.ACTIVE,
      },
      include: this.categoryInclude(),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return {
      data: categories.map((category) => this.toCategory(category)),
    };
  }

  async create(createDto: CreateCategoryDto) {
    const slug = await this.prepareSlug(createDto.name, createDto.slug);
    await this.assertValidParent(createDto.parentId);
    await this.assertMediaExists(createDto.imageMediaId);
    await this.assertMediaExists(createDto.seo?.ogImageMediaId);

    const category = await this.prisma.category.create({
      data: {
        name: createDto.name.trim(),
        slug,
        description: this.nullableTrim(createDto.description),
        parentId: createDto.parentId ?? null,
        imageMediaId: createDto.imageMediaId ?? null,
        sortOrder: createDto.sortOrder ?? 0,
        status: createDto.status ?? CategoryStatus.ACTIVE,
      },
      include: this.categoryInclude(),
    });

    await this.upsertSeo(category.id, createDto.seo);

    if (category.status === CategoryStatus.ACTIVE) {
      try {
        await this.gscService.submitIndexing({
          url: `/danh-muc/${category.slug}`,
          type: 'URL_UPDATED',
        });
      } catch (error) {
        console.error(
          'Failed to submit category to Google Indexing API on creation',
          error,
        );
      }
    }

    return this.getById(category.id);
  }

  async getById(id: string) {
    const category = await this.getCategoryOrThrow(id);
    const seo = await this.findSeo(category.id);

    return this.toCategory(category, seo);
  }

  async getPublicBySlug(slug: string) {
    const category = await this.prisma.category.findFirst({
      where: {
        slug,
        deletedAt: null,
        status: CategoryStatus.ACTIVE,
      },
      include: this.categoryInclude(),
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const seo = await this.findSeo(category.id);

    return this.toCategory(category, seo);
  }

  async update(id: string, updateDto: UpdateCategoryDto) {
    const existing = await this.getCategoryOrThrow(id);
    await this.assertValidParent(updateDto.parentId, id);
    await this.assertMediaExists(updateDto.imageMediaId);
    await this.assertMediaExists(updateDto.seo?.ogImageMediaId);
    const data = await this.buildUpdateData(id, updateDto);

    if (!Object.keys(data).length && !updateDto.seo) {
      throw new BadRequestException('No update data provided');
    }

    if (Object.keys(data).length) {
      await this.prisma.category.update({
        where: { id },
        data,
      });
    }

    await this.upsertSeo(id, updateDto.seo);

    const updated = await this.getCategoryOrThrow(id);
    const wasActive = existing.status === CategoryStatus.ACTIVE;
    const isActive = updated.status === CategoryStatus.ACTIVE;

    if (isActive) {
      try {
        await this.gscService.submitIndexing({
          url: `/danh-muc/${updated.slug}`,
          type: 'URL_UPDATED',
        });

        if (wasActive && existing.slug !== updated.slug) {
          await this.gscService.submitIndexing({
            url: `/danh-muc/${existing.slug}`,
            type: 'URL_DELETED',
          });
        }
      } catch (error) {
        console.error(
          'Failed to submit category to Google Indexing API on update',
          error,
        );
      }
    } else if (wasActive && !isActive) {
      try {
        await this.gscService.submitIndexing({
          url: `/danh-muc/${existing.slug}`,
          type: 'URL_DELETED',
        });
      } catch (error) {
        console.error(
          'Failed to request Google indexing removal on category status change',
          error,
        );
      }
    }

    return this.getById(id);
  }

  async remove(id: string) {
    const existing = await this.getCategoryOrThrow(id);
    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    if (existing.status === CategoryStatus.ACTIVE) {
      try {
        await this.gscService.submitIndexing({
          url: `/danh-muc/${existing.slug}`,
          type: 'URL_DELETED',
        });
      } catch (error) {
        console.error(
          'Failed to request Google indexing removal on category deletion',
          error,
        );
      }
    }

    return { success: true };
  }

  private buildWhere(query: ListCategoriesQueryDto): Prisma.CategoryWhereInput {
    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
    };
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.parentId !== undefined) {
      where.parentId = query.parentId || null;
    }

    return where;
  }

  private async buildUpdateData(id: string, updateDto: UpdateCategoryDto) {
    const data: Prisma.CategoryUncheckedUpdateInput = {};

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

    if (updateDto.imageMediaId !== undefined) {
      data.imageMediaId = updateDto.imageMediaId || null;
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

    await this.assertUniqueSlug(normalizedSlug, id);

    return normalizedSlug;
  }

  private async assertUniqueSlug(slug: string, id?: string) {
    const existing = await this.prisma.category.findFirst({
      where: {
        slug,
        ...(id ? { NOT: { id } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Category slug is already used');
    }
  }

  private async assertValidParent(parentId?: string | null, id?: string) {
    if (!parentId) {
      return;
    }

    if (parentId === id) {
      throw new BadRequestException('Category cannot be its own parent');
    }

    let parent = await this.prisma.category.findFirst({
      where: {
        id: parentId,
        deletedAt: null,
      },
      select: {
        id: true,
        parentId: true,
      },
    });

    if (!parent) {
      throw new BadRequestException('Parent category does not exist');
    }

    while (parent?.parentId) {
      if (parent.parentId === id) {
        throw new BadRequestException('Category parent would create a cycle');
      }

      parent = await this.prisma.category.findFirst({
        where: {
          id: parent.parentId,
          deletedAt: null,
        },
        select: {
          id: true,
          parentId: true,
        },
      });
    }
  }

  private async assertMediaExists(mediaId?: string | null) {
    if (!mediaId) {
      return;
    }

    const media = await this.prisma.media.findFirst({
      where: {
        id: mediaId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!media) {
      throw new BadRequestException('Media does not exist');
    }
  }

  private async getCategoryOrThrow(id: string) {
    const category = await this.findCategoryById(id);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  private async findCategoryById(id: string) {
    return this.prisma.category.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.categoryInclude(),
    });
  }

  private async findSeo(entityId: string) {
    return this.prisma.seoMetadata.findUnique({
      where: {
        entityType_entityId: {
          entityType: SeoEntityType.CATEGORY,
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
          entityType: SeoEntityType.CATEGORY,
          entityId,
        },
      },
      create: {
        entityType: SeoEntityType.CATEGORY,
        entityId,
        ...seoData,
      },
      update: seoData,
    });
  }

  private buildSeoData(seoDto: SeoMetadataDto) {
    const data: SeoData = {};

    if (seoDto.metaTitle !== undefined) {
      data.metaTitle = this.nullableTrim(seoDto.metaTitle);
    }

    if (seoDto.metaDescription !== undefined) {
      data.metaDescription = this.nullableTrim(seoDto.metaDescription);
    }

    if (seoDto.canonicalUrl !== undefined) {
      data.canonicalUrl = this.nullableTrim(seoDto.canonicalUrl);
    }

    if (seoDto.ogTitle !== undefined) {
      data.ogTitle = this.nullableTrim(seoDto.ogTitle);
    }

    if (seoDto.ogDescription !== undefined) {
      data.ogDescription = this.nullableTrim(seoDto.ogDescription);
    }

    if (seoDto.ogImageMediaId !== undefined) {
      data.ogImageMediaId = seoDto.ogImageMediaId || null;
    }

    if (seoDto.twitterTitle !== undefined) {
      data.twitterTitle = this.nullableTrim(seoDto.twitterTitle);
    }

    if (seoDto.twitterDescription !== undefined) {
      data.twitterDescription = this.nullableTrim(seoDto.twitterDescription);
    }

    if (seoDto.schemaType !== undefined) {
      data.schemaType = this.nullableTrim(seoDto.schemaType);
    }

    if (seoDto.schemaJson !== undefined) {
      data.schemaJson = seoDto.schemaJson as Prisma.InputJsonValue;
    }

    if (seoDto.breadcrumbJson !== undefined) {
      data.breadcrumbJson = seoDto.breadcrumbJson as Prisma.InputJsonValue;
    }

    if (seoDto.noIndex !== undefined) {
      data.noIndex = seoDto.noIndex;
    }

    if (seoDto.noFollow !== undefined) {
      data.noFollow = seoDto.noFollow;
    }

    return data;
  }

  private categoryInclude() {
    return {
      parent: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      imageMedia: {
        select: {
          id: true,
          url: true,
          secureUrl: true,
          altText: true,
        },
      },
      _count: {
        select: {
          children: true,
          products: true,
        },
      },
    } as const;
  }

  private nullableTrim(value?: string | null) {
    return value?.trim() || null;
  }

  private toCategory(category: CategoryWithRelations, seo?: unknown) {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      parentId: category.parentId,
      parent: category.parent,
      imageMediaId: category.imageMediaId,
      imageMedia: category.imageMedia,
      sortOrder: category.sortOrder,
      status: category.status,
      childrenCount: category._count.children,
      productsCount: category._count.products,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      seo,
    };
  }
}
