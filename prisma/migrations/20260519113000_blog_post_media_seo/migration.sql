CREATE TABLE "blog_post_media" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "altText" TEXT,
    "title" TEXT,
    "caption" TEXT,
    "description" TEXT,
    "credit" TEXT,
    "linkUrl" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_post_media_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "blog_post_media_postId_sortOrder_idx" ON "blog_post_media"("postId", "sortOrder");
CREATE INDEX "blog_post_media_mediaId_idx" ON "blog_post_media"("mediaId");

ALTER TABLE "blog_post_media"
ADD CONSTRAINT "blog_post_media_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "blog_post_media"
ADD CONSTRAINT "blog_post_media_mediaId_fkey"
FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
