CREATE TABLE "product_attributes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "ProductOptionType" NOT NULL DEFAULT 'OTHER',
    "sortBy" TEXT NOT NULL DEFAULT 'custom',
    "swatch" TEXT NOT NULL DEFAULT 'default',
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_attribute_terms" (
    "id" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "value" TEXT,
    "metadata" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "product_attribute_terms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_attributes_slug_key" ON "product_attributes"("slug");
CREATE INDEX "product_attributes_deletedAt_sortOrder_idx" ON "product_attributes"("deletedAt", "sortOrder");
CREATE UNIQUE INDEX "product_attribute_terms_attributeId_slug_key" ON "product_attribute_terms"("attributeId", "slug");
CREATE INDEX "product_attribute_terms_attributeId_sortOrder_idx" ON "product_attribute_terms"("attributeId", "sortOrder");

ALTER TABLE "product_attribute_terms" ADD CONSTRAINT "product_attribute_terms_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "product_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

