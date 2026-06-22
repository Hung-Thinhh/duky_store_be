import { Controller, Post, Body, Res, HttpCode, UsePipes, ValidationPipe } from '@nestjs/common';

import { Response } from 'express';
import { ChatbotService, ChatMessage } from './chatbot.service';

interface ChatStreamBody {
  text?: string;
  history?: ChatMessage[];
  imageBase64?: string;
  imageMimeType?: string;
}

// ── Local quick-reply lookup (instant < 5ms, no AI call needed) ──────────────
const QUICK_REPLIES: Record<string, string> = {
  'thông tin cửa hàng': `📍 **Địa chỉ cửa hàng**: 122 Nguyễn Hiền, KDC 91B, P. An Khánh, Q. Ninh Kiều, TP. Cần Thơ (hoặc P. Tân An, TP. Cần Thơ).\n📞 **Hotline / Zalo**: 0939.654.574\n📧 **Email**: dukystore.info@gmail.com\n\n[action-button:📍 Xem bản đồ|https://www.google.com/maps/place/122+%C4%90.+Nguy%E1%BB%85n+Hi%E1%BB%81n,+Khu+d%C3%A2n+c%C6%B0+91B,+T%C3%A2n+An,+C%E1%BA%A7n+Th%C6%A1+94000,+Vietnam/@10.023035,105.755797,1823m/data=!3m1!1e3!4m6!3m5!1s0x31a088487f863ae3:0x704afb4eb3949570!8m2!3d10.0230345!4d105.7557973!16s%2Fg%2F11sp94nd66?hl=vi] [action-button:💬 Nhắn Zalo/SĐT|https://zalo.me/0939654574] [action-button:📧 mail|https://mail.google.com/mail/u/0/?to=dukystore.info@gmail.com&fs=1&tf=cm]`,

  'hướng dẫn chọn size': `👟 **Hướng dẫn chọn size giày boot tại Duky Store**:\n\n1. Đặt một tờ giấy A4 xuống sàn và đặt bàn chân lên giấy.\n2. Dùng bút giữ thẳng đứng và vẽ theo viền bàn chân.\n3. Dùng thước đo: từ điểm cuối gót chân đến đầu ngón dài nhất.\n\n**Lưu ý**. Đây chỉ là cách thông thường để biết được size giày boot của bạn, không đảm bảo 100% chính xác, vui lòng liên hệ với cửa hàng để được tư vấn thêm hoặc bạn có thể đến trực tiếp cửa hàng để thử giày.`,

  'danh mục sản phẩm': `📁 **Các danh mục sản phẩm nổi bật tại cửa hàng**:\n- **Giày Boot Nam**: Có nhiều mẫu boot nam cao cấp, đa dạng về mẫu mã và màu sắc, cập nhật theo xu hướng\n- **Giày Boot Nữ**: cá tính, sang trọng, tôn dáng cùng nhiều mẫu mã đa dạng\n- **Phụ kiện**: Có nhiều phụ kiện thời trang độc đáo, phù hợp với mọi phong cách\n- **Unisex**: Có đa dạng mẫu mã cho cả nam và nữ\n\n[action-button:🛍️ Xem sản phẩm|/san-pham]`,

  'hướng dẫn mua hàng trên web': `🛍️ **Hướng dẫn các bước đặt mua hàng trực tuyến**:\n1. Chọn sản phẩm với màu sắc và size phù hợp, nhấp **Thêm vào giỏ hàng** hoặc **Mua ngay**.\n2. Điền đầy đủ thông tin giao nhận hàng (Họ tên, SĐT, Địa chỉ).\n3. Chọn phương thức thanh toán thích hợp (Ship COD - nhận hàng thanh toán hoặc Chuyển khoản).\n4. Xác nhận đặt hàng và theo dõi hành trình đơn hàng.\n\n[action-button:🚚 Đăng ký để theo dõi đơn hàng|/tai-khoan/don-hang]`,
};

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  /**
   * POST /api/v1/chatbot/stream
   * Returns a Server-Sent Events (SSE) stream.
   * Each token is: data: {"token":"..."}\n\n
   * End signal:    data: [DONE]\n\n
   * Error signal:  data: {"error":"..."}\n\n
   *
   * Body:
   *   text?         – user text message
   *   history?      – previous conversation turns
   *   imageBase64?  – base64-encoded image (no data-url prefix)
   *   imageMimeType?– MIME type of the image (image/jpeg | image/png | image/webp | image/gif)
   */
  @Post('stream')
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ transform: false, whitelist: false, forbidNonWhitelisted: false }))
  async streamChat(@Body() body: ChatStreamBody, @Res() res: Response) {
    const text = (body.text ?? '').trim();
    const history: ChatMessage[] = body.history ?? [];
    const hasImage =
      !!body.imageBase64 &&
      !!body.imageMimeType &&
      ALLOWED_IMAGE_TYPES.includes(body.imageMimeType.toLowerCase());

    // ── SSE headers ──────────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data: string) => res.write(`data: ${data}\n\n`);
    const done = () => {
      send('[DONE]');
      res.end();
    };

    // ── Quick reply — skip when image is attached ─────────────────────────────
    if (!hasImage && text) {
      const quickReply = QUICK_REPLIES[text.toLowerCase()];
      if (quickReply) {
        send(JSON.stringify({ token: quickReply }));
        done();
        return;
      }
    }

    // ── Build user message parts (text + optional image) ─────────────────────
    const userParts: ChatMessage['parts'] = [];

    if (hasImage) {
      // Add default prompt if user sent only an image with no text
      userParts.push({ text: text || 'Hãy phân tích ảnh này và gợi ý sản phẩm phù hợp trong cửa hàng.' });
      userParts.push({
        inlineData: {
          mimeType: body.imageMimeType!.toLowerCase(),
          data: body.imageBase64!,
        },
      });
    } else {
      userParts.push({ text });
    }

    // ── Build full history including the new user message ─────────────────────
    const fullHistory: ChatMessage[] = [
      ...history,
      { role: 'user', parts: userParts },
    ];

    // ── Stream via Gemini ─────────────────────────────────────────────────────
    await this.chatbotService.streamReply(fullHistory, {
      onToken: (token: string) => send(JSON.stringify({ token })),
      onComplete: () => done(),
      onError: (err: any) => {
        console.error('[ChatbotController] streamReply error:', err);
        send(JSON.stringify({ error: err?.message ?? 'Đã xảy ra lỗi, vui lòng thử lại.' }));
        res.end();
      },
    });
  }
}
