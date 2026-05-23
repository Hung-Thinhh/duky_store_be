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
  TagType,
} from '../../../generated/prisma/client';
import { slugify } from '../../common/utils/slug.util';
import { PrismaService } from '../../database/prisma.service';
import { SeoMetadataDto } from '../categories/dto/seo-metadata.dto';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import {
  BlogPostSort,
  ListBlogPostsQueryDto,
} from './dto/list-blog-posts-query.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

type SeoData = Omit<
  Prisma.SeoMetadataUncheckedCreateInput,
  'id' | 'entityType' | 'entityId' | 'createdAt' | 'updatedAt'
>;

@Injectable()
export class BlogPostsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin(query: ListBlogPostsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query, false);
    const [total, posts] = await this.prisma.$transaction([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({
        where,
        include: this.postInclude(),
        orderBy: this.getOrderBy(query.sort),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: posts.map((post) => this.toPost(post)),
      pagination: this.toPagination(page, limit, total),
    };
  }

  async listPublic(query: ListBlogPostsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query, true);
    const [total, posts] = await this.prisma.$transaction([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({
        where,
        include: this.postInclude(),
        orderBy: this.getOrderBy(query.sort),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: posts.map((post) => this.toPost(post)),
      pagination: this.toPagination(page, limit, total),
    };
  }

  async create(createDto: CreateBlogPostDto, authorId: string) {
    const slug = await this.prepareSlug(createDto.title, createDto.slug);
    await this.assertMediaExists(createDto.coverMediaId);
    await this.assertMediaExists(createDto.seo?.ogImageMediaId);
    const categoryIds = await this.prepareCategoryIds(createDto.categoryIds);
    const tagIds = await this.prepareTagIds(createDto.tagIds);

    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.blogPost.create({
        data: {
          title: createDto.title.trim(),
          slug,
          excerpt: this.nullableTrim(createDto.excerpt),
          content: createDto.content.trim(),
          coverMediaId: createDto.coverMediaId ?? null,
          status: createDto.status ?? ContentStatus.DRAFT,
          authorId,
          publishedAt: this.getPublishedAt(createDto.status),
        },
      });

      await this.replaceRelations(tx, created.id, categoryIds, tagIds);
      await this.upsertSeo(tx, created.id, createDto.seo);

      return created;
    });

    return this.getById(post.id);
  }

  async getById(id: string) {
    const post = await this.getPostOrThrow(id);
    const seo = await this.findSeo(id);

    return this.toPost(post, seo);
  }

  async getPublicBySlug(slug: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: {
        slug,
        deletedAt: null,
        status: ContentStatus.PUBLISHED,
      },
      include: this.postInclude(),
    });

    if (!post) {
      throw new NotFoundException('Blog post not found');
    }

    const seo = await this.findSeo(post.id);

    return this.toPost(post, seo);
  }

  async update(id: string, updateDto: UpdateBlogPostDto) {
    const existing = await this.getPostOrThrow(id);
    await this.assertMediaExists(updateDto.coverMediaId);
    await this.assertMediaExists(updateDto.seo?.ogImageMediaId);
    const categoryIds =
      updateDto.categoryIds === undefined
        ? undefined
        : await this.prepareCategoryIds(updateDto.categoryIds);
    const tagIds =
      updateDto.tagIds === undefined
        ? undefined
        : await this.prepareTagIds(updateDto.tagIds);
    const data = await this.buildUpdateData(
      id,
      existing.status,
      updateDto,
    );

    if (
      !Object.keys(data).length &&
      categoryIds === undefined &&
      tagIds === undefined &&
      !updateDto.seo
    ) {
      throw new BadRequestException('No update data provided');
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.blogPost.update({ where: { id }, data });
      }

      await this.replaceRelations(tx, id, categoryIds, tagIds);
      await this.upsertSeo(tx, id, updateDto.seo);
    });

    return this.getById(id);
  }

  async remove(id: string) {
    await this.getPostOrThrow(id);
    await this.prisma.blogPost.update({
      where: { id },
      data: { deletedAt: new Date(), status: ContentStatus.HIDDEN },
    });

    return { success: true };
  }

  private buildWhere(
    query: ListBlogPostsQueryDto,
    publicOnly: boolean,
  ): Prisma.BlogPostWhereInput {
    const where: Prisma.BlogPostWhereInput = {
      deletedAt: null,
      ...(publicOnly ? { status: ContentStatus.PUBLISHED } : {}),
    };
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { excerpt: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.status && !publicOnly) {
      where.status = query.status;
    }

    if (query.categorySlug?.trim()) {
      where.categories = {
        some: {
          category: {
            slug: query.categorySlug.trim(),
            deletedAt: null,
            ...(publicOnly ? { status: ContentStatus.PUBLISHED } : {}),
          },
        },
      };
    }

    if (query.tagSlug?.trim()) {
      where.tags = {
        some: {
          tag: {
            slug: query.tagSlug.trim(),
            deletedAt: null,
            type: { in: [TagType.BLOG, TagType.BOTH] },
          },
        },
      };
    }

    return where;
  }

  private async buildUpdateData(
    id: string,
    currentStatus: ContentStatus,
    updateDto: UpdateBlogPostDto,
  ) {
    const data: Prisma.BlogPostUncheckedUpdateInput = {};

    if (updateDto.title !== undefined) data.title = updateDto.title.trim();
    if (updateDto.slug !== undefined) {
      data.slug = await this.prepareSlug(
        updateDto.title ?? '',
        updateDto.slug,
        id,
      );
    }
    if (updateDto.excerpt !== undefined) data.excerpt = this.nullableTrim(updateDto.excerpt);
    if (updateDto.content !== undefined) data.content = updateDto.content.trim();
    if (updateDto.coverMediaId !== undefined) data.coverMediaId = updateDto.coverMediaId || null;
    if (updateDto.status !== undefined) {
      data.status = updateDto.status;
      data.publishedAt = this.resolvePublishedAt(currentStatus, updateDto.status);
    }

    return data;
  }

  private async replaceRelations(
    tx: Prisma.TransactionClient,
    postId: string,
    categoryIds?: string[],
    tagIds?: string[],
  ) {
    if (categoryIds !== undefined) {
      await tx.blogPostCategory.deleteMany({ where: { postId } });

      if (categoryIds.length) {
        await tx.blogPostCategory.createMany({
          data: categoryIds.map((categoryId) => ({ postId, categoryId })),
          skipDuplicates: true,
        });
      }
    }

    if (tagIds !== undefined) {
      await tx.blogPostTag.deleteMany({ where: { postId } });

      if (tagIds.length) {
        await tx.blogPostTag.createMany({
          data: tagIds.map((tagId) => ({ postId, tagId })),
          skipDuplicates: true,
        });
      }
    }
  }

  private async prepareCategoryIds(categoryIds?: string[]) {
    const ids = this.uniqueIds(categoryIds);

    if (!ids.length) return [];

    const categories = await this.prisma.blogCategory.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });

    this.assertAllIdsExist(ids, categories.map((category) => category.id), 'blog category');

    return ids;
  }

  private async prepareTagIds(tagIds?: string[]) {
    const ids = this.uniqueIds(tagIds);

    if (!ids.length) return [];

    const tags = await this.prisma.tag.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        type: { in: [TagType.BLOG, TagType.BOTH] },
      },
      select: { id: true },
    });

    this.assertAllIdsExist(ids, tags.map((tag) => tag.id), 'blog tag');

    return ids;
  }

  private assertAllIdsExist(ids: string[], existingIds: string[], label: string) {
    const existingIdSet = new Set(existingIds);
    const missingIds = ids.filter((id) => !existingIdSet.has(id));

    if (missingIds.length) {
      throw new BadRequestException({
        message: `Some ${label} ids do not exist`,
        details: { missingIds },
      });
    }
  }

  private async prepareSlug(title: string, slug?: string, id?: string) {
    const normalizedSlug = slugify(slug?.trim() || title);

    if (!normalizedSlug) {
      throw new BadRequestException('Slug is required');
    }

    const existing = await this.prisma.blogPost.findFirst({
      where: {
        slug: normalizedSlug,
        ...(id ? { NOT: { id } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Blog post slug is already used');
    }

    return normalizedSlug;
  }

  private async assertMediaExists(mediaId?: string | null) {
    if (!mediaId) return;

    const media = await this.prisma.media.findFirst({
      where: { id: mediaId, deletedAt: null },
      select: { id: true },
    });

    if (!media) {
      throw new BadRequestException('Media does not exist');
    }
  }

  private async assertMediaIdsExist(mediaIds: string[]) {
    const ids = this.uniqueIds(mediaIds);
    if (!ids.length) return;

    const media = await this.prisma.media.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });

    this.assertAllIdsExist(ids, media.map((item) => item.id), 'media');
  }

  private async getPostOrThrow(id: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { id, deletedAt: null },
      include: this.postInclude(),
    });

    if (!post) {
      throw new NotFoundException('Blog post not found');
    }

    return post;
  }

  private async findSeo(entityId: string) {
    return this.prisma.seoMetadata.findUnique({
      where: {
        entityType_entityId: {
          entityType: SeoEntityType.BLOG_POST,
          entityId,
        },
      },
    });
  }

  private async upsertSeo(
    tx: Prisma.TransactionClient,
    entityId: string,
    seoDto?: SeoMetadataDto,
  ) {
    if (!seoDto) return;
    const seoData = this.buildSeoData(seoDto);
    if (!Object.keys(seoData).length) return;

    await tx.seoMetadata.upsert({
      where: {
        entityType_entityId: {
          entityType: SeoEntityType.BLOG_POST,
          entityId,
        },
      },
      create: { entityType: SeoEntityType.BLOG_POST, entityId, ...seoData },
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
    if (seoDto.focusKeyword !== undefined) data.focusKeyword = this.nullableTrim(seoDto.focusKeyword);
    if (seoDto.seoScore !== undefined) data.seoScore = seoDto.seoScore ?? null;
    if (seoDto.analysisJson !== undefined) data.analysisJson = seoDto.analysisJson as Prisma.InputJsonValue;
    if (seoDto.schemaType !== undefined) data.schemaType = this.nullableTrim(seoDto.schemaType);
    if (seoDto.schemaJson !== undefined) data.schemaJson = seoDto.schemaJson as Prisma.InputJsonValue;
    if (seoDto.breadcrumbJson !== undefined) data.breadcrumbJson = seoDto.breadcrumbJson as Prisma.InputJsonValue;
    if (seoDto.noIndex !== undefined) data.noIndex = seoDto.noIndex;
    if (seoDto.noFollow !== undefined) data.noFollow = seoDto.noFollow;

    return data;
  }

  private getPublishedAt(status?: ContentStatus) {
    return status === ContentStatus.PUBLISHED ? new Date() : null;
  }

  private resolvePublishedAt(
    currentStatus: ContentStatus,
    nextStatus: ContentStatus,
  ) {
    if (
      currentStatus !== ContentStatus.PUBLISHED &&
      nextStatus === ContentStatus.PUBLISHED
    ) {
      return new Date();
    }

    if (nextStatus !== ContentStatus.PUBLISHED) {
      return null;
    }

    return undefined;
  }

  private getOrderBy(sort?: BlogPostSort): Prisma.BlogPostOrderByWithRelationInput[] {
    if (sort === BlogPostSort.OLDEST) {
      return [{ publishedAt: 'asc' }, { createdAt: 'asc' }];
    }

    return [{ publishedAt: 'desc' }, { createdAt: 'desc' }];
  }

  private postInclude(): Prisma.BlogPostInclude {
    return {
      coverMedia: {
        select: {
          id: true,
          url: true,
          secureUrl: true,
          fileName: true,
          altText: true,
          title: true,
        },
      },
      author: { select: { id: true, fullName: true, email: true } },
      categories: {
        include: {
          category: { select: { id: true, name: true, slug: true, status: true } },
        },
      },
      tags: {
        include: {
          tag: { select: { id: true, name: true, slug: true, type: true } },
        },
      },
    };
  }

  private uniqueIds(ids?: string[]) {
    return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
  }

  private nullableTrim(value?: string | null) {
    return value?.trim() || null;
  }

  private toPagination(page: number, limit: number, total: number) {
    return { page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  private toPost(post: any, seo?: unknown) {
    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      coverMediaId: post.coverMediaId,
      coverMedia: post.coverMedia,
      status: post.status,
      authorId: post.authorId,
      author: post.author,
      publishedAt: post.publishedAt,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      categories: post.categories.map((item: any) => item.category),
      tags: post.tags.map((item: any) => item.tag),
      seo,
    };
  }
}
