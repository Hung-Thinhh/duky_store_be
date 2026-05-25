import Redis from 'ioredis';

async function testRedis() {
  const url = 'redis://default:wzakyepigjffjx7a@149.56.44.22:5402';
  console.log('Đang cố gắng kết nối tới Redis:', url);
  
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000, // 5 giây timeout
  });

  try {
    const pingResult = await redis.ping();
    console.log('✅ KẾT NỐI THÀNH CÔNG RỰC RỠ!');
    console.log('PING Response:', pingResult);
    
    // Thử ghi và đọc một key nháp
    await redis.set('test_gemini_key', 'Hello Duky Store!', 'EX', 10);
    const val = await redis.get('test_gemini_key');
    console.log('Đọc ghi dữ liệu thử nghiệm:', val === 'Hello Duky Store!' ? 'SUCCESS' : 'FAILED');
  } catch (error: any) {
    console.error('❌ KẾT NỐI THẤT BẠI!');
    console.error('Chi tiết lỗi:', {
      message: error.message,
      code: error.code,
      syscall: error.syscall,
      address: error.address,
      port: error.port
    });
  } finally {
    redis.disconnect();
  }
}

testRedis();
