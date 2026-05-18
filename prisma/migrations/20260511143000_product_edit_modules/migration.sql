-- Extend product edit support for dashboard modules.

ALTER TYPE "ProductType" ADD VALUE 'GROUPED';
ALTER TYPE "ProductType" ADD VALUE 'EXTERNAL';

CREATE TYPE "ProductCatalogVisibility" AS ENUM ('VISIBLE', 'CATALOG', 'SEARCH', 'HIDDEN');
CREATE TYPE "ProductRelationType" AS ENUM ('RELATED', 'UPSELL', 'CROSS_SELL');

ALTER TABLE "products"
  ADD COLUMN "catalogVisibility" "ProductCatalogVisibility" NOT NULL DEFAULT 'VISIBLE',
  ADD COLUMN "externalUrl" TEXT,
  ADD COLUMN "externalButtonText" TEXT,
  ADD COLUMN "soldIndividually" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "purchaseNote" TEXT,
  ADD COLUMN "menuOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "enableReviews" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "brands" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "logoMediaId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_brands" (
  "productId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_brands_pkey" PRIMARY KEY ("productId", "brandId")
);

CREATE TABLE "product_shipping_profiles" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "weight" DOUBLE PRECISION,
  "length" DOUBLE PRECISION,
  "width" DOUBLE PRECISION,
  "height" DOUBLE PRECISION,
  "shippingClass" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_shipping_profiles_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "related_products"
  ADD COLUMN "relationType" "ProductRelationType" NOT NULL DEFAULT 'RELATED';

ALTER TABLE "related_products" DROP CONSTRAINT "related_products_pkey";
ALTER TABLE "related_products" ADD CONSTRAINT "related_products_pkey" PRIMARY KEY ("productId", "relatedProductId", "relationType");

CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");
CREATE INDEX "brands_isActive_sortOrder_idx" ON "brands"("isActive", "sortOrder");
CREATE INDEX "product_brands_brandId_idx" ON "product_brands"("brandId");
CREATE UNIQUE INDEX "product_shipping_profiles_productId_key" ON "product_shipping_profiles"("productId");
CREATE INDEX "products_catalogVisibility_idx" ON "products"("catalogVisibility");
CREATE INDEX "related_products_productId_relationType_idx" ON "related_products"("productId", "relationType");

ALTER TABLE "brands" ADD CONSTRAINT "brands_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_brands" ADD CONSTRAINT "product_brands_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_brands" ADD CONSTRAINT "product_brands_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_shipping_profiles" ADD CONSTRAINT "product_shipping_profiles_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "brands" ("id", "name", "slug", "sortOrder", "isActive", "updatedAt")
VALUES
  ('DUKY', 'DUKY', 'duky', 0, true, CURRENT_TIMESTAMP),
  ('Duky Classic', 'Duky Classic', 'duky-classic', 1, true, CURRENT_TIMESTAMP),
  ('Duky Premium', 'Duky Premium', 'duky-premium', 2, true, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
