import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductAiAssistDto, ProductAiTask } from './dto/product-ai-assist.dto';

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

@Injectable()
export class ProductAiService {
  private readonly logger = new Logger(ProductAiService.name);

  constructor(
    private readonly configService: ConfigService,
  ) {}

  async assist(input: ProductAiAssistDto) {
    const content = await this.completeJson(
      this.buildSystemPrompt(),
      this.buildUserPrompt(input),
      0.65,
      input.images,
    );

    return this.parseAssistantJson(content);
  }

  private async completeJson(systemPrompt: string, userPrompt: string, temperature: number, images?: string[]) {
    // Tái sử dụng BLOG_AI config hoặc PRODUCT_AI config
    const apiKey = this.configService.get<string>('PRODUCT_AI_API_KEY')?.trim()
      || this.configService.get<string>('BLOG_AI_KEY')?.trim()
      || this.configService.get<string>('BLOG_AI_API_KEY')?.trim();
    
    if (!apiKey) {
      throw new BadRequestException('PRODUCT_AI_API_KEY or BLOG_AI_API_KEY is required');
    }

    const baseUrl = this.configService.get<string>('PRODUCT_AI_BASE_URL')?.trim()
      || this.configService.get<string>('BLOG_AI_BASE_URL')?.trim()
      || 'https://llm.chiasegpu.vn/v1';

    const model = this.configService.get<string>('PRODUCT_AI_MODEL')?.trim()
      || this.configService.get<string>('BLOG_AI_MODEL')?.trim()
      || 'alic/qwen3.7-max';

    const endpoint = `${baseUrl.replace(/\/+$/g, '')}/chat/completions`;

    // Timeout 300s (5 phút)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    let userContent: any = userPrompt;
    if (images && images.length > 0) {
      const validImages = images
        .filter((img) => img && (img.startsWith('http://') || img.startsWith('https://')))
        .slice(0, 3);
      if (validImages.length > 0) {
        userContent = [
          { type: 'text', text: userPrompt },
          ...validImages.map((url) => ({
            type: 'image_url',
            image_url: { url },
          })),
        ];
      }
    }

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
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: userContent,
            },
          ],
        }),
      });

      clearTimeout(timeoutId);

      const text = await response.text();

      if (!response.ok) {
        this.logger.error(`Product AI failed ${response.status}: ${text.slice(0, 500)}`);
        throw new BadGatewayException('Product AI provider request failed');
      }

      let completion: ChatCompletionResponse;
      try {
        completion = JSON.parse(text) as ChatCompletionResponse;
      } catch {
        this.logger.error(`Product AI returned invalid provider JSON: ${text.slice(0, 500)}`);
        throw new BadGatewayException('Product AI provider returned invalid JSON');
      }

      const content = completion.choices?.[0]?.message?.content;
      if (!content) {
        throw new BadGatewayException('Product AI provider returned an empty response');
      }

      return content;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        this.logger.error('Product AI request timed out sau 5 phút');
        throw new BadGatewayException('Product AI bị gián đoạn do phản hồi quá 5 phút');
      }
      throw error;
    }
  }

  private buildSystemPrompt() {
    return [
      'Bạn là trợ lý viết mô tả sản phẩm và tối ưu SEO chuyên nghiệp của Duky Store, chuyên giày boot (chelsea boot, combat boot), áo khoác da, chân váy da, tất chân và phụ kiện thời trang da cao cấp.',
      'Viết tiếng Việt tự nhiên, hiện đại, lôi cuốn, tập trung vào bán hàng, mô tả rõ chất liệu, phom dáng và cách phối đồ.',
      'TRÁNH SÁO RỖNG & RẬP KHUÔN (AI CLICHES): Tuyệt đối KHÔNG sử dụng các từ đệm, cụm từ sáo rỗng quen thuộc của AI ở đầu câu hoặc đầu đoạn như: "Thật vậy,", "Không thể phủ nhận,", "Trong thế giới thời trang,", "Hơn cả một...", "Bên cạnh đó,", "Đặc biệt,", "Đáng chú ý,".',
      'CÁ NHÂN HÓA NỘI DUNG: Đứng dưới góc nhìn của một nhân viên tư vấn bán hàng thực tế tại Duky Store để chia sẻ mô tả và đánh giá sản phẩm chân thực.',
      'Chỉ trả về JSON hợp lệ, không markdown, không giải thích ngoài JSON.',
      'Mô tả ngắn (shortDescription) cần viết ngắn gọn, tự nhiên và cuốn hút (2-3 câu, tối đa 160 ký tự), tóm tắt đầy đủ và chân thực các đặc tính quan trọng nhất của sản phẩm (như chất liệu, kiểu dáng, phong cách hoặc cảm giác khi sử dụng). Tuyệt đối KHÔNG chèn những lời kêu gọi mua hàng quá đà, giật gân như "mua ngay", "chốt ngay", "kèo hết", "đặt ngay kẻo lỡ".',
      'Mô tả chi tiết (description) bằng HTML cần sử dụng đầy đủ các thông số sản phẩm được cung cấp (giá, biến thể, tồn kho) để viết một bài giới thiệu sản phẩm hoàn chỉnh, chi tiết, hữu ích và chuẩn SEO.',
      'HTML description chỉ dùng các thẻ an toàn: p, h2, h3, ul, ol, li, strong, em, a, blockquote, table, thead, tbody, tr, th, td, img, hr.',
      'Không tạo h1 trong description.',
      'Nếu gợi ý internal link, chỉ dùng URL được cung cấp trong context.',
    ].join('\n');
  }

  private buildUserPrompt(input: ProductAiAssistDto) {
    return JSON.stringify({
      instruction: this.taskInstruction(input),
      outputContract: {
        summary: 'string',
        name: 'string | null',
        slug: 'string | null',
        shortDescription: 'string | null',
        description: 'string | null',
        seo: {
          metaTitle: 'string | null',
          metaDescription: 'string | null',
          focusKeyword: 'string | null',
        },
        improvements: ['string'],
      },
      product: {
        name: input.name || '',
        slug: input.slug || '',
        shortDescription: input.shortDescription || '',
        description: this.truncate(input.description || '', 16000),
        focusKeyword: input.focusKeyword || '',
        productType: input.productType || '',
        tone: input.tone || 'tư vấn bán hàng chuyên nghiệp, hiện đại',
        originalPrice: input.originalPrice ?? null,
        salePrice: input.salePrice ?? null,
        stockQuantity: input.stockQuantity ?? null,
        variants: input.variants ?? [],
        images: input.images ?? [],
      },
      context: {
        categories: input.categories ?? [],
        tags: input.tags ?? [],
        brands: input.brands ?? [],
        extraContext: input.extraContext ?? {},
      },
    });
  }

  private taskInstruction(input: ProductAiAssistDto) {
    const isKeywordSuggestion = input.extraContext?.mode === 'SEO_KEYWORD_SUGGESTION';
    const isWriteShortDesc = input.extraContext?.mode === 'WRITE_SHORT_DESCRIPTION';
    const isWriteDesc = input.extraContext?.mode === 'WRITE_DESCRIPTION';
    const customPrompt = input.extraContext?.prompt || '';

    const keywords = (input.focusKeyword || '').split(',').map(k => k.trim()).filter(Boolean);
    const primaryKeyword = keywords[0] || '';
    const secondaryKeywords = keywords.slice(1);

    const hasImages = input.images && input.images.length > 0;
    const imagesInstruction = hasImages
      ? `Hệ thống cung cấp danh sách hình ảnh thực tế của sản phẩm: [${input.images?.join(', ')}]. Trong phần mô tả chi tiết (description) bằng HTML, hãy khéo léo chèn các hình ảnh này vào những vị trí thích hợp (dùng thẻ <img src="URL" alt="Tên sản phẩm - mô tả chi tiết ảnh" class="rounded-xl my-4 mx-auto max-w-full" />) để minh họa sinh động cho nội dung. Phân bổ các ảnh này trải đều xuyên suốt bài viết, tránh tập trung tất cả ở một vị trí.`
      : 'Tuyệt đối không tự ý chèn hay tạo bất kỳ thẻ <img> nào vào nội dung mô tả chi tiết vì sản phẩm chưa có hình ảnh thực tế nào.';

    if (isWriteShortDesc) {
      return [
        'Nhiệm vụ: Viết riêng một đoạn mô tả ngắn (shortDescription) chất lượng cao cho sản phẩm.',
        customPrompt ? `Yêu cầu cụ thể của người dùng: "${customPrompt}"` : '',
        'Mô tả ngắn cần viết ngắn gọn, tự nhiên, sang trọng và cuốn hút (2-3 câu, tối đa 160 ký tự), làm nổi bật những đặc tính quan trọng nhất của sản phẩm (như chất liệu, kiểu dáng, phong cách).',
        primaryKeyword ? `Đặc biệt, phải khéo léo chèn từ khóa chính "${primaryKeyword}" vào ngay câu đầu tiên của mô tả ngắn một cách tự nhiên nhất.` : '',
        'Tuyệt đối KHÔNG chèn những lời kêu gọi mua hàng quá đà, giật gân (như "mua ngay", "chốt ngay", "kèo hết").',
        'Hãy tập trung cải thiện và điền kết quả vào trường shortDescription. Các trường khác có thể trả về null.',
      ].filter(Boolean).join(' ');
    }

    if (isWriteDesc) {
      return [
        'Nhiệm vụ: Viết riêng một đoạn mô tả chi tiết (description) bằng HTML cho sản phẩm.',
        customPrompt ? `Yêu cầu cụ thể của người dùng: "${customPrompt}"` : '',
        'Mô tả chi tiết bằng HTML cần sử dụng đầy đủ các thông số sản phẩm được cung cấp (giá, biến thể, tồn kho) để viết một bài giới thiệu sản phẩm hoàn chỉnh, chia các phần bằng thẻ H2/H3 rõ ràng (như Chất liệu, Thiết kế, Hướng dẫn chọn size, Hướng dẫn bảo quản).',
        primaryKeyword ? `Phải khéo léo phân bổ từ khóa chính "${primaryKeyword}" vào phần mở đầu mô tả và trong ít nhất một Heading H2/H3.` : '',
        secondaryKeywords.length ? `Phân bổ các từ khóa phụ (${secondaryKeywords.join(', ')}) rải rác một cách tự nhiên khắp bài viết.` : '',
        imagesInstruction,
        'HTML description chỉ dùng các thẻ an toàn: p, h2, h3, ul, ol, li, strong, em, a, blockquote, table, thead, tbody, tr, th, td, img, hr. Không tạo h1.',
        'Hãy tập trung cải thiện và điền kết quả vào trường description. Các trường khác có thể trả về null.',
      ].filter(Boolean).join(' ');
    }

    switch (input.task) {
      case ProductAiTask.FULL_DRAFT:
        return [
          'Nhiệm vụ: Tạo nội dung mô tả sản phẩm hoàn chỉnh.',
          'Hãy dựa trên thông tin tên sản phẩm, giá cả, tồn kho, các biến thể, hình ảnh sản phẩm đính kèm (nếu có) để tự viết mô tả ngắn (shortDescription) cực kỳ cuốn hút, tự nhiên và mô tả chi tiết (description bằng HTML có H2/H3 chia bố cục rõ ràng như Chất liệu, Thiết kế, Cách chọn size, Hướng dẫn bảo quản, các thông số về biến thể màu sắc/kích thước).',
          primaryKeyword
            ? `Đặc biệt, phải sử dụng từ khóa chính "${primaryKeyword}" để viết nội dung chuẩn SEO: xuất hiện ở câu đầu tiên của shortDescription, xuất hiện ở đoạn đầu của description, nằm trong ít nhất 1 heading H2/H3, mật độ từ khóa chính 1.2% - 2.5%. Các từ khóa phụ khác như: ${secondaryKeywords.join(', ')} hãy phân bố rải rác một cách tự nhiên khắp bài viết, tuyệt đối không được nhồi nhét hay liệt kê khô khan trong câu đầu tiên của mô tả ngắn.`
            : 'Vì không có từ khóa chính được cung cấp, bạn hãy tự động đề xuất 1 từ khóa chính tốt nhất (vd: "giày chelsea boot nam", "áo khoác da nam") và các từ khóa phụ liên quan dựa trên tên và thông tin sản phẩm, điền vào seo.focusKeyword dưới dạng danh sách ngăn cách bằng dấu phẩy (từ khóa đầu tiên là từ khóa chính), và dùng chính từ khóa chính đó để viết bài chuẩn SEO theo các tiêu chuẩn trên.',
          imagesInstruction,
          'Mô tả ngắn (shortDescription) phải là một đoạn mô tả chân thực, hấp dẫn, tự nhiên về sản phẩm để kích thích mua sắm, KHÔNG được viết dưới dạng danh sách từ khóa hay nhồi nhét liệt kê từ khóa.',
          'Không tự ý tạo SEO metadata metaTitle và metaDescription trừ khi cần thiết, hoặc để AI sinh các đề xuất SEO tối ưu.',
        ].join(' ');
      
      case ProductAiTask.SEO:
        if (isKeywordSuggestion) {
          return 'Chỉ gợi ý từ khóa SEO chính (focusKeyword). Phân tích tên sản phẩm, các biến thể và hình ảnh đính kèm (nếu có) để trả về seo.focusKeyword dưới dạng danh sách ngắn cách bằng dấu phẩy. Từ khóa đầu tiên là key chính (search intent thực tế của khách hàng, vd: "giày chelsea boot nam", "áo khoác da nam"), tiếp theo là 3-5 từ khóa phụ.';
        }

        return [
          'Nhiệm vụ: Tối ưu SEO cho sản phẩm hiện tại để đạt điểm tối thiểu 90/100.',
          'Hãy sửa đổi description (HTML) và shortDescription để giải quyết các checklist lỗi SEO sau:',
          primaryKeyword
            ? `- Đảm bảo từ khóa chính "${primaryKeyword}" xuất hiện trong tiêu đề sản phẩm (name) và slug.`
            : '- Đảm bảo từ khóa chính (focusKeyword) xuất hiện trong tiêu đề sản phẩm (name) và slug.',
          primaryKeyword
            ? `- Đảm bảo từ khóa chính "${primaryKeyword}" xuất hiện ngay câu đầu tiên của shortDescription dưới dạng một câu văn mô tả sản phẩm tự nhiên, cuốn hút (sẽ dùng làm meta description). Tuyệt đối không nhồi nhét, liệt kê các từ khóa phụ vào câu đầu tiên này.`
            : '- Đảm bảo từ khóa chính xuất hiện ngay câu đầu tiên của shortDescription.',
          primaryKeyword
            ? `- Đảm bảo từ khóa chính "${primaryKeyword}" xuất hiện ở đầu description (mở đầu phần mô tả chi tiết).`
            : '- Đảm bảo từ khóa chính xuất hiện ở đầu description.',
          primaryKeyword
            ? `- Đảm bảo từ khóa chính "${primaryKeyword}" nằm trong ít nhất một Heading H2 hoặc H3 trong description.`
            : '- Đảm bảo từ khóa chính nằm trong ít nhất một Heading H2 hoặc H3 trong description.',
          primaryKeyword
            ? `- Đảm bảo mật độ từ khóa chính "${primaryKeyword}" đạt khoảng 1.2% - 2.5% trong mô tả chi tiết.`
            : '- Đảm bảo mật độ từ khóa chính đạt khoảng 1.2% - 2.5% trong mô tả chi tiết.',
          secondaryKeywords.length
            ? `- Phân bố các từ khóa phụ (${secondaryKeywords.join(', ')}) một cách rải rác và tự nhiên trong description, không được gom cụm hay nhồi nhét chung với từ khóa chính.`
            : '',
          '- Thêm ít nhất 1 external link (vd: link Wikipedia về chất liệu da hoặc link uy tín) và 1 internal link (dùng từ danh mục/tag/brands được truyền trong context).',
          imagesInstruction,
          'Tích hợp thông tin giá cả, tồn kho, các biến thể vào bài viết tự nhiên hơn.',
          'Mô tả ngắn (shortDescription) phải là một câu văn giới thiệu sản phẩm mượt mà, chân thực và cuốn hút, tuyệt đối không được là chuỗi các từ khóa liệt kê thô kệch.',
          'Không thay đổi ý chính hoặc đặc tính sản phẩm, chỉ điều chỉnh từ ngữ cho chuẩn SEO.',
        ].filter(Boolean).join(' ');

      case ProductAiTask.OPTIMIZE:
        return [
          'Nâng cao chất lượng mô tả sản phẩm (description và shortDescription) để tăng tỷ lệ chốt đơn: làm nổi bật ưu điểm sản phẩm từ hình ảnh và thuộc tính, chỉnh lại định dạng danh sách/bảng cho dễ đọc, cải thiện CTA ở cuối mô tả.',
          'Đảm bảo giữ nguyên các thông số kỹ thuật thực tế.',
          imagesInstruction,
          'Mô tả ngắn (shortDescription) cần viết mượt mà, lôi cuốn, mang tính thuyết phục cao chứ không phải là nhồi nhét từ khóa.',
        ].filter(Boolean).join(' ');

      default:
        return 'Tối ưu SEO và mô tả sản phẩm.';
    }
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
          // Fall through
        }
      }

      this.logger.error(`Product AI returned non-JSON content: ${content.slice(0, 500)}`);
      throw new BadGatewayException('Product AI response was not valid JSON');
    }
  }

  private truncate(value: string, maxLength: number) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }
}
