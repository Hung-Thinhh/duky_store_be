import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaAiIndexService } from '../media/media-ai-index.service';
import {
  BlogAiAssistDto,
  BlogAiBlockAssistDto,
  BlogAiTask,
} from './dto/blog-ai-assist.dto';

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

@Injectable()
export class BlogAiService {
  private readonly logger = new Logger(BlogAiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mediaAiIndexService: MediaAiIndexService,
  ) {}

  async assist(input: BlogAiAssistDto) {
    const enrichedInput = await this.enrichWithRelevantMedia(input);
    const content = await this.completeJson(
      this.buildSystemPrompt(),
      this.buildUserPrompt(enrichedInput),
      0.65,
    );

    return this.parseAssistantJson(content);
  }

  async assistBlock(input: BlogAiBlockAssistDto) {
    const content = await this.completeJson(
      this.buildBlockSystemPrompt(),
      this.buildBlockUserPrompt(input),
      0.6,
    );
    const parsed = this.parseAssistantJson(content) as Record<string, unknown>;
    const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : '';
    const replacementHtml =
      typeof parsed.replacementHtml === 'string' && parsed.replacementHtml.trim()
        ? parsed.replacementHtml.trim()
        : null;

    if (!answer) {
      throw new BadGatewayException('Blog AI block response was empty');
    }

    return {
      answer,
      replacementHtml,
    };
  }

