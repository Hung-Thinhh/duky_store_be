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
      0.4,
    );

    return this.parseAssistantJson(content);
  }

  async assistBlock(input: BlogAiBlockAssistDto) {
    const content = await this.completeJson(
      this.buildBlockSystemPrompt(),
      this.buildBlockUserPrompt(input),
      0.3,
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

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature,
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
  }

  private buildSystemPrompt() {
    return [
      'Báº¡n lÃ  trá»£ lÃ½ viáº¿t blog SEO cho Duky Store, chuyÃªn giÃ y boot, Ã¡o khoÃ¡c da, phá»¥ kiá»‡n thá»i trang da.',
      'Viáº¿t tiáº¿ng Viá»‡t tá»± nhiÃªn, cÃ³ tÃ­nh tÆ° váº¥n bÃ¡n hÃ ng nháº¹, khÃ´ng phÃ³ng Ä‘áº¡i, khÃ´ng bá»‹a thÃ´ng tin ká»¹ thuáº­t.',
      'Chá»‰ tráº£ vá» JSON há»£p lá»‡, khÃ´ng markdown, khÃ´ng giáº£i thÃ­ch ngoÃ i JSON.',
      'HTML content chá»‰ dÃ¹ng cÃ¡c tháº» an toÃ n: p, h2, h3, ul, ol, li, strong, em, a, blockquote, table, thead, tbody, tr, th, td, img, hr.',
      'KhÃ´ng táº¡o h1 trong content vÃ¬ giao diá»‡n Ä‘Ã£ cÃ³ h1 riÃªng.',
      'Metadata SEO Ä‘Æ°á»£c frontend tá»± sinh tá»« title/excerpt/content; chá»‰ tráº£ seo khi task yÃªu cáº§u gá»£i Ã½ tá»« khÃ³a.',
      'Náº¿u gá»£i Ã½ internal link, chá»‰ dÃ¹ng URL/product/blog Ä‘Æ°á»£c cung cáº¥p trong context.',
      'Náº¿u chá»n áº£nh, chá»‰ chá»n mediaId cÃ³ tháº­t trong context.extraContext.mediaLibrary, khÃ´ng tá»± bá»‹a mediaId hoáº·c URL.',
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
      article: {
        title: input.title || '',
        slug: input.slug || '',
        excerpt: input.excerpt || '',
        contentHtml: this.truncate(input.content || '', 16000),
        focusKeyword: input.focusKeyword || '',
        articleType: input.articleType || '',
        tone: input.tone || 'tÆ° váº¥n thÃ¢n thiá»‡n, chuyÃªn nghiá»‡p',
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

  private buildBlockSystemPrompt() {
    return [
      'You are an inline blog editor assistant for Duky Store.',
      'Always answer the admin in Vietnamese.',
      'Return valid JSON only. Do not return markdown fences or text outside JSON.',
      'Output contract: {"answer":"string","replacementHtml":"string | null"}.',
      'Use replacementHtml only when the instruction requests creating, rewriting, shortening, expanding, correcting, or improving the current block.',
      'If the instruction asks for an explanation, assessment, or summary to read only, set replacementHtml to null unless the admin explicitly requests replacement.',
      'When replacementHtml is present, return only the inner HTML for this one block, not a blockquote wrapper and not a complete article.',
      'Allowed HTML tags are p, h1, h2, h3, ul, ol, li, strong, em, a, blockquote, table, thead, tbody, tr, th, td, img, hr.',
      'Do not invent product specifications, prices, promotions, URLs, or media URLs.',
      'Use the article outline and adjacent blocks only to keep the edited block consistent with the surrounding flow.',
      'If a focus keyword is supplied, it is locked by the admin: do not create or replace it. Preserve it naturally when it already occurs in the current block.',
      'If SEO failed checks are supplied and the admin asks for SEO improvement, address only checks that can be improved within this block. Do not claim an exact final score.',
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
        return 'Táº¡o gÃ³i bÃ i blog nhÃ¡p hoÃ n chá»‰nh tá»« dá»¯ liá»‡u hiá»‡n cÃ³: title, excerpt, contentHtml chuáº©n SEO cÃ³ h2/h3, FAQ, CTA nháº¹, internal links, alt áº£nh náº¿u cÃ³. KhÃ´ng cáº§n táº¡o SEO metadata vÃ¬ frontend sáº½ tá»± sinh. Náº¿u article.focusKeyword cÃ³ sáºµn, pháº£i dá»±a vÃ o key Ä‘Ã³, khÃ´ng táº¡o key má»›i. Náº¿u context.extraContext.mediaLibrary cÃ³ áº£nh, hÃ£y chá»n áº£nh phÃ¹ há»£p cho selectedMedia.coverMediaId, selectedMedia.ogImageMediaId vÃ  1-3 inlineImages theo tá»«ng H2.';
      case BlogAiTask.SEO:
        if (isKeywordSuggestion) {
          return 'Chá»‰ gá»£i Ã½ tá»« khÃ³a SEO. Tráº£ seo.focusKeyword dáº¡ng danh sÃ¡ch ngáº¯n cÃ¡ch báº±ng dáº¥u pháº©y; khÃ´ng cáº§n tráº£ contentHtml, selectedMedia hay metadata khÃ¡c.';
        }

        return [
          'Tá»‘i Æ°u SEO lÃ  task sá»­a Ä‘iá»ƒm SEO, khÃ´ng pháº£i task rewrite bÃ i.',
          'Chá»‰ tráº£ summary, contentHtml náº¿u cáº§n, internalLinks, imageAlts, selectedMedia vÃ  improvements.',
          'KhÃ´ng tráº£ title, slug, excerpt, outline, faqs hoáº·c SEO metadata cho task nÃ y.',
          'Má»¥c tiÃªu lÃ  Ä‘Æ°a Ä‘iá»ƒm SEO dashboard lÃªn tá»‘i thiá»ƒu 80/100 náº¿u ná»™i dung Ä‘á»§ dá»¯ liá»‡u.',
          'KhÃ´ng táº¡o hoáº·c sá»­a SEO metadata; frontend sáº½ tá»± sinh metaTitle/metaDescription/OG/Twitter/canonical.',
          'Náº¿u article.focusKeyword cÃ³ sáºµn, pháº£i dá»±a vÃ o key Ä‘Ã³, khÃ´ng táº¡o key má»›i vÃ  khÃ´ng tráº£ seo.focusKeyword khÃ¡c.',
          'Náº¿u extraContext.seoAnalysis.failedChecks cÃ³ dá»¯ liá»‡u, chá»‰ sá»­a Ä‘Ãºng cÃ¡c check Ä‘ang fail trong contentHtml: keyword trong intro/H2/content/alt, internal link, media, Ä‘á»™ dÃ i, density, readability.',
          'Giá»¯ Ã½ chÃ­nh, title, slug, excerpt vÃ  giá»ng bÃ i cÅ©; khÃ´ng viáº¿t láº¡i toÃ n bá»™ náº¿u khÃ´ng cáº§n.',
          'Náº¿u context.extraContext.mediaLibrary cÃ³ áº£nh, hÃ£y chá»n áº£nh phÃ¹ há»£p cho cover/OG vÃ  1-3 inlineImages; alt áº£nh nÃªn chá»©a focus keyword tá»± nhiÃªn.',
          'Náº¿u ná»™i dung Ä‘Ã£ Ä‘áº¡t SEO, contentHtml cÃ³ thá»ƒ null; improvements pháº£i nÃ³i rÃµ check nÃ o Ä‘Ã£ Ä‘áº¡t/chÆ°a cáº§n sá»­a.',
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
        return 'Tá»‘i Æ°u bÃ i hiá»‡n táº¡i lÃ  task nÃ¢ng cháº¥t lÆ°á»£ng bÃ i cho ngÆ°á»i Ä‘á»c vÃ  chuyá»ƒn Ä‘á»•i, khÃ´ng pháº£i chá»‰ sá»­a Ä‘iá»ƒm SEO. CÃ³ thá»ƒ tráº£ title, slug, excerpt náº¿u cáº§n sá»­a nháº¹; tráº£ contentHtml Ä‘Ã£ tá»‘i Æ°u flow, H2/H3, readability, CTA, báº£ng/list, Ä‘oáº¡n chuyá»ƒn Ã½, internal link vÃ  FAQ náº¿u há»£p lÃ½. KhÃ´ng cáº§n táº¡o SEO metadata vÃ¬ frontend sáº½ tá»± sinh. Náº¿u article.focusKeyword cÃ³ sáºµn, pháº£i dá»±a vÃ o key Ä‘Ã³, khÃ´ng táº¡o key má»›i. Náº¿u context.extraContext.mediaLibrary cÃ³ áº£nh, hÃ£y chá»n áº£nh phÃ¹ há»£p cho cover/OG vÃ  1-3 inlineImages; chá»‰ dÃ¹ng mediaId cÃ³ trong danh sÃ¡ch.';
      case BlogAiTask.INTERNAL_LINKS:
        return 'Gá»£i Ã½ internal link sang sáº£n pháº©m/bÃ i viáº¿t/danh má»¥c Ä‘Ã£ Ä‘Æ°á»£c cung cáº¥p. KhÃ´ng tá»± bá»‹a URL.';
      case BlogAiTask.IMAGE_ALT:
        return 'Gá»£i Ã½ alt text vÃ  caption cho áº£nh trong bÃ i/áº£nh Ä‘áº¡i diá»‡n, Æ°u tiÃªn mÃ´ táº£ ngáº¯n tá»± nhiÃªn cÃ³ ngá»¯ cáº£nh Duky Store.';
      default:
        return 'Há»— trá»£ tá»‘i Æ°u bÃ i blog.';
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
          'Hay chon anh tu mediaLibrary da duoc backend search/rank theo noi dung bai viet. Chi tra mediaId co trong mediaLibrary. Uu tien anh co score cao va mo ta/alt/title khop ngu canh.',
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

