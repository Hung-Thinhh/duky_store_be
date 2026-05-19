import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CategoryStatus,
  InventoryChangeType,
  Prisma,
  ProductCatalogVisibility,
  ProductRelationType,
  ProductStatus,
  ProductType,
  SeoEntityType,
  TagType,
} from '../../../generated/prisma/client';
import { slugify } from '../../common/utils/slug.util';
import { PrismaService } from '../../database/prisma.service';
import { SeoMetadataDto } from '../categories/dto/seo-metadata.dto';
import { UpsertInventoryDto } from '../inventory/dto/upsert-inventory.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ListAdminProductsQueryDto } from './dto/list-admin-products-query.dto';
import {
  ListProductsQueryDto,
  ProductSort,
} from './dto/list-products-query.dto';
import { ProductImageDto } from './dto/product-image.dto';
import { ProductRelationsDto } from './dto/product-relations.dto';
import { ProductShippingProfileDto } from './dto/product-shipping-profile.dto';
import { UpdateProductDto } from './dto/update-product.dto';

type ProductMedia = {
  id: string;
  url: string;
  secureUrl: string | null;
  fileName: string;
  altText: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
};

type ProductWithRelations = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  type: ProductType;
  status: ProductStatus;
  catalogVisibility: ProductCatalogVisibility;
  originalPrice: number;
  salePrice: number | null;
  contactForPrice: boolean;
  shortDescription: string | null;
  description: string | null;
  additionalInfo: unknown;
  sizeGuide: unknown;
  externalUrl: string | null;
  externalButtonText: string | null;
  thumbnailMediaId: string | null;
  thumbnailMedia: ProductMedia | null;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  soldIndividually: boolean;
  purchaseNote: string | null;
  menuOrder: number;
  enableReviews: boolean;
  viewCount: number;
  soldCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  categories: Array<{
    category: {
      id: string;
      name: string;
      slug: string;
      status: CategoryStatus;
    };
  }>;
  tags: Array<{
    tag: {
      id: string;
      name: string;
      slug: string;
      type: TagType;
    };
  }>;
  brands: Array<{
    brand: {
      id: string;
      name: string;
      slug: string;
      logoMediaId: string | null;
    };
  }>;
  images: Array<{
    id: string;
    mediaId: string;
    altText: string | null;
    sortOrder: number;
    isPrimary: boolean;
    media: ProductMedia;
  }>;
  shippingProfile: {
    id: string;
    weight: number | null;
    length: number | null;
    width: number | null;
    height: number | null;
    shippingClass: string | null;
  } | null;
  inventory: {
    id: string;
    quantity: number;
    reservedQuantity: number;
    lowStockThreshold: number;
    soldOut: boolean;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  relatedProducts: Array<{
    relatedProductId: string;
    relationType: ProductRelationType;
    sortOrder: number;
    relatedProduct: {
      id: string;
      name: string;
      slug: string;
      sku: string | null;
    };
  }>;
  _count: {
    variants: number;
    reviews: number;
  };
};

type ProductListItem = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  type: ProductType;
  status: ProductStatus;
  catalogVisibility: ProductCatalogVisibility;
  originalPrice: number;
  salePrice: number | null;
  contactForPrice: boolean;
  thumbnailMediaId: string | null;
  thumbnailMedia: ProductMedia | null;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  images: Array<{
    id: string;
    mediaId: string;
    altText: string | null;
    sortOrder: number;
    isPrimary: boolean;
    media: ProductMedia;
  }>;
  inventory?: {
    id: string;
    quantity: number;
    reservedQuantity: number;
    lowStockThreshold: number;
    soldOut: boolean;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  variants?: Array<{
    id: string;
    productId: string;
    name: string | null;
    sku: string;
    sizeLabel: string | null;
    sizeGender: string | null;
    colorName: string | null;
    colorHex: string | null;
    price: number | null;
    salePrice: number | null;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    inventory: {
      id: string;
      quantity: number;
      reservedQuantity: number;
      lowStockThreshold: number;
      soldOut: boolean;
      createdAt: Date;
      updatedAt: Date;
    } | null;
  }>;
};

type ProductStockSummary = {
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  lowStockThreshold: number;
  soldOut: boolean;
  isLowStock: boolean;
};

type AdminProductSummary = {
  variantsCount: number;
  stockSummary: ProductStockSummary | null;
};

type AdminProductListRow = Omit<ProductListItem, 'images' | 'variants'> & {
  image: ProductListItem['images'][number] | null;
  totalCount: number;
  variantsCount: number;
  inventoryCount: number;
  quantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  soldOut: boolean;
  isLowStock: boolean;
};