  private async completeJson(systemPrompt: string, userPrompt: string, temperature: number) {
    const apiKey = this.getRequiredConfig('BLOG_AI_API_KEY');
    const baseUrl = this.configService.get<string>('BLOG_AI_BASE_URL')?.trim()
      || 'https://llm.chiasegpu.vn/v1';
    const model = this.configService.get<string>('BLOG_AI_MODEL')?.trim()
      || 'gx/gpt-5.5';
    const endpoint = `${baseUrl.replace(/\/+$/g, '')}/chat/completions`;

    // 1. Thêm Timeout 90s (1 phút 30 giây)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature,
          // 3. Bật JSON Mode để ép model trả về chuẩn JSON
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        }),
      });

      clearTimeout(timeoutId);

      const text = await response.text();

      if (!response.ok) {
        this.logger.error(`Blog AI failed ${response.status}: ${text.slice(0, 500)}`);
        throw new BadGatewayException('Blog AI provider request failed');
      }

      let completion: ChatCompletionResponse;
      try {
        completion = JSON.parse(text) as ChatCompletionResponse;
      } catch {
        this.logger.error(`Blog AI returned invalid provider JSON: ${text.slice(0, 500)}`);
        throw new BadGatewayException('Blog AI provider returned invalid JSON');
      }

      const content = completion.choices?.[0]?.message?.content;
      if (!content) {
        throw new BadGatewayException('Blog AI provider returned an empty response');
      }

      return content;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // Xử lý riêng lỗi do quá thời gian Timeout
      if (error.name === 'AbortError') {
        this.logger.error('Blog AI request timed out sau 90 giây');
        throw new BadGatewayException('Blog AI bị gián đoạn do phản hồi quá 90 giây');
      }
      throw error;
    }
  }

  private buildSystemPrompt() {
    return [
      'Bạn là trợ lý viết blog SEO chuyên nghiệp của Duky Store, chuyên giày boot, áo khoác da, và phụ kiện thời trang da.',
      'Viết tiếng Việt tự nhiên, hiện đại, lôi cuốn, có tính tư vấn bán hàng nhẹ nhàng, không phóng đại và không bịa thông tin kỹ thuật.',
      'TRÁNH SÁO RỖNG & RẬP KHUÔN (AI CLICHES): Tuyệt đối KHÔNG sử dụng các từ đệm, cụm từ sáo rỗng quen thuộc của AI ở đầu câu hoặc đầu đoạn như: "Thật vậy,", "Không thể phủ nhận,", "Trong thế giới thời trang,", "Hơn cả một...", "Bên cạnh đó,", "Đặc biệt,", "Đáng chú ý,".',
      'CÁ NHÂN HÓA NỘI DUNG: Đứng dưới góc nhìn của một chuyên gia thời trang thực tế tại Duky Store để chia sẻ trải nghiệm chân thực. Cố gắng đa dạng hóa các cấu trúc ngữ pháp và cách chuyển ý mềm mại, tránh việc lặp đi lặp lại một mô-típ.',
      'ĐỘC NHẤT 100%: Sử dụng tối đa các thông tin thực tế được cung cấp trong ngữ cảnh để tạo ra nội dung mang màu sắc thương hiệu riêng biệt, tránh viết các bài lý thuyết chung chung nhàm chán.',
      'Chỉ trả về JSON hợp lệ, không markdown, không giải thích ngoài JSON.',
      'HTML content chỉ dùng các thẻ an toàn: p, h2, h3, ul, ol, li, strong, em, a, blockquote, table, thead, tbody, tr, th, td, img, hr.',
      'Không tạo h1 trong content vì giao diện đã có h1 riêng.',
      'Metadata SEO được frontend tự sinh từ title/excerpt/content; chỉ trả seo khi task yêu cầu gợi ý từ khóa.',
      'If context.extraContext.needsTitle or needsExcerpt is true, always return the missing title/excerpt fields even when the selected task normally avoids them.',
      'Nếu gợi ý internal link, chỉ dùng URL/product/blog được cung cấp trong context.',
      'Nếu chọn ảnh, chỉ chọn mediaId có thật trong context.extraContext.mediaLibrary, không tự bịa mediaId hoặc URL.',
    ].join('\n');
  }

  private buildUserPrompt(input: BlogAiAssistDto) {
    return JSON.stringify({
      instruction: this.taskInstruction(input),
      outputContract: {
        summary: 'string',
        title: 'string | null',
        slug: 'string | null',
        excerpt: 'string | null',
        contentHtml: 'string | null',
        seo: {
          metaTitle: 'string | null',
          metaDescription: 'string | null',
          ogTitle: 'string | null',
          ogDescription: 'string | null',
          twitterTitle: 'string | null',
          twitterDescription: 'string | null',
          focusKeyword: 'string | null',
        },
        outline: ['string'],
        faqs: [{ question: 'string', answer: 'string' }],
        internalLinks: [{ label: 'string', url: 'string', reason: 'string' }],
        imageAlts: [{ src: 'string | null', alt: 'string', caption: 'string | null' }],
        selectedMedia: {
          coverMediaId: 'string | null',
          ogImageMediaId: 'string | null',
          inlineImages: [
            {
              mediaId: 'string',
              afterHeading: 'string | null',
              alt: 'string | null',
              caption: 'string | null',
              reason: 'string | null',
            },
          ],
        },
        improvements: ['string'],
      },
      requiredMissingFields: this.buildMissingArticleFields(input),
      article: {
        title: input.title || '',
        slug: input.slug || '',
        excerpt: input.excerpt || '',
        contentHtml: this.truncate(input.content || '', 16000),
        focusKeyword: input.focusKeyword || '',
        articleType: input.articleType || '',
        tone: input.tone || 'tư vấn thân thiện, chuyên nghiệp',
      },
      context: {
        categories: input.categories ?? [],
        tags: input.tags ?? [],
        products: input.products ?? [],
        relatedPosts: input.relatedPosts ?? [],
        extraContext: input.extraContext ?? {},
      },
    });
  }

  private buildMissingArticleFields(input: BlogAiAssistDto) {
    const needsTitle = input.extraContext?.needsTitle === true;
    const needsExcerpt = input.extraContext?.needsExcerpt === true;

    return {
      needsTitle,
      needsExcerpt,
      instruction: needsTitle || needsExcerpt
        ? [
            'The article is missing title and/or excerpt.',
            'You must generate every missing field and return it in the JSON response.',
            'Only fill fields marked as missing; do not rewrite fields the admin already provided.',
            'Title should be concise, natural Vietnamese, and aligned with content/focusKeyword.',
            'Excerpt should be a 120-160 character Vietnamese summary suitable for frontend-generated metadata.',
          ].join(' ')
        : 'No missing title/excerpt fields need to be generated.',
    };
  }

  private buildBlockSystemPrompt() {
    return [
      'Bạn là trợ lý chỉnh sửa nội dung blog trực tiếp (inline) cho Duky Store.',
      'Luôn trả lời bằng tiếng Việt.',
      'TRÁNH SÁO RỖNG & RẬP KHUÔN (AI CLICHES): Không sử dụng các từ đệm, cụm từ sáo rỗng quen thuộc của AI như: "Thật vậy,", "Không thể phủ nhận,", "Hơn cả một...", "Trong thế giới thời trang...". Giữ văn phong tươi mới, chuyên nghiệp, năng động và tự nhiên.',
      'Chỉ trả về JSON hợp lệ. Không trả về markdown fences hoặc văn bản nằm ngoài JSON.',
      'Cấu trúc đầu ra (Output contract): {"answer":"string","replacementHtml":"string | null"}.',
      'Chỉ sử dụng replacementHtml khi yêu cầu tạo mới, viết lại, rút ngắn, mở rộng, sửa lỗi hoặc cải thiện khối văn bản hiện tại.',
      'Nếu yêu cầu chỉ là giải thích, đánh giá hoặc tóm tắt để đọc, hãy đặt replacementHtml thành null trừ khi người dùng yêu cầu thay thế một cách rõ ràng.',
      'Khi trả về replacementHtml, chỉ trả về mã HTML bên trong cho khối văn bản này, không bao bọc bởi blockquote và không viết thành cả một bài viết hoàn chỉnh.',
      'Các thẻ HTML được phép sử dụng: p, h1, h2, h3, ul, ol, li, strong, em, a, blockquote, table, thead, tbody, tr, th, td, img, hr.',
      'Không bịa đặt thông số kỹ thuật sản phẩm, giá cả, chương trình khuyến mãi, URL hoặc URL hình ảnh.',
      'Chỉ sử dụng dàn ý bài viết và các khối văn bản liền kề để giữ cho khối văn bản đang chỉnh sửa thống nhất với mạch văn bản xung quanh.',
      'You are an inline blog content editor assistant for Duky Store.',
      'Always respond in Vietnamese.',
      'AVOID CLICHES: Do not use common AI filler phrases like "Thật vậy,", "Không thể phủ nhận,", "Hơn cả một...", "Trong thế giới thời trang...". Keep the tone fresh, professional, dynamic, and natural.',
      'Return only valid JSON. Do not return markdown fences or text outside the JSON.',
      'Output contract: {"answer":"string","replacementHtml":"string | null"}.',
      'Use replacementHtml only when requested to create, rewrite, shorten, expand, fix errors, or improve the current block.',
      'If the request is only for explanation, evaluation, or summary, set replacementHtml to null unless explicitly requested to replace.',
      'When returning replacementHtml, provide only the inner HTML code for the block, do not wrap in blockquote and do not write a full article.',
      'Allowed HTML tags: p, h1, h2, h3, ul, ol, li, strong, em, a, blockquote, table, thead, tbody, tr, th, td, img, hr.',
      'Do not fabricate product specs, pricing, promotions, URLs, or image URLs.',
      'Use the article outline and adjacent blocks to keep the edited block consistent with the surrounding context.',
      'If there is a focus keyword, it has been decided by the admin: do not create or replace it. Keep it naturally if it already appears in the current block.',
      'If there are failed SEO checks and the user requests optimization, only resolve those improvable in this block. Do not provide an exact final score.',
    ].join('\n');
  }

  private buildBlockUserPrompt(input: BlogAiBlockAssistDto) {
    return JSON.stringify({
      instruction: input.instruction,
      articleTitle: input.articleTitle || '',
      articleExcerpt: input.articleExcerpt || '',
      focusKeyword: input.focusKeyword || '',
      writingGuidance: {
        articleType: input.articleType || '',
        tone: input.tone || '',
      },
      articleOutline: input.outline ?? [],
      blockType: input.blockType,
      currentBlockHtml: this.truncate(input.blockHtml || '', 16000),
      adjacentContext: {
        previousBlockHtml: this.truncate(input.previousBlockHtml || '', 4000),
        nextBlockHtml: this.truncate(input.nextBlockHtml || '', 4000),
      },
      seoContext: {
        currentScore: input.seoScore ?? null,
        failedChecks: input.seoFailedChecks ?? [],
      },
    });
  }

  private taskInstruction(input: BlogAiAssistDto) {
    const isKeywordSuggestion = input.extraContext?.mode === 'SEO_KEYWORD_SUGGESTION';

    switch (input.task) {
      case BlogAiTask.FULL_DRAFT:
        return 'Tạo gói bài blog nháp hoàn chỉnh từ dữ liệu hiện có: title, excerpt, contentHtml chuẩn SEO có h2/h3, FAQ, CTA nhẹ, internal links, alt ảnh nếu có. Không cần tạo SEO metadata vì frontend sẽ tự sinh. Nếu article.focusKeyword có sẵn, phải dựa vào key đó, không tạo key mới. Nếu context.extraContext.mediaLibrary có ảnh, hãy chọn ảnh phù hợp cho selectedMedia.coverMediaId, selectedMedia.ogImageMediaId và 1-3 inlineImages theo từng H2.';
      case BlogAiTask.SEO:
        if (isKeywordSuggestion) {
          return 'Chỉ gợi ý từ khóa SEO. Trả seo.focusKeyword dạng danh sách ngắn cách bằng dấu phẩy; không cần trả contentHtml, selectedMedia hay metadata khác.';
        }

        return [
          'Tối ưu SEO là task sửa điểm SEO, không phải task rewrite bài.',
          'Chỉ trả summary, contentHtml nếu cần, internalLinks, imageAlts, selectedMedia và improvements.',
          'Không trả title, slug, excerpt, outline, faqs hoặc SEO metadata cho task này.',
          'Mục tiêu là đưa điểm SEO dashboard lên tối thiểu 80/100 nếu nội dung đủ dữ liệu.',
          'Không tạo hoặc sửa SEO metadata; frontend sẽ tự sinh metaTitle/metaDescription/OG/Twitter/canonical.',
          'Nếu article.focusKeyword có sẵn, phải dựa vào key đó, không tạo key mới và không trả seo.focusKeyword khác.',
          'Nếu extraContext.seoAnalysis.failedChecks có dữ liệu, chỉ sửa đúng các check đang fail trong contentHtml: keyword trong intro/H2/content/alt, internal link, media, độ dài, density, readability.',
          'Giữ ý chính, title, slug, excerpt và giọng bài cũ; không viết lại toàn bộ nếu không cần.',
          'Nếu context.extraContext.mediaLibrary có ảnh, hãy chọn ảnh phù hợp cho cover/OG và 1-3 inlineImages; alt ảnh nên chứa focus keyword tự nhiên.',
          'Nếu nội dung đã đạt SEO, contentHtml có thể null; improvements phải nói rõ check nào đã đạt/chưa cần sửa.',
        ].join(' ');
      case BlogAiTask.OUTLINE:
        return [
          'Chỉ tạo dàn ý, không viết bài hoàn chỉnh.',
          'Bắt buộc contentHtml = null, faqs = [], imageAlts = [], internalLinks = [] trừ khi người dùng yêu cầu riêng.',
          'Trả outline là danh sách H2/H3 và ý chính ngắn gọn để admin tự viết bài.',
          'Có thể trả summary, title, excerpt ở mức gợi ý ngắn; không cần trả SEO metadata.',
          'Không trả đoạn văn dài, không tạo CTA, không tạo nội dung HTML đầy đủ.',
        ].join(' ');
      case BlogAiTask.OPTIMIZE:
        return 'Tối ưu bài hiện tại là task nâng chất lượng bài cho người đọc và chuyển đổi, không phải chỉ sửa điểm SEO. Có thể trả title, slug, excerpt nếu cần sửa nhẹ; trả contentHtml đã tối ưu flow, H2/H3, readability, CTA, bảng/list, đoạn chuyển ý, internal link và FAQ nếu hợp lý. Không cần tạo SEO metadata vì frontend sẽ tự sinh. Nếu article.focusKeyword có sẵn, phải dựa vào key đó, không tạo key mới. Nếu context.extraContext.mediaLibrary có ảnh, hãy chọn ảnh phù hợp cho cover/OG và 1-3 inlineImages; chỉ dùng mediaId có trong danh sách.';
      case BlogAiTask.INTERNAL_LINKS:
        return 'Gợi ý internal link sang sản phẩm/bài viết/danh mục đã được cung cấp. Không tự bịa URL.';
      case BlogAiTask.IMAGE_ALT:
        return 'Gợi ý alt text và caption cho ảnh trong bài/ảnh đại diện, ưu tiên mô tả ngắn tự nhiên có ngữ cảnh Duky Store.';
      default:
        return 'Hỗ trợ tối ưu bài blog.';
    }
  }

  private async enrichWithRelevantMedia(input: BlogAiAssistDto): Promise<BlogAiAssistDto> {
    if (
      input.task !== BlogAiTask.FULL_DRAFT &&
      input.task !== BlogAiTask.SEO &&
      input.task !== BlogAiTask.OPTIMIZE
    ) {
      return input;
    }

    const mediaLibrary = await this.mediaAiIndexService.searchForBlog({
      title: input.title,
      excerpt: input.excerpt,
      content: input.content,
      focusKeyword: input.focusKeyword,
      categories: input.categories,
      tags: input.tags,
      products: input.products,
      limit: 20,
    });

    return {
      ...input,
      extraContext: {
        ...(input.extraContext ?? {}),
        mediaRetrievalMode: 'BACKEND_AI_INDEX_SEARCH',
        mediaLibrary,
        imageSelectionInstruction:
          'Hãy chọn ảnh từ mediaLibrary đã được backend search/rank theo nội dung bài viết. Chỉ trả về mediaId có trong mediaLibrary. Ưu tiên ảnh có điểm số (score) cao và mô tả/alt/title khớp với ngữ cảnh.',
      },
    };
  }

  private parseAssistantJson(content: string) {
    const cleaned = content
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');

      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
        } catch {
          // Fall through to the explicit error below.
        }
      }

      this.logger.error(`Blog AI returned non-JSON content: ${content.slice(0, 500)}`);
      throw new BadGatewayException('Blog AI response was not valid JSON');
    }
  }

  private truncate(value: string, maxLength: number) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }

  private getRequiredConfig(key: string) {
    const value = this.configService.get<string>(key)?.trim();

    if (!value) {
      throw new BadRequestException(`${key} is required for Blog AI`);
    }

    return value;
  }
}

