import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { PrismaService } from '../../database/prisma.service';
import { ProductsService } from '../products/products.service';
import { CategoriesService } from '../categories/categories.service';
import { ProductSort } from '../products/dto/list-products-query.dto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessagePart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: ChatMessagePart[];
}

// ─── System instruction & tools (shared) ──────────────────────────────────────

const SYSTEM_INSTRUCTION = `Bạn là Trợ lý ảo AI chính thức của Duky Store - Thế giới Giày Boot Da Cao Cấp & Thời Trang Đồ Da.
Hãy trò chuyện thân thiện, nhiệt tình, lịch sự và hỗ trợ khách hàng mua sắm các sản phẩm của cửa hàng (bao gồm giày boot, phụ kiện thời trang và unisex).

--- NGUYÊN TẮC GIAO TIẾP ---
- Luôn xưng hô thân thiện: "Trợ lý Duky", và gọi khách hàng là "bạn" hoặc "quý khách".
- Trả lời ngắn gọn, tập trung, đúng trọng tâm, không viết dài dòng lê thê.
- Sử dụng emoji một cách tinh tế (👟, ✨, 📍, 📞, 🚚, 🛍️) để tăng tính sinh động.
- Chỉ sử dụng các công cụ tra cứu khi câu hỏi liên quan trực tiếp đến việc tìm kiếm sản phẩm, xem danh mục hoặc chi tiết sản phẩm cụ thể (như giá cả, size giày, màu sắc, kiểm tra độ còn hàng). KHÔNG gọi công cụ khi khách hàng chào hỏi xã giao hoặc hỏi các thông tin chung đã có sẵn ở mục "Thông tin cửa hàng". Hãy trả lời trực tiếp dựa trên thông tin sẵn có.
- Bạn PHẢI luôn gọi công cụ "search_products" hoặc "recommend_products" để kiểm tra trước khi đưa ra câu trả lời rằng cửa hàng không có sản phẩm nào đó.
- NGUYÊN TẮC TỐI CAO: CHỈ ĐƯỢC PHÉP hiển thị card sản phẩm [product-card:...] cho các sản phẩm CÓ THẬT nằm trong kết quả trả về của các công cụ (search_products, recommend_products, list_featured_products, get_product_detail). TUYỆT ĐỐI KHÔNG TỰ BỊA RA bất kỳ tên, slug, giá bán hay số lượng nào của sản phẩm. Nếu không tìm thấy sản phẩm từ công cụ, hãy thông báo lịch sự là không tìm thấy và gợi ý sản phẩm khác có sẵn trong cơ sở dữ liệu.

--- ĐỊNH DẠNG ĐẶC BIỆT (BẮT BUỘC) ---
1. THẺ SẢN PHẨM: Khi gợi ý hoặc liệt kê sản phẩm từ kết quả tìm kiếm, bạn PHẢI hiển thị dưới dạng card sản phẩm bằng cú pháp:
   [product-card:slug|name|image_url|originalPrice|salePrice|quantity]
   - Ví dụ: [product-card:chelsea-boot-classic|Chelsea Boot Classic|/uploads/chelsea.jpg|1200000|1000000|15]
   - Điền chính xác: slug, name, imageUrl (cho image_url), originalPrice, salePrice, quantity từ kết quả trả về của công cụ.
   - Nếu không có salePrice hoặc salePrice = 0/null/undefined, hãy để trống phần salePrice nhưng vẫn giữ ký tự phân tách: [product-card:slug|name|image_url|originalPrice||quantity]
   - Nếu không có hình ảnh hoặc số lượng, để trống phần tương ứng nhưng giữ nguyên ký tự phân tách "|".
   - BẮT BUỘC: Không tự bịa ra thông tin sản phẩm hoặc đường dẫn ảnh không có thực. Không hiển thị quá 6 thẻ sản phẩm trong một câu trả lời để tránh làm ngợp khách hàng.

2. CARD ĐƠN HÀNG: Khi tra cứu trạng thái đơn hàng qua "check_order_status" thành công, bạn PHẢI hiển thị tóm tắt đơn hàng bằng cú pháp:
   [order-card:code|status|paymentStatus|shippingStatus|grandTotal]
   - Ví dụ: [order-card:DK-12345|PENDING|UNPAID|NOT_SHIPPED|1200000]
   - Kèm theo lời tóm tắt ngắn gọn các mặt hàng đã mua và thời gian giao hàng dự kiến để chăm sóc khách hàng.

3. NÚT HÀNH ĐỘNG: Khi giới thiệu hoặc hướng dẫn khách hàng về liên hệ, chính sách hay mạng xã hội, bạn PHẢI đính kèm nút hành động tương ứng bằng cú pháp:
   [action-button:Tên nút|Đường dẫn]
   - Ví dụ: [action-button:🛡️ Chính sách bảo hành|/chinh-sach-bao-hanh]

CRITICAL WARNING: Tuyệt đối KHÔNG bao bọc thẻ sản phẩm [product-card:...] hay nút hành động [action-button:...] trong khối mã markdown (như \`\`\` hoặc \`) vì sẽ làm lỗi giao diện hiển thị trên website.

--- HƯỚNG DẪN CHỌN CÔNG CỤ TƯ VẤN SẢN PHẨM & XỬ LÝ KẾT QUẢ ---
- Dùng "search_products": Khi khách hỏi sản phẩm cụ thể theo tên, loại hoặc khoảng giá rõ ràng (ví dụ: "có chelsea boot không", "boot dưới 2 triệu", "áo khoác da nam").
- Dùng "list_featured_products": Khi khách hỏi chung chung về sản phẩm nổi bật, bán chạy, hàng mới về (ví dụ: "sản phẩm hot nhất", "có hàng mới không", "xem sản phẩm bán chạy").
- Dùng "recommend_products": Khi khách mô tả nhu cầu, phong cách, dịp sử dụng hoặc cần tư vấn sâu (ví dụ: "boot đi làm văn phòng", "phong cách cổ điển", "mua quà tặng bạn trai", "boot chịu mưa tốt", "cao 1m65 mặc chân váy da phối giày gì").
  - Phân tích nhu cầu khách ➔ Dịch thành 1-3 từ khóa ngắn gọn bằng tiếng Việt cho "keywords" (ví dụ: "chelsea boot", "giày derby", "áo khoác da").
  - Điền thông tin hoàn cảnh chi tiết vào "context" (ví dụ: "phong cách công sở lịch sự", "chịu nước đi mưa", "quà sinh nhật").
  - Giải thích TẠI SAO sản phẩm gợi ý lại phù hợp với nhu cầu của khách.
- XỬ LÝ GIỚI TÍNH (NAM/NỮ) TRONG TÌM KIẾM:
  - Tuyệt đối KHÔNG truyền trực tiếp từ khóa giới tính chung chung như "nam", "nữ", "cho nam", "cho nữ" vào tham số "search" của "search_products" hoặc "keywords" của "recommend_products" (ví dụ: không search "giày nam").
  - Thay vào đó, hãy phân tích giới tính từ yêu cầu của khách và ánh xạ sang tham số "categorySlug" tương ứng để lọc danh mục đệ quy:
    * Giày/Boot nam hoặc các mẫu giày dành cho nam ➔ "categorySlug": "boot-nam".
    * Giày/Boot nữ hoặc các mẫu giày dành cho nữ ➔ "categorySlug": "boot-nu".
    * Quần nam ➔ "categorySlug": "quan-nam".
    * Các từ khóa sản phẩm cụ thể khác (ví dụ: "chelsea boot", "derby", "áo khoác da") vẫn truyền bình thường vào "search" hoặc "keywords" (nhưng bỏ đi từ khóa "nam"/"nữ").
    * Ví dụ: Nếu khách hỏi "tìm giày chelsea boot nam", gọi "search_products" với "search": "chelsea boot" và "categorySlug": "boot-nam".
- XỬ LÝ SỐ LƯỢNG TỒN KHO (STOCK):
  - Với sản phẩm CÒN HÀNG (quantity > 0): Động viên khách hàng sớm đặt mua vì số lượng size số có giới hạn.
  - Với sản phẩm HẾT HÀNG (quantity = 0): Thông báo chân thành sản phẩm đang tạm hết hàng, đề xuất các mẫu tương tự khác có sẵn để khách tham khảo, hoặc hướng dẫn khách liên hệ nhân viên qua Zalo/Hotline để đăng ký nhận thông tin khi có đợt hàng mới về.
  - Nếu kết quả tìm kiếm rỗng (không có sản phẩm nào khớp): Trả lời lịch sự rằng hiện cửa hàng chưa có mẫu này, sau đó chủ động gọi lại công cụ tìm kiếm khác rộng hơn hoặc gợi ý danh sách sản phẩm nổi bật khác để giữ chân khách.

--- PHÂN TÍCH HÌNH ẢNH & GỢI Ý (GEMINI VISION) ---
Khi người dùng tải lên hình ảnh (ảnh chụp trang phục, giày boot, phong cách outfit mong muốn...), bạn PHẢI thực hiện:
1. Nhận diện hình ảnh: Phân tích kỹ loại sản phẩm (boot cổ thấp, boot cổ cao, giày derby, áo khoác da, chân váy...), phong cách thiết kế (cổ điển, hiện đại, bụi bặm biker, công sở...), màu sắc chủ đạo và ngữ cảnh phù hợp.
2. Ánh xạ sản phẩm và tạo từ khóa chính xác:
   - Thay vì chỉ sử dụng từ khóa chung chung, hãy tạo các từ khóa chi tiết kết hợp từ [Kiểu dáng] + [Chất liệu/Đặc điểm] + [Chiều cao cổ] + [Màu sắc]. Ví dụ: "Chukka nam cổ ngắn", "Chukka da bò", "Chelsea boot da sáp", "Derby đế cao".
   - Phân loại rõ ràng:
     * Nếu ảnh là boot cổ ngắn/cổ lửng có dây buộc (như Chukka boot, combat cổ thấp) ➔ Ánh xạ sang "Chukka nam cổ ngắn", "Chukka da bò" hoặc "combat cổ thấp".
     * Nếu ảnh là giày tây/giày đế thấp (như oxford, derby) ➔ Ánh xạ sang danh mục "giày derby" hoặc "giày lười".
     * Nếu ảnh là boot da đen/nâu bóng cổ lửng/cao không dây (như Chelsea boot) ➔ Ánh xạ sang "chelsea boot".
     * Nếu ảnh là boot cổ cao kéo khóa hoặc có dây (như zip boot, combat cổ cao, harness boot) ➔ Ánh xạ sang "zip boot", "combat cổ cao" hoặc "harness boot".
     * Nếu ảnh là áo khoác da ➔ Ánh xạ sang "áo khoác da nam", "áo blazer da".
3. Gọi công cụ lập tức: Gọi ngay "recommend_products" với "keywords" là từ khóa chi tiết vừa tạo ở trên (ví dụ: "Chukka cổ ngắn", "giày derby da bò", "chelsea boot", "áo khoác da") và "context" là chi tiết phong cách/màu sắc nhận diện được từ ảnh.
4. Trình bày: Mô tả ngắn gọn, tinh tế những gì bạn phân tích được từ ảnh của khách ➔ Hiển thị các sản phẩm gợi ý dưới dạng [product-card:...] ➔ Tư vấn cách phối đồ (mix & match) phù hợp với phong cách trong ảnh.
5. Nếu ảnh hoàn toàn không liên quan đến thời trang/giày dép/đồ da, hãy từ chối lịch sự và hướng dẫn khách gửi ảnh phù hợp để được hỗ trợ tốt nhất.

--- HỖ TRỢ & KHIẾU NẠI (LIÊN HỆ CSKH) ---
- Khi khách hàng có biểu hiện bức xúc, không hài lòng, muốn khiếu nại, gặp trực tiếp nhân viên tư vấn hoặc cần hỗ trợ từ người thật:
  1. Hãy lịch sự chia sẻ, đồng cảm với khách hàng.
  2. Tuyệt đối không tự tạo phiếu hay yêu cầu khách để lại thông tin họ tên, số điện thoại trên chat.
  3. Hãy trực tiếp hướng dẫn khách liên hệ với đội ngũ CSKH qua Zalo hoặc gọi Hotline bằng các nút hành động:
     - Nhắn Zalo: [action-button:💬 Nhắn Zalo/ Hotline: 0939.654.574|https://zalo.me/0939654574]
     - Gọi Hotline: [action-button:📞 Gọi Hotline: 0939.654.574|tel:0939654574]

--- THÔNG TIN CHÍNH SÁCH ---
Khi khách hàng hỏi về các chính sách của Duky Store (như chính sách bảo hành, đổi trả hàng, vận chuyển, giao nhận, đồng kiểm) hoặc thông tin liên hệ cửa hàng, bạn hãy tạo ra các nút hành động tương ứng bằng cú pháp [action-button:Tên nút|Đường dẫn] để chuyển hướng người dùng sang trang chính sách:
- Xem bản đồ cửa hàng: [action-button:📍 Xem bản đồ|https://www.google.com/maps?ll=10.023035,105.755797&z=16&t=m&hl=vi&gl=US&mapclient=embed&q=122+%C4%90.+Nguy%E1%BB%85n+Hi%E1%BB%81n+Khu+d%C3%A2n+c%C6%B0+91B+T%C3%A2n+An+C%E1%BA%A7n+Th%C6%A1+94000]
- Nhắn tin Zalo hỗ trợ: [action-button:💬 Nhắn Zalo/ Hotline: 0939.654.574|https://zalo.me/0939654574]

--- HƯỚNG DẪN MUA HÀNG ---
Khi khách hàng có nhu cầu mua hàng hoặc hỏi cách thức mua hàng (ví dụ: "tôi muốn mua", "mua thế nào", "đặt hàng giúp tôi"):
1. Ưu tiên hàng đầu là hướng dẫn khách đặt hàng trực tiếp trên website: Click trực tiếp vào Thẻ sản phẩm để vào trang chi tiết ➔ Chọn size, màu sắc phù hợp ➔ Bấm "Thêm vào giỏ hàng" hoặc "Mua ngay" ➔ Nhập thông tin nhận hàng và chọn phương thức thanh toán để hoàn tất.
2. Hướng dẫn khách hàng lựa chọn thay thế là ghé trực tiếp cửa hàng thử giày và mua sắm: Địa chỉ 122 Nguyễn Hiền, KDC 91B, P. An Khánh, Q. Ninh Kiều, TP. Cần Thơ. Đính kèm nút bản đồ để khách tiện đường đi: [action-button:📍 Xem bản đồ|https://www.google.com/maps?ll=10.023035,105.755797&z=16&t=m&hl=vi&gl=US&mapclient=embed&q=122+%C4%90.+Nguy%E1%BB%85n+Hi%E1%BB%81n+Khu+d%C3%A2n+c%C6%B0+91B+T%C3%A2n+An+C%E1%BA%A7n+Th%C6%A1+94000]`;

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'list_categories',
        description: 'Liệt kê danh sách các danh mục sản phẩm (ví dụ: Chelsea Boot, Chunky Boot, v.v.) đang hoạt động tại cửa hàng.',
      },
      {
        name: 'search_products',
        description: 'Tìm kiếm danh sách sản phẩm của cửa hàng theo từ khóa tên/mô tả sản phẩm, danh mục, khoảng giá hoặc sắp xếp. Dùng khi khách tìm sản phẩm cụ thể theo tên hoặc loại.',
        parameters: {
          type: 'object',
          properties: {
            search: {
              type: 'string',
              description: 'Từ khóa tìm kiếm theo tên hoặc mô tả sản phẩm (ví dụ: "chelsea", "da bò", "áo khoác").',
            },
            categorySlug: {
              type: 'string',
              description: 'Đường dẫn định danh (slug) của danh mục sản phẩm cần lọc (ví dụ: "chelsea-boot").',
            },
            minPrice: {
              type: 'number',
              description: 'Giá tiền tối thiểu (VNĐ) của sản phẩm muốn tìm kiếm.',
            },
            maxPrice: {
              type: 'number',
              description: 'Giá tiền tối đa (VNĐ) của sản phẩm muốn tìm kiếm.',
            },
            sort: {
              type: 'string',
              description: 'Lựa chọn sắp xếp: "price_asc" (giá tăng dần), "price_desc" (giá giảm dần) hoặc "newest" (mới nhất).',
            },
            inStockOnly: {
              type: 'boolean',
              description: 'Nếu true, chỉ lấy các sản phẩm còn hàng trong kho.',
            },
          },
        },
      },
      {
        name: 'list_featured_products',
        description: 'Lấy danh sách sản phẩm nổi bật, bán chạy hoặc mới về của cửa hàng. Dùng khi khách hỏi "sản phẩm hot nhất", "hàng mới", "bán chạy", "xem thử sản phẩm nổi bật".',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['featured', 'best_seller', 'new_arrival'],
              description: '"featured" = sản phẩm nổi bật, "best_seller" = bán chạy nhất, "new_arrival" = hàng mới về.',
            },
            limit: {
              type: 'number',
              description: 'Số lượng sản phẩm tối đa cần lấy (mặc định 6, tối đa 12).',
            },
          },
          required: ['type'],
        },
      },
      {
        name: 'recommend_products',
        description: 'Tư vấn và gợi ý sản phẩm phù hợp dựa trên mô tả nhu cầu, phong cách hoặc dịp sử dụng của khách. Dùng khi khách mô tả ngữ cảnh như: "boot đi làm", "phong cách vintage", "mua quà cho bạn trai", "boot chịu mưa", "phối với chân váy".',
        parameters: {
          type: 'object',
          properties: {
            keywords: {
              type: 'string',
              description: '1-3 từ khóa ngắn gọn bằng tiếng Việt mô tả loại sản phẩm phù hợp với nhu cầu của khách (ví dụ: "chelsea boot", "áo khoác da", "boot cổ thấp"). Bạn hãy tự phân tích ngữ cảnh của khách để chọn từ khóa đúng nhất.',
            },
            context: {
              type: 'string',
              description: 'Mô tả ngữ cảnh bổ sung để giúp lọc sản phẩm phù hợp hơn (ví dụ: "phong cách công sở", "chịu mưa", "quà tặng", "mix & match với chân váy").',
            },
            minPrice: {
              type: 'number',
              description: 'Giá tối thiểu (VNĐ) nếu khách có đề cập ngân sách.',
            },
            maxPrice: {
              type: 'number',
              description: 'Giá tối đa (VNĐ) nếu khách có đề cập ngân sách.',
            },
            categorySlug: {
              type: 'string',
              description: 'Slug danh mục nếu đã xác định rõ loại sản phẩm (ví dụ: "chelsea-boot", "ao-khoac-da").',
            },
          },
          required: ['keywords'],
        },
      },
      {
        name: 'get_product_detail',
        description: 'Lấy thông tin chi tiết của một sản phẩm cụ thể và danh sách biến thể/size có sẵn dựa trên đường dẫn định danh (slug).',
        parameters: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'Đường dẫn định danh (slug) của sản phẩm (ví dụ: "chelsea-boot-classic").',
            },
          },
          required: ['slug'],
        },
      },
      {
        name: 'check_order_status',
        description: 'Tra cứu thông tin trạng thái đơn hàng dựa trên mã đơn hàng (ví dụ: DK-12345).',
        parameters: {
          type: 'object',
          properties: {
            orderCode: {
              type: 'string',
              description: 'Mã đơn hàng cần tra cứu (ví dụ: "DK-12345").',
            },
          },
          required: ['orderCode'],
        },
      },
    ],
  },
];

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ChatbotService {
  constructor(
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Stream a reply for the given conversation history.
   * Calls onToken for each streamed chunk, onComplete when done, onError on failure.
   * Function-calling is resolved in a loop BEFORE streaming begins (so the
   * final answer streams naturally).
   */
  async streamReply(
    history: ChatMessage[],
    callbacks: {
      onToken: (token: string) => void;
      onComplete: () => void;
      onError: (err: any) => void;
    },
  ): Promise<void> {
    const apiKey = this.configService.get<string>('API_KEY_GEMINI')?.trim();
    const modelId = this.configService.get<string>('MODEL_ID')?.trim() || 'gemini-3.1-flash-lite';

    if (!apiKey) {
      callbacks.onError(new InternalServerErrorException('Gemini API key is not configured'));
      return;
    }

    const ai = new GoogleGenAI({ apiKey });

    // Mutable contents array — we extend it during the function-calling loop
    const contents: any[] = history.map((msg) => ({
      role: msg.role,
      parts: msg.parts,
    }));

    // ── Function-calling loop (non-streaming until final text turn) ────────
    const MAX_FC_LOOPS = 5;
    for (let loop = 0; loop < MAX_FC_LOOPS; loop++) {
      let response: any;
      try {
        response = await ai.models.generateContent({
          model: modelId,
          contents,
          config: {
            thinkingConfig: this.getThinkingConfig(modelId),
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: TOOLS as any,
          },
        });
      } catch (err) {
        console.error('Gemini generateContent error during function-call loop:', err);
        callbacks.onError(err);
        return;
      }

      const candidate = response?.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      const functionCallParts = parts.filter((p: any) => p.functionCall);

      if (functionCallParts.length === 0) {
        // No more function calls — now stream the final answer
        break;
      }

      // Execute all function calls
      console.log(`[Chatbot] Executing ${functionCallParts.length} function call(s)…`);

      // Add model turn with function calls to history.
      // IMPORTANT: preserve `thoughtSignature` on functionCall parts and pass
      // through `thought` parts as-is — required for Gemini thinking models.
      contents.push({
        role: 'model',
        parts: parts.map((p: any) => {
          if (p.functionCall) {
            const part: any = {
              functionCall: { name: p.functionCall.name, args: p.functionCall.args },
            };
            if (p.thoughtSignature) part.thoughtSignature = p.thoughtSignature;
            return part;
          }
          // thought parts must be passed through intact
          if (p.thought) return p;
          return { text: p.text || '' };
        }),
      });

      const functionResponseParts: any[] = [];
      for (const part of functionCallParts) {
        const { name, args } = part.functionCall;
        const result = await this.executeFunction(name, args);
        functionResponseParts.push({
          functionResponse: { name, response: { result } },
        });
      }

      contents.push({
        role: 'function',
        parts: functionResponseParts,
      });

      // Continue the loop to send back function results
    }

    // ── Streaming the final answer ─────────────────────────────────────────
    try {
      const stream = await ai.models.generateContentStream({
        model: modelId,
        contents,
        config: {
          thinkingConfig: this.getThinkingConfig(modelId),
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: TOOLS as any,
        },
      });

      for await (const chunk of stream) {
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          callbacks.onToken(text);
        }
      }

      callbacks.onComplete();
    } catch (err) {
      console.error('Gemini generateContentStream error:', err);
      callbacks.onError(err);
    }
  }

  // ─── Function executor ────────────────────────────────────────────────────

  private async executeFunction(name: string, args: any): Promise<any> {
    try {
      if (name === 'list_categories') {
        const categories = await this.categoriesService.listPublic();
        return { categories: categories.data };
      }

      if (name === 'search_products') {
        const query = {
          page: 1,
          limit: 10,
          search: args.search,
          categorySlug: args.categorySlug,
          minPrice: args.minPrice ? Number(args.minPrice) : undefined,
          maxPrice: args.maxPrice ? Number(args.maxPrice) : undefined,
          sort: (args.sort as ProductSort) || ProductSort.NEWEST,
        };
        const products = await this.productsService.listPublic(query);
        let items = products.data;
        if (args.inStockOnly) {
          items = items.filter((p) => (p.stockSummary?.quantity ?? 0) > 0);
        }
        return {
          total: products.pagination.total,
          products: items.map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            originalPrice: p.originalPrice,
            salePrice: p.salePrice,
            imageUrl: p.thumbnailMedia?.url || p.image?.media?.url || '',
            quantity: p.stockSummary?.quantity ?? 0,
          })),
        };
      }

      if (name === 'list_featured_products') {
        const type = args.type as 'featured' | 'best_seller' | 'new_arrival';
        const limit = Math.min(Number(args.limit) || 6, 12);
        const query = {
          page: 1,
          limit,
          sort: type === 'new_arrival' ? ProductSort.NEWEST : ProductSort.NEWEST,
          isFeatured: type === 'featured' ? true : undefined,
          isBestSeller: type === 'best_seller' ? true : undefined,
          isNewArrival: type === 'new_arrival' ? true : undefined,
        };
        const products = await this.productsService.listPublic(query);
        const typeLabel =
          type === 'featured' ? 'nổi bật' :
          type === 'best_seller' ? 'bán chạy nhất' : 'mới về';
        return {
          type,
          typeLabel,
          total: products.pagination.total,
          products: products.data.map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            originalPrice: p.originalPrice,
            salePrice: p.salePrice,
            imageUrl: p.thumbnailMedia?.url || p.image?.media?.url || '',
            quantity: p.stockSummary?.quantity ?? 0,
          })),
        };
      }

      if (name === 'recommend_products') {
        // Approach A: AI đã phân tích ngữ cảnh và cung cấp keywords
        // Backend thực hiện full-text search với các keywords đó
        const keywords = (args.keywords || '').trim();
        const query = {
          page: 1,
          limit: 8,
          search: keywords,
          categorySlug: args.categorySlug,
          minPrice: args.minPrice ? Number(args.minPrice) : undefined,
          maxPrice: args.maxPrice ? Number(args.maxPrice) : undefined,
          sort: ProductSort.NEWEST,
        };
        const products = await this.productsService.listPublic(query);

        // Nếu search theo keywords không đủ kết quả, thử tìm rộng hơn không có keyword
        let items = products.data;
        if (items.length < 3 && keywords) {
          const fallbackResult = await this.productsService.listPublic({
            page: 1,
            limit: 8,
            categorySlug: args.categorySlug,
            minPrice: args.minPrice ? Number(args.minPrice) : undefined,
            maxPrice: args.maxPrice ? Number(args.maxPrice) : undefined,
            sort: ProductSort.NEWEST,
          });
          items = fallbackResult.data;
        }

        return {
          keywords,
          context: args.context || '',
          total: items.length,
          products: items.map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            originalPrice: p.originalPrice,
            salePrice: p.salePrice,
            imageUrl: p.thumbnailMedia?.url || p.image?.media?.url || '',
            quantity: p.stockSummary?.quantity ?? 0,
          })),
        };
      }

      if (name === 'get_product_detail') {
        const product = await this.productsService.getPublicBySlug(args.slug);
        let variants: any[] = [];
        try {
          const variantResult = await this.productsService.listPublicVariantsBySlug(args.slug);
          variants = variantResult.data || [];
        } catch (e) {
          console.error(`Failed to load variants for product slug ${args.slug}:`, e);
        }
        const quantity =
          product.inventory?.quantity ??
          (variants.length > 0
            ? variants.reduce((sum, v) => sum + (v.inventory?.quantity || 0), 0)
            : 0);
        return {
          product: {
            id: product.id,
            name: product.name,
            slug: product.slug,
            originalPrice: product.originalPrice,
            salePrice: product.salePrice,
            imageUrl: product.thumbnailMedia?.url || product.images?.[0]?.media?.url || '',
            quantity,
          },
          variants: variants.map((v) => ({
            id: v.id,
            name: v.name,
            sku: v.sku,
            sizeLabel: v.sizeLabel,
            price: v.price,
            salePrice: v.salePrice,
            quantity: v.inventory?.quantity ?? 0,
          })),
        };
      }

      if (name === 'check_order_status') {
        const order = await this.prisma.order.findUnique({
          where: { code: args.orderCode },
          include: { items: true },
        });

        if (!order) {
          return {
            error: `Không tìm thấy đơn hàng với mã ${args.orderCode}. Quý khách vui lòng kiểm tra lại.`,
          };
        }

        return {
          order: {
            code: order.code,
            status: order.status,
            paymentStatus: order.paymentStatus,
            shippingStatus: order.shippingStatus,
            customerName: order.customerName,
            grandTotal: order.grandTotal,
            createdAt: order.createdAt,
            items: order.items.map((item) => ({
              productName: item.productName,
              variantName: item.variantName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          },
        };
      }


      console.warn(`[Chatbot] Unknown function call name: ${name}`);
      return { error: 'Unknown function call' };
    } catch (err) {
      console.error(`[Chatbot] Error executing function ${name}:`, err);
      return { error: err.message || 'Internal error executing function' };
    }
  }

  private getThinkingConfig(modelId: string): any {
    const normalizedModel = (modelId || '').toLowerCase();
    
    // Tìm version của model, ví dụ: "gemini-3.1-flash-lite" -> 3.1
    const match = normalizedModel.match(/gemini-(\d+(\.\d+)?)/);
    if (match) {
      const version = parseFloat(match[1]);
      if (version >= 3) {
        return {
          thinkingLevel: ThinkingLevel.LOW,
        };
      }
    }
    
    return {
      thinkingBudget: 1024,
    };
  }
}
