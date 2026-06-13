import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContentStatus,
  Prisma,
  ProductStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateHomepageItemDto } from './dto/create-homepage-item.dto';
import { CreateHomepageSectionDto } from './dto/create-homepage-section.dto';
import { ListHomepageSectionsQueryDto } from './dto/list-homepage-sections-query.dto';
import { UpdateHomepageItemDto } from './dto/update-homepage-item.dto';
import { UpdateHomepageSectionDto } from './dto/update-homepage-section.dto';

@Injectable()
export class HomepageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async listPublic() {
    const sections = await this.prisma.homepageSection.findMany({
      where: { status: ContentStatus.PUBLISHED },
      include: this.sectionInclude(true),
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return { data: sections };
  }

  async listAdmin(query: ListHomepageSectionsQueryDto) {
    const sections = await this.prisma.homepageSection.findMany({
      where: {
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: this.sectionInclude(false),
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });

    return { data: sections };
  }

  async createSection(createDto: CreateHomepageSectionDto) {
    await this.assertMediaExists(createDto.imageMediaId);
    await this.assertItemsValid(createDto.items);

    const section = await this.prisma.$transaction(async (tx) => {
      const created = await tx.homepageSection.create({
        data: {
          type: createDto.type,
          title: this.nullableTrim(createDto.title),
          subtitle: this.nullableTrim(createDto.subtitle),
          content: this.nullableTrim(createDto.content),
          imageMediaId: createDto.imageMediaId ?? null,
          ctaLabel: this.nullableTrim(createDto.ctaLabel),
          ctaUrl: this.nullableTrim(createDto.ctaUrl),
          status: createDto.status ?? ContentStatus.PUBLISHED,
          sortOrder: createDto.sortOrder ?? 0,
          metadata: this.resolveJson(createDto.metadata),
        },
      });

      await this.createItems(tx, created.id, createDto.items);

      return created;
    });

    const result = await this.getSectionById(section.id);
    this.triggerStorefrontRevalidation().catch(() => {});
    return result;
  }

  async getSectionById(id: string) {
    const section = await this.prisma.homepageSection.findUnique({
      where: { id },
      include: this.sectionInclude(false),
    });

    if (!section) {
      throw new NotFoundException('Homepage section not found');
    }

    return section;
  }

  async updateSection(id: string, updateDto: UpdateHomepageSectionDto) {
    await this.getSectionById(id);
    await this.assertMediaExists(updateDto.imageMediaId);
    await this.assertItemsValid(updateDto.items);
    const data = this.buildSectionUpdateData(updateDto);

    if (!Object.keys(data).length && updateDto.items === undefined) {
      throw new BadRequestException('No update data provided');
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.homepageSection.update({ where: { id }, data });
      }

      if (updateDto.items !== undefined) {
        await tx.homepageItem.deleteMany({ where: { sectionId: id } });
        await this.createItems(tx, id, updateDto.items);
      }
    });

    const result = await this.getSectionById(id);
    this.triggerStorefrontRevalidation().catch(() => {});
    return result;
  }

  async removeSection(id: string) {
    await this.getSectionById(id);
    await this.prisma.homepageSection.delete({ where: { id } });

    this.triggerStorefrontRevalidation().catch(() => {});
    return { success: true };
  }

  async createItem(sectionId: string, createDto: CreateHomepageItemDto) {
    await this.getSectionById(sectionId);
    await this.assertItemsValid([createDto]);

    await this.prisma.homepageItem.create({
      data: this.buildItemCreateData(sectionId, createDto),
    });

    const result = await this.getSectionById(sectionId);
    this.triggerStorefrontRevalidation().catch(() => {});
    return result;
  }

  async updateItem(id: string, updateDto: UpdateHomepageItemDto) {
    const item = await this.getItemOrThrow(id);
    await this.assertItemsValid([updateDto]);
    const data = this.buildItemUpdateData(updateDto);

    if (!Object.keys(data).length) {
      throw new BadRequestException('No update data provided');
    }

    await this.prisma.homepageItem.update({ where: { id }, data });

    const result = await this.getSectionById(item.sectionId);
    this.triggerStorefrontRevalidation().catch(() => {});
    return result;
  }

  async removeItem(id: string) {
    const item = await this.getItemOrThrow(id);
    await this.prisma.homepageItem.delete({ where: { id } });

    const result = await this.getSectionById(item.sectionId);
    this.triggerStorefrontRevalidation().catch(() => {});
    return result;
  }

  private buildSectionUpdateData(updateDto: UpdateHomepageSectionDto) {
    const data: Prisma.HomepageSectionUncheckedUpdateInput = {};

    if (updateDto.type !== undefined) data.type = updateDto.type;
    if (updateDto.title !== undefined) data.title = this.nullableTrim(updateDto.title);
    if (updateDto.subtitle !== undefined) data.subtitle = this.nullableTrim(updateDto.subtitle);
    if (updateDto.content !== undefined) data.content = this.nullableTrim(updateDto.content);
    if (updateDto.imageMediaId !== undefined) data.imageMediaId = updateDto.imageMediaId || null;
    if (updateDto.ctaLabel !== undefined) data.ctaLabel = this.nullableTrim(updateDto.ctaLabel);
    if (updateDto.ctaUrl !== undefined) data.ctaUrl = this.nullableTrim(updateDto.ctaUrl);
    if (updateDto.status !== undefined) data.status = updateDto.status;
    if (updateDto.sortOrder !== undefined) data.sortOrder = updateDto.sortOrder;
    if (updateDto.metadata !== undefined) data.metadata = this.resolveJson(updateDto.metadata);

    return data;
  }

