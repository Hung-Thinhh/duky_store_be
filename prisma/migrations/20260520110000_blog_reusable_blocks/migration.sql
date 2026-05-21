-- CreateEnum
CREATE TYPE "BlogReusableBlockType" AS ENUM ('TITLE', 'CONTENT', 'FOOTER', 'CUSTOM');

-- CreateTable
CREATE TABLE "blog_reusable_blocks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "BlogReusableBlockType" NOT NULL DEFAULT 'CUSTOM',
    "description" TEXT,
    "html" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "blog_reusable_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "blog_reusable_blocks_slug_key" ON "blog_reusable_blocks"("slug");

-- CreateIndex
CREATE INDEX "blog_reusable_blocks_type_isActive_sortOrder_idx" ON "blog_reusable_blocks"("type", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "blog_reusable_blocks_createdById_idx" ON "blog_reusable_blocks"("createdById");

-- CreateIndex
CREATE INDEX "blog_reusable_blocks_updatedById_idx" ON "blog_reusable_blocks"("updatedById");

-- AddForeignKey
ALTER TABLE "blog_reusable_blocks" ADD CONSTRAINT "blog_reusable_blocks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_reusable_blocks" ADD CONSTRAINT "blog_reusable_blocks_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
