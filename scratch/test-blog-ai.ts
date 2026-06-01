import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BlogAiService } from '../src/modules/blog/blog-ai.service';
import { BlogAiTask, BlogAiBlockType } from '../src/modules/blog/dto/blog-ai-assist.dto';

async function bootstrap() {
  console.log('🚀 Booting up NestJS Context...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const blogAiService = app.get(BlogAiService);

  console.log('\n--- 🤖 Đang Test Tính năng AI viết Block (Blog) ---');
  console.log('Yêu cầu: "Viết cho tôi một đoạn mở bài ngắn (intro) thật cuốn hút nói về xu hướng giày boot nam mùa đông."\n');

  try {
    const blockRes = await blogAiService.assistBlock({
      instruction: 'Viết cho tôi một đoạn mở bài ngắn (intro) thật cuốn hút nói về xu hướng giày boot nam mùa đông.',
      blockType: BlogAiBlockType.CONTENT,
      blockHtml: '',
      articleTitle: 'Top giày boot nam hot nhất mùa đông',
      articleType: 'blog_post',
      tone: 'tư vấn chuyên gia, gần gũi',
    });
    
    console.log('✅ KẾT QUẢ TỪ AI:');
    console.log('----------------------------------------------------');
    console.dir(blockRes, { depth: null, colors: true });
    console.log('----------------------------------------------------');
  } catch (error: any) {
    console.error('❌ Lỗi:', error.message);
  }

  await app.close();
  console.log('\n👋 Done!');
}

bootstrap();