type PublicProductVariant = {
  id: string;
  productId: string;
  name: string | null;
  sku: string;
  sizeLabel: string | null;
  sizeGender: string | null;
  colorName: string | null;
  colorHex: string | null;
  price: number | null;
  salePrice: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  inventory: {
    id: string;
    quantity: number;
    reservedQuantity: number;
    lowStockThreshold: number;
    soldOut: boolean;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

type SeoData = Omit<
  Prisma.SeoMetadataUncheckedCreateInput,
  'id' | 'entityType' | 'entityId' | 'createdAt' | 'updatedAt'
>;

type PreparedProductRelations = {
  relatedProductIds: string[];
  upsellIds: string[];
  crossSellIds: string[];
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin(query: ListAdminProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const rows = await this.findAdminProductListRows(query, page, limit);
    const total =
      rows[0]?.totalCount ??
      (page > 1
        ? await this.prisma.product.count({
            where: this.buildAdminWhere(query),
          })
        : 0);

    return {
      data: rows.map((row) =>
        this.toProductListItem(
          this.toProductListItemInput(row),
          this.toAdminProductSummary(row),
        ),
      ),
      pagination: this.toPagination(page, limit, total),
    };
  }

  async listPublic(query: ListProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildPublicWhere(query);

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        select: this.productListSelect(),
        orderBy: this.getPublicOrderBy(query.sort),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: products.map((product) =>
        this.toProductListItem(product as unknown as ProductListItem),
      ),
      pagination: this.toPagination(page, limit, total),
    };
  }

  async create(createDto: CreateProductDto, userId: string) {
    this.assertValidPrice(createDto.originalPrice, createDto.salePrice);
    const slug = await this.prepareSlug(createDto.name, createDto.slug);
    const sku = await this.prepareSku(createDto.sku);
    await this.assertMediaExists(createDto.thumbnailMediaId);
    await this.assertMediaExists(createDto.seo?.ogImageMediaId);
    const categoryIds = await this.prepareCategoryIds(createDto.categoryIds);
    const tagIds = await this.prepareTagIds(createDto.tagIds);
    const brandIds = await this.prepareBrandIds(createDto.brandIds);
    const relations = await this.prepareRelations(createDto.relations);
    const images = await this.prepareImages(createDto.images);

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: createDto.name.trim(),
          slug,
          sku,
          type: createDto.type ?? ProductType.SIMPLE,
          status: createDto.status ?? ProductStatus.DRAFT,
          catalogVisibility:
            createDto.catalogVisibility ?? ProductCatalogVisibility.VISIBLE,
          originalPrice: createDto.originalPrice,
          salePrice: createDto.salePrice ?? null,
          contactForPrice: createDto.contactForPrice ?? false,
          shortDescription: this.nullableTrim(createDto.shortDescription),
          description: this.nullableTrim(createDto.description),
          additionalInfo: this.resolveJson(createDto.additionalInfo),
          sizeGuide: this.resolveJson(createDto.sizeGuide),
          externalUrl: this.nullableTrim(createDto.externalUrl),
          externalButtonText: this.nullableTrim(createDto.externalButtonText),
          thumbnailMediaId: createDto.thumbnailMediaId ?? null,
          isFeatured: createDto.isFeatured ?? false,
          isBestSeller: createDto.isBestSeller ?? false,
          isNewArrival: createDto.isNewArrival ?? false,
          soldIndividually: createDto.soldIndividually ?? false,
          purchaseNote: this.nullableTrim(createDto.purchaseNote),
          menuOrder: createDto.menuOrder ?? 0,
          enableReviews: createDto.enableReviews ?? true,
          publishedAt: this.getPublishedAt(createDto.status),
          createdById: userId,
          updatedById: userId,
        },
      });

      await this.replaceRelations(
        tx,
        created.id,
        categoryIds,
        tagIds,
        brandIds,
        images,
        relations,
      );
      await this.upsertShipping(tx, created.id, createDto.shipping);
      await this.upsertProductInventory(tx, created.id, createDto.inventory, userId);
      await this.upsertSeo(tx, created.id, createDto.seo);

      return created;
    });

    return this.getById(product.id);
  }

  async getById(id: string) {
    const product = await this.getProductOrThrow(id);
    const seo = await this.findSeo(product.id);

    return this.toProduct(product as unknown as ProductWithRelations, seo);
  }

  async getPublicBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        slug,
        deletedAt: null,
        status: ProductStatus.PUBLISHED,
      },
      include: this.productInclude(),
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const seo = await this.findSeo(product.id);

    return this.toProduct(product as unknown as ProductWithRelations, seo);
  }

  async listPublicVariantsBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        slug,
        deletedAt: null,
        status: ProductStatus.PUBLISHED,
      },
      select: {
        id: true,
        variants: {
          where: {
            deletedAt: null,
            isActive: true,
          },
          select: {
            id: true,
            productId: true,
            name: true,
            sku: true,
            sizeLabel: true,
            sizeGender: true,
            colorName: true,
            colorHex: true,
            price: true,
            salePrice: true,
            isActive: true,
            sortOrder: true,
            createdAt: true,
            updatedAt: true,
            inventory: {
              select: this.inventoryListSelect(),
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return {
      data: product.variants.map((variant) =>
        this.toPublicProductVariant(variant as PublicProductVariant),
      ),
    };
  }

  async update(id: string, updateDto: UpdateProductDto, userId: string) {
    const existing = await this.getProductOrThrow(id);
    await this.assertMediaExists(updateDto.thumbnailMediaId);
    await this.assertMediaExists(updateDto.seo?.ogImageMediaId);

    if (
      updateDto.originalPrice !== undefined ||
      updateDto.salePrice !== undefined
    ) {
      this.assertValidPrice(
        updateDto.originalPrice ?? existing.originalPrice,
        updateDto.salePrice === undefined
          ? existing.salePrice
          : updateDto.salePrice,
      );
    }

    const categoryIds =
      updateDto.categoryIds === undefined
        ? undefined
        : await this.prepareCategoryIds(updateDto.categoryIds);
    const tagIds =
      updateDto.tagIds === undefined
        ? undefined
        : await this.prepareTagIds(updateDto.tagIds);
    const brandIds =
      updateDto.brandIds === undefined
        ? undefined
        : await this.prepareBrandIds(updateDto.brandIds);
    const relations =
      updateDto.relations === undefined
        ? undefined
        : await this.prepareRelations(updateDto.relations);
    const images =
      updateDto.images === undefined
        ? undefined
        : await this.prepareImages(updateDto.images);
    const data = await this.buildUpdateData(
      id,
      existing.status,
      updateDto,
      userId,
    );

    if (
      !Object.keys(data).length &&
      categoryIds === undefined &&
      tagIds === undefined &&
      brandIds === undefined &&
      images === undefined &&
      relations === undefined &&
      updateDto.shipping === undefined &&
      updateDto.inventory === undefined &&
      !updateDto.seo
    ) {
      throw new BadRequestException('No update data provided');
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.product.update({
          where: { id },
          data,
        });
      }

      await this.replaceRelations(
        tx,
        id,
        categoryIds,
        tagIds,
        brandIds,
        images,
        relations,
      );
      await this.upsertShipping(tx, id, updateDto.shipping);
      await this.upsertProductInventory(tx, id, updateDto.inventory, userId);
      await this.upsertSeo(tx, id, updateDto.seo);
    });

    return this.getById(id);
  }

  async remove(id: string) {
    await this.getProductOrThrow(id);
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), status: ProductStatus.HIDDEN },
    });

    return { success: true };
  }

  private buildAdminWhere(
    query: ListAdminProductsQueryDto,
  ): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
    };
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.categoryId) {
      where.categories = { some: { categoryId: query.categoryId } };
    }

    if (query.tagId) {
      where.tags = { some: { tagId: query.tagId } };
    }

    return where;
  }

  private buildPublicWhere(
    query: ListProductsQueryDto,
  ): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      status: ProductStatus.PUBLISHED,
    };
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { shortDescription: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.categorySlug?.trim()) {
      where.categories = {
        some: {
          category: {
            slug: query.categorySlug.trim(),
            deletedAt: null,
            status: CategoryStatus.ACTIVE,
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
            type: { in: [TagType.PRODUCT, TagType.BOTH] },
          },
        },
      };
    }

    if (query.isFeatured !== undefined) {
      where.isFeatured = query.isFeatured;
    }

    if (query.isBestSeller !== undefined) {
      where.isBestSeller = query.isBestSeller;
    }

    if (query.isNewArrival !== undefined) {
      where.isNewArrival = query.isNewArrival;
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.originalPrice = {
        ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
      };
    }

    return where;
  }

  private getPublicOrderBy(
    sort?: ProductSort,
  ): Prisma.ProductOrderByWithRelationInput[] {
    if (sort === ProductSort.PRICE_ASC) {
      return [{ originalPrice: 'asc' }, { createdAt: 'desc' }];
    }

    if (sort === ProductSort.PRICE_DESC) {
      return [{ originalPrice: 'desc' }, { createdAt: 'desc' }];
    }

    return [{ publishedAt: 'desc' }, { createdAt: 'desc' }];
  }

  private async findAdminProductListRows(
    query: ListAdminProductsQueryDto,
    page: number,
    limit: number,
  ) {
    const filters: Prisma.Sql[] = [Prisma.sql`p."deletedAt" is null`];
    const search = query.search?.trim();

    if (search) {
      const pattern = `%${search}%`;
      filters.push(
        Prisma.sql`(
          p."name" ilike ${pattern}
          or p."slug" ilike ${pattern}
          or p."sku" ilike ${pattern}
        )`,
      );
    }

    if (query.status) {
      filters.push(Prisma.sql`p."status" = ${query.status}::"ProductStatus"`);
    }

    if (query.type) {
      filters.push(Prisma.sql`p."type" = ${query.type}::"ProductType"`);
    }

    if (query.categoryId) {
      filters.push(
        Prisma.sql`exists (
          select 1
          from "product_categories" pc
          where pc."productId" = p."id"
            and pc."categoryId" = ${query.categoryId}
        )`,
      );
    }

    if (query.tagId) {
      filters.push(
        Prisma.sql`exists (
          select 1
          from "product_tags" pt
          where pt."productId" = p."id"
            and pt."tagId" = ${query.tagId}
        )`,
      );
    }

    const offset = (page - 1) * limit;
    const whereSql = Prisma.join(filters, ' and ');

    return this.prisma.$queryRaw<AdminProductListRow[]>(
      Prisma.sql`
        select
          count(*) over()::int as "totalCount",
          p."id",
          p."name",
          p."slug",
          p."sku",
          p."type",
          p."status",
          p."catalogVisibility",
          p."originalPrice",
          p."salePrice",
          p."contactForPrice",
          p."thumbnailMediaId",
          case
            when tm."id" is null then null
            else json_build_object(
              'id', tm."id",
              'url', tm."url",
              'secureUrl', tm."secureUrl",
              'fileName', tm."fileName",
              'altText', tm."altText",
              'title', tm."title",
              'width', tm."width",
              'height', tm."height"
            )
          end as "thumbnailMedia",
          p."isFeatured",
          p."isBestSeller",
          p."isNewArrival",
          p."publishedAt",
          p."createdAt",
          p."updatedAt",
          img."image",
          case
            when inv."id" is null then null
            else json_build_object(
              'id', inv."id",
              'quantity', inv."quantity",
              'reservedQuantity', inv."reservedQuantity",
              'lowStockThreshold', inv."lowStockThreshold",
              'soldOut', inv."soldOut",
              'createdAt', inv."createdAt",
              'updatedAt', inv."updatedAt"
            )
          end as "inventory",
          coalesce(vs."variantsCount", 0)::int as "variantsCount",
          coalesce(vs."inventoryCount", 0)::int as "inventoryCount",
          coalesce(vs."quantity", 0)::int as "quantity",
          coalesce(vs."reservedQuantity", 0)::int as "reservedQuantity",
          coalesce(vs."lowStockThreshold", 0)::int as "lowStockThreshold",
          coalesce(vs."soldOut", false) as "soldOut",
          coalesce(vs."isLowStock", false) as "isLowStock"
        from "products" p
        left join "media" tm on tm."id" = p."thumbnailMediaId"
        left join "inventories" inv on inv."productId" = p."id"
        left join lateral (
          select json_build_object(
            'id', pi."id",
            'mediaId', pi."mediaId",
            'altText', pi."altText",
            'sortOrder', pi."sortOrder",
            'isPrimary', pi."isPrimary",
            'media', json_build_object(
              'id', pm."id",
              'url', pm."url",
              'secureUrl', pm."secureUrl",
              'fileName', pm."fileName",
              'altText', pm."altText",
              'title', pm."title",
              'width', pm."width",
              'height', pm."height"
            )
          ) as "image"
          from "product_images" pi
          join "media" pm on pm."id" = pi."mediaId"
          where pi."productId" = p."id"
          order by pi."isPrimary" desc, pi."sortOrder" asc, pi."createdAt" asc
          limit 1
        ) img on true
        left join lateral (
          select
            count(pv."id")::int as "variantsCount",
            count(vi."id")::int as "inventoryCount",
            coalesce(sum(vi."quantity"), 0)::int as "quantity",
            coalesce(sum(vi."reservedQuantity"), 0)::int as "reservedQuantity",
            coalesce(sum(vi."lowStockThreshold"), 0)::int as "lowStockThreshold",
            coalesce(bool_and(vi."soldOut"), false) as "soldOut",
            coalesce(bool_or(vi."quantity" <= vi."lowStockThreshold"), false) as "isLowStock"
          from "product_variants" pv
          left join "inventories" vi on vi."variantId" = pv."id"
          where pv."productId" = p."id"
            and pv."deletedAt" is null
        ) vs on true
        where ${whereSql}
        order by p."createdAt" desc
        offset ${offset}
        limit ${limit}
      `,
    );
  }

  private async buildUpdateData(
    id: string,
    currentStatus: ProductStatus,
    updateDto: UpdateProductDto,
    userId: string,
  ) {
    const data: Prisma.ProductUncheckedUpdateInput = {
      updatedById: userId,
    };

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

    if (updateDto.sku !== undefined) {
      data.sku = await this.prepareSku(updateDto.sku, id);
    }

    if (updateDto.type !== undefined) {
      data.type = updateDto.type;
    }

    if (updateDto.status !== undefined) {
      data.status = updateDto.status;
      data.publishedAt = this.resolvePublishedAt(
        currentStatus,
        updateDto.status,
      );
    }

    if (updateDto.catalogVisibility !== undefined) {
      data.catalogVisibility = updateDto.catalogVisibility;
    }

    if (updateDto.originalPrice !== undefined) {
      data.originalPrice = updateDto.originalPrice;
    }

    if (updateDto.salePrice !== undefined) {
      data.salePrice = updateDto.salePrice ?? null;
    }

    if (updateDto.contactForPrice !== undefined) {
      data.contactForPrice = updateDto.contactForPrice;
    }

    if (updateDto.shortDescription !== undefined) {
      data.shortDescription = this.nullableTrim(updateDto.shortDescription);
    }

    if (updateDto.description !== undefined) {
      data.description = this.nullableTrim(updateDto.description);
    }

    if (updateDto.additionalInfo !== undefined) {
      data.additionalInfo = this.resolveJson(updateDto.additionalInfo);
    }

    if (updateDto.sizeGuide !== undefined) {
      data.sizeGuide = this.resolveJson(updateDto.sizeGuide);
    }

    if (updateDto.externalUrl !== undefined) {
      data.externalUrl = this.nullableTrim(updateDto.externalUrl);
    }

    if (updateDto.externalButtonText !== undefined) {
      data.externalButtonText = this.nullableTrim(updateDto.externalButtonText);
    }

    if (updateDto.thumbnailMediaId !== undefined) {
      data.thumbnailMediaId = updateDto.thumbnailMediaId || null;
    }

    if (updateDto.isFeatured !== undefined) {
      data.isFeatured = updateDto.isFeatured;
    }

    if (updateDto.isBestSeller !== undefined) {
      data.isBestSeller = updateDto.isBestSeller;
    }

    if (updateDto.isNewArrival !== undefined) {
      data.isNewArrival = updateDto.isNewArrival;
    }

    if (updateDto.soldIndividually !== undefined) {
      data.soldIndividually = updateDto.soldIndividually;
    }

    if (updateDto.purchaseNote !== undefined) {
      data.purchaseNote = this.nullableTrim(updateDto.purchaseNote);
    }

    if (updateDto.menuOrder !== undefined) {
      data.menuOrder = updateDto.menuOrder;
    }

    if (updateDto.enableReviews !== undefined) {
      data.enableReviews = updateDto.enableReviews;
    }

    return data;
  }

  private async replaceRelations(
    tx: Prisma.TransactionClient,
    productId: string,
    categoryIds?: string[],
    tagIds?: string[],
    brandIds?: string[],
    images?: ProductImageDto[],
    relations?: PreparedProductRelations,
  ) {
    if (categoryIds !== undefined) {
      await tx.productCategory.deleteMany({ where: { productId } });

      if (categoryIds.length) {
        await tx.productCategory.createMany({
          data: categoryIds.map((categoryId, index) => ({
            productId,
            categoryId,
            sortOrder: index,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (tagIds !== undefined) {
      await tx.productTag.deleteMany({ where: { productId } });

      if (tagIds.length) {
        await tx.productTag.createMany({
          data: tagIds.map((tagId) => ({
            productId,
            tagId,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (brandIds !== undefined) {
      await tx.productBrand.deleteMany({ where: { productId } });

      if (brandIds.length) {
        await tx.productBrand.createMany({
          data: brandIds.map((brandId, index) => ({
            productId,
            brandId,
            sortOrder: index,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (images !== undefined) {
      await tx.productImage.deleteMany({ where: { productId } });

      if (images.length) {
        await tx.productImage.createMany({
          data: images.map((image, index) => ({
            productId,
            mediaId: image.mediaId,
            altText: this.nullableTrim(image.altText),
            sortOrder: image.sortOrder ?? index,
            isPrimary: image.isPrimary ?? index === 0,
          })),
        });
      }
    }

    if (relations !== undefined) {
      await tx.relatedProduct.deleteMany({ where: { productId } });

      const data = [
        ...relations.relatedProductIds.map((relatedProductId, index) => ({
          productId,
          relatedProductId,
          relationType: ProductRelationType.RELATED,
          sortOrder: index,
        })),
        ...relations.upsellIds.map((relatedProductId, index) => ({
          productId,
          relatedProductId,
          relationType: ProductRelationType.UPSELL,
          sortOrder: index,
        })),
        ...relations.crossSellIds.map((relatedProductId, index) => ({
          productId,
          relatedProductId,
          relationType: ProductRelationType.CROSS_SELL,
          sortOrder: index,
        })),
      ];

      if (data.length) {
        await tx.relatedProduct.createMany({ data, skipDuplicates: true });
      }
    }
  }

  private async prepareCategoryIds(categoryIds?: string[]) {
    const ids = this.uniqueIds(categoryIds);

    if (!ids.length) {
      return [];
    }

    const categories = await this.prisma.category.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
      select: { id: true },
    });

    this.assertAllIdsExist(
      ids,
      categories.map((category) => category.id),
      'category',
    );

    return ids;
  }

  private async prepareTagIds(tagIds?: string[]) {
    const ids = this.uniqueIds(tagIds);

    if (!ids.length) {
      return [];
    }

    const tags = await this.prisma.tag.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        type: { in: [TagType.PRODUCT, TagType.BOTH] },
      },
      select: { id: true },
    });

    this.assertAllIdsExist(
      ids,
      tags.map((tag) => tag.id),
      'tag',
    );

    return ids;
  }

  private async prepareBrandIds(brandIds?: string[]) {
    const ids = this.uniqueIds(brandIds);

    if (!ids.length) {
      return [];
    }

    const brands = await this.prisma.brand.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });

    this.assertAllIdsExist(
      ids,
      brands.map((brand) => brand.id),
      'brand',
    );

    return ids;
  }

  private async prepareRelations(
    relations?: ProductRelationsDto | null,
  ): Promise<PreparedProductRelations> {
    const prepared = {
      relatedProductIds: this.uniqueIds(relations?.relatedProductIds),
      upsellIds: this.uniqueIds(relations?.upsellIds),
      crossSellIds: this.uniqueIds(relations?.crossSellIds),
    };

    const ids = this.uniqueIds([
      ...prepared.relatedProductIds,
      ...prepared.upsellIds,
      ...prepared.crossSellIds,
    ]);

    if (!ids.length) {
      return prepared;
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
      select: { id: true },
    });

    this.assertAllIdsExist(
      ids,
      products.map((product) => product.id),
      'related product',
    );

    return prepared;
  }

  private async upsertShipping(
    tx: Prisma.TransactionClient,
    productId: string,
    shipping?: ProductShippingProfileDto | null,
  ) {
    if (shipping === undefined) {
      return;
    }

    if (!shipping) {
      await tx.productShippingProfile.deleteMany({ where: { productId } });
      return;
    }

    const data = {
      weight: shipping.weight ?? null,
      length: shipping.length ?? null,
      width: shipping.width ?? null,
      height: shipping.height ?? null,
      shippingClass: this.nullableTrim(shipping.shippingClass),
    };

    const hasData = Object.values(data).some((value) => value !== null);

    if (!hasData) {
      await tx.productShippingProfile.deleteMany({ where: { productId } });
      return;
    }

    await tx.productShippingProfile.upsert({
      where: { productId },
      create: {
        productId,
        ...data,
      },
      update: data,
    });
  }

  private async upsertProductInventory(
    tx: Prisma.TransactionClient,
    productId: string,
    inventoryDto: UpsertInventoryDto | null | undefined,
    actorId: string,
  ) {
    if (inventoryDto === undefined) {
      return;
    }

    if (!inventoryDto) {
      await tx.inventory.deleteMany({ where: { productId, variantId: null } });
      return;
    }

    const existing = await tx.inventory.findUnique({
      where: { productId },
    });
    const nextQuantity = inventoryDto.quantity ?? existing?.quantity ?? 0;

    const saved = existing
      ? await tx.inventory.update({
          where: { id: existing.id },
          data: {
            quantity: nextQuantity,
            reservedQuantity:
              inventoryDto.reservedQuantity ?? existing.reservedQuantity,
            lowStockThreshold:
              inventoryDto.lowStockThreshold ?? existing.lowStockThreshold,
            soldOut: inventoryDto.soldOut ?? nextQuantity <= 0,
          },
        })
      : await tx.inventory.create({
          data: {
            productId,
            variantId: null,
            quantity: nextQuantity,
            reservedQuantity: inventoryDto.reservedQuantity ?? 0,
            lowStockThreshold: inventoryDto.lowStockThreshold ?? 3,
            soldOut: inventoryDto.soldOut ?? nextQuantity <= 0,
          },
        });

    const previousQuantity = existing?.quantity ?? 0;
    const quantityChange = nextQuantity - previousQuantity;

    await tx.inventoryLog.create({
      data: {
        inventoryId: saved.id,
        productId: saved.productId,
        variantId: null,
        actorId,
        changeType: existing
          ? InventoryChangeType.ADJUST
          : InventoryChangeType.IMPORT,
        quantityBefore: previousQuantity,
        quantityChange,
        quantityAfter: nextQuantity,
        note: this.nullableTrim(inventoryDto.note),
      },
    });
  }

  private async prepareImages(images?: ProductImageDto[]) {
    if (!images?.length) {
      return [];
    }

    const mediaIds = this.uniqueIds(images.map((image) => image.mediaId));
    await this.assertMediaIdsExist(mediaIds);

    let primarySeen = false;

    return images.map((image, index) => {
      const isPrimary = image.isPrimary === true && !primarySeen;
      primarySeen = primarySeen || isPrimary;

      return {
        ...image,
        sortOrder: image.sortOrder ?? index,
        isPrimary,
      };
    });
  }

  private async assertMediaExists(mediaId?: string | null) {
    if (!mediaId) {
      return;
    }

    await this.assertMediaIdsExist([mediaId]);
  }

  private async assertMediaIdsExist(mediaIds: string[]) {
    if (!mediaIds.length) {
      return;
    }

    const media = await this.prisma.media.findMany({
      where: {
        id: { in: mediaIds },
        deletedAt: null,
      },
      select: { id: true },
    });

    this.assertAllIdsExist(
      mediaIds,
      media.map((item) => item.id),
      'media',
    );
  }

  private assertAllIdsExist(
    ids: string[],
    existingIds: string[],
    label: string,
  ) {
    const existingIdSet = new Set(existingIds);
    const missingIds = ids.filter((id) => !existingIdSet.has(id));

    if (missingIds.length) {
      throw new BadRequestException({
        message: `Some ${label} ids do not exist`,
        details: { missingIds },
      });
    }
  }

  private assertValidPrice(originalPrice: number, salePrice?: number | null) {
    if (
      salePrice !== undefined &&
      salePrice !== null &&
      salePrice > originalPrice
    ) {
      throw new BadRequestException(
        'Sale price cannot be greater than original price',
      );
    }
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
    const existing = await this.prisma.product.findFirst({
      where: {
        slug,
        ...(id ? { NOT: { id } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Product slug is already used');
    }
  }

  private async prepareSku(sku?: string | null, id?: string) {
    const normalizedSku = this.nullableTrim(sku);

    if (!normalizedSku) {
      return null;
    }

    const existing = await this.prisma.product.findFirst({
      where: {
        sku: normalizedSku,
        ...(id ? { NOT: { id } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Product SKU is already used');
    }

    return normalizedSku;
  }

  private getPublishedAt(status?: ProductStatus) {
    return status === ProductStatus.PUBLISHED ? new Date() : null;
  }

  private resolvePublishedAt(
    currentStatus: ProductStatus,
    nextStatus: ProductStatus,
  ) {
    if (
      currentStatus !== ProductStatus.PUBLISHED &&
      nextStatus === ProductStatus.PUBLISHED
    ) {
      return new Date();
    }

    if (nextStatus !== ProductStatus.PUBLISHED) {
      return null;
    }

    return undefined;
  }

  private async getProductOrThrow(id: string) {
    const product = await this.findProductById(id);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private async findProductById(id: string) {
    return this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: this.productInclude(),
    });
  }

  private async findSeo(entityId: string) {
    return this.prisma.seoMetadata.findUnique({
      where: {
        entityType_entityId: {
          entityType: SeoEntityType.PRODUCT,
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
    if (!seoDto) {
      return;
    }

    const seoData = this.buildSeoData(seoDto);

    if (!Object.keys(seoData).length) {
      return;
    }

    await tx.seoMetadata.upsert({
      where: {
        entityType_entityId: {
          entityType: SeoEntityType.PRODUCT,
          entityId,
        },
      },
      create: {
        entityType: SeoEntityType.PRODUCT,
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

    if (seoDto.focusKeyword !== undefined) {
      data.focusKeyword = this.nullableTrim(seoDto.focusKeyword);
    }

    if (seoDto.seoScore !== undefined) {
      data.seoScore = seoDto.seoScore ?? null;
    }

    if (seoDto.analysisJson !== undefined) {
      data.analysisJson = seoDto.analysisJson as Prisma.InputJsonValue;
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

  private productInclude(): Prisma.ProductInclude {
    return {
      thumbnailMedia: {
        select: this.mediaSelect(),
      },
      categories: {
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
      tags: {
        include: {
          tag: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true,
            },
          },
        },
      },
      brands: {
        include: {
          brand: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoMediaId: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
      images: {
        include: {
          media: {
            select: this.mediaSelect(),
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
      shippingProfile: {
        select: {
          id: true,
          weight: true,
          length: true,
          width: true,
          height: true,
          shippingClass: true,
        },
      },
      inventory: {
        select: {
          id: true,
          quantity: true,
          reservedQuantity: true,
          lowStockThreshold: true,
          soldOut: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      relatedProducts: {
        include: {
          relatedProduct: {
            select: {
              id: true,
              name: true,
              slug: true,
              sku: true,
            },
          },
        },
        orderBy: [{ relationType: 'asc' }, { sortOrder: 'asc' }],
      },
      _count: {
        select: {
          variants: true,
          reviews: true,
        },
      },
    };
  }

  private productListSelect(options?: {
    includeAdminMeta?: boolean;
  }): Prisma.ProductSelect {
    const select: Prisma.ProductSelect = {
      id: true,
      name: true,
      slug: true,
      sku: true,
      type: true,
      status: true,
      catalogVisibility: true,
      originalPrice: true,
      salePrice: true,
      contactForPrice: true,
      thumbnailMediaId: true,
      thumbnailMedia: {
        select: this.mediaSelect(),
      },
      isFeatured: true,
      isBestSeller: true,
      isNewArrival: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      images: {
        take: 1,
        include: {
          media: {
            select: this.mediaSelect(),
          },
        },
        orderBy: [
          { isPrimary: 'desc' },
          { sortOrder: 'asc' },
          { createdAt: 'asc' },
        ],
      },
    };

    if (options?.includeAdminMeta) {
      select.inventory = {
        select: this.inventoryListSelect(),
      };
    }

    return select;
  }

  private inventoryListSelect(): Prisma.InventorySelect {
    return {
      id: true,
      quantity: true,
      reservedQuantity: true,
      lowStockThreshold: true,
      soldOut: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private mediaSelect(): Prisma.MediaSelect {
    return {
      id: true,
      url: true,
      secureUrl: true,
      fileName: true,
      altText: true,
      title: true,
      width: true,
      height: true,
    };
  }

  private uniqueIds(ids?: string[]) {
    return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
  }

  private nullableTrim(value?: string | null) {
    return value?.trim() || null;
  }

  private resolveJson(value?: Record<string, unknown>) {
    return value as Prisma.InputJsonValue | undefined;
  }

  private toPagination(page: number, limit: number, total: number) {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  private toProductListItemInput(row: AdminProductListRow): ProductListItem {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      sku: row.sku,
      type: row.type,
      status: row.status,
      catalogVisibility: row.catalogVisibility,
      originalPrice: row.originalPrice,
      salePrice: row.salePrice,
      contactForPrice: row.contactForPrice,
      thumbnailMediaId: row.thumbnailMediaId,
      thumbnailMedia: row.thumbnailMedia,
      isFeatured: row.isFeatured,
      isBestSeller: row.isBestSeller,
      isNewArrival: row.isNewArrival,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      images: row.image ? [row.image] : [],
      inventory: row.inventory,
    };
  }

  private toAdminProductSummary(row: AdminProductListRow): AdminProductSummary {
    return {
      variantsCount: row.variantsCount,
      stockSummary: row.inventoryCount
        ? {
            quantity: row.quantity,
            reservedQuantity: row.reservedQuantity,
            availableQuantity: row.quantity - row.reservedQuantity,
            lowStockThreshold: row.lowStockThreshold,
            soldOut: row.soldOut,
            isLowStock: row.isLowStock,
          }
        : null,
    };
  }

  private toProductListItem(
    product: ProductListItem,
    adminSummary?: AdminProductSummary,
  ) {
    const primaryImage = product.images[0];
    const thumbnailMedia = product.thumbnailMedia ?? primaryImage?.media ?? null;
    const variants = product.variants?.map((variant) => {
      const inventory = variant.inventory
        ? {
            ...variant.inventory,
            availableQuantity:
              variant.inventory.quantity - variant.inventory.reservedQuantity,
            isLowStock:
              variant.inventory.quantity <= variant.inventory.lowStockThreshold,
          }
        : null;

      return {
        ...variant,
        inventory,
      };
    });
    const stockEntries = variants?.length
      ? variants
          .map((variant) => variant.inventory)
          .filter((inventory) => inventory !== null)
      : product.inventory
        ? [product.inventory]
        : [];
    const variantsCount = adminSummary?.variantsCount ?? variants?.length ?? 0;
    const quantity = stockEntries.reduce(
      (sum, inventory) => sum + inventory.quantity,
      0,
    );
    const reservedQuantity = stockEntries.reduce(
      (sum, inventory) => sum + inventory.reservedQuantity,
      0,
    );
    const lowStockThreshold = stockEntries.reduce(
      (sum, inventory) => sum + inventory.lowStockThreshold,
      0,
    );
    const inventory = product.inventory
      ? {
          ...product.inventory,
          availableQuantity:
            product.inventory.quantity - product.inventory.reservedQuantity,
          isLowStock:
            product.inventory.quantity <= product.inventory.lowStockThreshold,
        }
      : null;
    const stockSummary =
      adminSummary?.stockSummary ??
      (stockEntries.length
        ? {
            quantity,
            reservedQuantity,
            availableQuantity: quantity - reservedQuantity,
            lowStockThreshold,
            soldOut: stockEntries.every((item) => item.soldOut),
            isLowStock: stockEntries.some(
              (item) => item.quantity <= item.lowStockThreshold,
            ),
          }
        : null);
    const adminMeta =
      product.inventory !== undefined ||
      product.variants !== undefined ||
      adminSummary !== undefined
        ? {
            variantsCount,
            inventory,
            stockSummary,
            variants: variants ?? [],
          }
        : {};

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      type: product.type,
      status: product.status,
      catalogVisibility: product.catalogVisibility,
      originalPrice: product.originalPrice,
      salePrice: product.salePrice,
      contactForPrice: product.contactForPrice,
      thumbnailMediaId: product.thumbnailMediaId ?? primaryImage?.mediaId ?? null,
      thumbnailMedia,
      image: primaryImage
        ? {
            id: primaryImage.id,
            mediaId: primaryImage.mediaId,
            altText: primaryImage.altText ?? primaryImage.media.altText,
            sortOrder: primaryImage.sortOrder,
            isPrimary: primaryImage.isPrimary,
            media: primaryImage.media,
          }
        : null,
      isFeatured: product.isFeatured,
      isBestSeller: product.isBestSeller,
      isNewArrival: product.isNewArrival,
      ...adminMeta,
      publishedAt: product.publishedAt,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private toPublicProductVariant(variant: PublicProductVariant) {
    const inventory = variant.inventory
      ? {
          ...variant.inventory,
          availableQuantity:
            variant.inventory.quantity - variant.inventory.reservedQuantity,
          isLowStock:
            variant.inventory.quantity <= variant.inventory.lowStockThreshold,
        }
      : null;

    return {
      ...variant,
      inventory,
    };
  }

  private toProduct(product: ProductWithRelations, seo?: unknown) {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      type: product.type,
      status: product.status,
      catalogVisibility: product.catalogVisibility,
      originalPrice: product.originalPrice,
      salePrice: product.salePrice,
      contactForPrice: product.contactForPrice,
      shortDescription: product.shortDescription,
      description: product.description,
      additionalInfo: product.additionalInfo,
      sizeGuide: product.sizeGuide,
      externalUrl: product.externalUrl,
      externalButtonText: product.externalButtonText,
      thumbnailMediaId: product.thumbnailMediaId,
      thumbnailMedia: product.thumbnailMedia,
      isFeatured: product.isFeatured,
      isBestSeller: product.isBestSeller,
      isNewArrival: product.isNewArrival,
      soldIndividually: product.soldIndividually,
      purchaseNote: product.purchaseNote,
      menuOrder: product.menuOrder,
      enableReviews: product.enableReviews,
      viewCount: product.viewCount,
      soldCount: product.soldCount,
      publishedAt: product.publishedAt,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      categories: product.categories.map((item) => item.category),
      categoryIds: product.categories.map((item) => item.category.id),
      tags: product.tags.map((item) => item.tag),
      tagIds: product.tags.map((item) => item.tag.id),
      brands: product.brands.map((item) => item.brand),
      brandIds: product.brands.map((item) => item.brand.id),
      images: product.images.map((image) => ({
        id: image.id,
        mediaId: image.mediaId,
        altText: image.altText,
        sortOrder: image.sortOrder,
        isPrimary: image.isPrimary,
        media: image.media,
      })),
      variantsCount: product._count.variants,
      reviewsCount: product._count.reviews,
      shipping: product.shippingProfile,
      inventory: product.inventory
        ? {
            ...product.inventory,
            availableQuantity:
              product.inventory.quantity - product.inventory.reservedQuantity,
            isLowStock:
              product.inventory.quantity <= product.inventory.lowStockThreshold,
          }
        : null,
      relations: {
        relatedProductIds: product.relatedProducts
          .filter((item) => item.relationType === ProductRelationType.RELATED)
          .map((item) => item.relatedProductId),
        upsellIds: product.relatedProducts
          .filter((item) => item.relationType === ProductRelationType.UPSELL)
          .map((item) => item.relatedProductId),
        crossSellIds: product.relatedProducts
          .filter((item) => item.relationType === ProductRelationType.CROSS_SELL)
          .map((item) => item.relatedProductId),
        relatedProducts: product.relatedProducts.map((item) => ({
          id: item.relatedProduct.id,
          name: item.relatedProduct.name,
          slug: item.relatedProduct.slug,
          sku: item.relatedProduct.sku,
          relationType: item.relationType,
          sortOrder: item.sortOrder,
        })),
      },
      seo,
    };
  }
}