  private async createItems(
    tx: Prisma.TransactionClient,
    sectionId: string,
    items?: CreateHomepageItemDto[],
  ) {
    if (!items?.length) return;

    await tx.homepageItem.createMany({
      data: items.map((item, index) => ({
        ...this.buildItemCreateData(sectionId, item),
        sortOrder: item.sortOrder ?? index,
      })),
    });
  }

  private buildItemCreateData(sectionId: string, item: CreateHomepageItemDto) {
    return {
      sectionId,
      productId: item.productId ?? null,
      imageMediaId: item.imageMediaId ?? null,
      title: this.nullableTrim(item.title),
      subtitle: this.nullableTrim(item.subtitle),
      content: this.nullableTrim(item.content),
      linkUrl: this.nullableTrim(item.linkUrl),
      sortOrder: item.sortOrder ?? 0,
      metadata: this.resolveJson(item.metadata),
    };
  }

  private buildItemUpdateData(item: UpdateHomepageItemDto) {
    const data: Prisma.HomepageItemUncheckedUpdateInput = {};

    if (item.productId !== undefined) data.productId = item.productId || null;
    if (item.imageMediaId !== undefined) data.imageMediaId = item.imageMediaId || null;
    if (item.title !== undefined) data.title = this.nullableTrim(item.title);
    if (item.subtitle !== undefined) data.subtitle = this.nullableTrim(item.subtitle);
    if (item.content !== undefined) data.content = this.nullableTrim(item.content);
    if (item.linkUrl !== undefined) data.linkUrl = this.nullableTrim(item.linkUrl);
    if (item.sortOrder !== undefined) data.sortOrder = item.sortOrder;
    if (item.metadata !== undefined) data.metadata = this.resolveJson(item.metadata);

    return data;
  }

  private async assertItemsValid(items?: Array<CreateHomepageItemDto | UpdateHomepageItemDto>) {
    if (!items?.length) return;

    await this.assertMediaIdsExist(
      items.map((item) => item.imageMediaId).filter(Boolean) as string[],
    );
    await this.assertProductIdsExist(
      items.map((item) => item.productId).filter(Boolean) as string[],
    );
  }

  private async assertMediaExists(mediaId?: string | null) {
    if (!mediaId) return;
    await this.assertMediaIdsExist([mediaId]);
  }

  private async assertMediaIdsExist(mediaIds: string[]) {
    const ids = [...new Set(mediaIds)];
    if (!ids.length) return;

    const media = await this.prisma.media.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    const existing = new Set(media.map((item) => item.id));
    const missing = ids.filter((id) => !existing.has(id));

    if (missing.length) {
      throw new BadRequestException({
        message: 'Some media ids do not exist',
        details: { missing },
      });
    }
  }

  private async assertProductIdsExist(productIds: string[]) {
    const ids = [...new Set(productIds)];
    if (!ids.length) return;

    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    const existing = new Set(products.map((item) => item.id));
    const missing = ids.filter((id) => !existing.has(id));

    if (missing.length) {
      throw new BadRequestException({
        message: 'Some product ids do not exist',
        details: { missing },
      });
    }
  }

  private async getItemOrThrow(id: string) {
    const item = await this.prisma.homepageItem.findUnique({ where: { id } });

    if (!item) {
      throw new NotFoundException('Homepage item not found');
    }

    return item;
  }

  private sectionInclude(publicOnly: boolean): Prisma.HomepageSectionInclude {
    return {
      imageMedia: {
        select: {
          id: true,
          url: true,
          secureUrl: true,
          altText: true,
          title: true,
        },
      },
      items: {
        where: publicOnly
          ? {
              OR: [
                { productId: null },
                {
                  product: {
                    deletedAt: null,
                    status: ProductStatus.PUBLISHED,
                  },
                },
              ],
            }
          : undefined,
        include: {
          imageMedia: {
            select: {
              id: true,
              url: true,
              secureUrl: true,
              altText: true,
              title: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              originalPrice: true,
              salePrice: true,
              thumbnailMedia: {
                select: {
                  id: true,
                  url: true,
                  secureUrl: true,
                  altText: true,
                },
              },
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    };
  }

  private resolveJson(value?: Record<string, unknown>) {
    return value as Prisma.InputJsonValue | undefined;
  }

  private nullableTrim(value?: string | null) {
    return value?.trim() || null;
  }

  private async triggerStorefrontRevalidation() {
    const revalidateUrl = this.configService.get<string>('STOREFRONT_REVALIDATE_URL');
    const secret = this.configService.get<string>('REVALIDATION_SECRET');

    if (!revalidateUrl || !secret) {
      return;
    }

    try {
      const res = await fetch(revalidateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secret}`,
        },
        body: JSON.stringify({ path: '/' }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`Storefront revalidation failed: ${res.status} ${text}`);
      } else {
        console.log('Storefront revalidation triggered successfully');
      }
    } catch (err: any) {
      console.error('Failed to trigger storefront revalidation:', err.message);
    }
  }
}
