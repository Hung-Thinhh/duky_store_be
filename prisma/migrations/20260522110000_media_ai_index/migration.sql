CREATE TABLE "media_ai_index" (
  "id" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "searchText" TEXT NOT NULL,
  "aiDescription" TEXT,
  "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "embedding" JSONB,
  "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "media_ai_index_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_ai_index_mediaId_key" ON "media_ai_index"("mediaId");
CREATE INDEX "media_ai_index_indexedAt_idx" ON "media_ai_index"("indexedAt");

ALTER TABLE "media_ai_index"
ADD CONSTRAINT "media_ai_index_mediaId_fkey"
FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
