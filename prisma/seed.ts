import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { NotificationChannel, PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

const roleNames = [
  'SUPER_ADMIN',
  'ADMIN',
  'STAFF',
  'CONTENT_EDITOR',
  'ORDER_MANAGER',
] as const;

const subjects = [
  'dashboard',
  'users',
  'roles',
  'permissions',
  'products',
  'categories',
  'tags',
  'variants',
  'inventory',
  'media',
  'orders',
  'payments',
  'shipping',
  'customers',
  'coupons',
  'reviews',
  'wishlist',
  'blog',
  'pages',
  'homepage',
  'contacts',
  'seo',
  'redirects',
  'migration',
  'notifications',
  'analytics',
  'settings',
] as const;

const actions = [
  'read',
  'create',
  'update',
  'delete',
  'manage',
  'export',
] as const;

const rolePermissionRules: Record<(typeof roleNames)[number], string[]> = {
  SUPER_ADMIN: ['*'],
  ADMIN: ['*'],
  STAFF: [
    'dashboard.read',
    'products.read',
    'categories.read',
    'tags.read',
    'inventory.read',
    'media.read',
    'orders.read',
    'orders.update',
    'orders.export',
    'payments.read',
    'shipping.read',
    'shipping.update',
    'customers.read',
    'contacts.read',
    'contacts.update',
  ],
  CONTENT_EDITOR: [
    'dashboard.read',
    'products.read',
    'categories.read',
    'tags.read',
    'media.manage',
    'blog.manage',
    'pages.manage',
    'homepage.manage',
    'seo.read',
    'seo.update',
    'redirects.read',
  ],
  ORDER_MANAGER: [
    'dashboard.read',
    'products.read',
    'products.update',
    'media.manage',
    'inventory.read',
    'inventory.update',
    'orders.manage',
    'orders.export',
    'payments.manage',
    'shipping.manage',
    'customers.read',
    'customers.update',
    'contacts.read',
  ],
};

const settings = [
  {
    key: 'site.name',
    group: 'site',
    value: 'Duky Store',
    valueType: 'STRING',
    isPublic: true,
    description: 'Tên website',
  },
  {
    key: 'site.currency',
    group: 'site',
    value: 'VND',
    valueType: 'STRING',
    isPublic: true,
    description: 'Đơn vị tiền tệ',
  },
  {
    key: 'site.logo',
    group: 'site',
    value: '',
    valueType: 'IMAGE',
    isPublic: true,
    description: 'Logo website',
  },
  {
    key: 'site.favicon',
    group: 'site',
    value: '',
    valueType: 'IMAGE',
    isPublic: true,
    description: 'Favicon website',
  },
  {
    key: 'contact.hotline',
    group: 'contact',
    value: '',
    valueType: 'STRING',
    isPublic: true,
    description: 'Hotline',
  },
  {
    key: 'contact.email',
    group: 'contact',
    value: '',
    valueType: 'STRING',
    isPublic: true,
    description: 'Email liên hệ',
  },
  {
    key: 'social.zalo',
    group: 'social',
    value: '',
    valueType: 'STRING',
    isPublic: true,
    description: 'Link Zalo',
  },
  {
    key: 'social.facebook',
    group: 'social',
    value: '',
    valueType: 'STRING',
    isPublic: true,
    description: 'Link Facebook',
  },
  {
    key: 'social.tiktok',
    group: 'social',
    value: '',
    valueType: 'STRING',
    isPublic: true,
    description: 'Link TikTok',
  },
  {
    key: 'social.shopee',
    group: 'social',
    value: '',
    valueType: 'STRING',
    isPublic: true,
    description: 'Link Shopee',
  },
  {
    key: 'shipping.default_fee',
    group: 'shipping',
    value: 30000,
    valueType: 'NUMBER',
    isPublic: true,
    description: 'Phí ship mặc định',
  },
  {
    key: 'shipping.free_threshold',
    group: 'shipping',
    value: 1000000,
    valueType: 'NUMBER',
    isPublic: true,
    description: 'Ngưỡng freeship',
  },
  {
    key: 'system.maintenance_mode',
    group: 'system',
    value: false,
    valueType: 'BOOLEAN',
    isPublic: true,
    description: 'Bật/tắt bảo trì website',
  },
  {
    key: 'storage.provider',
    group: 'integration',
    value: 'cloudinary',
    valueType: 'STRING',
    isPublic: false,
    description: 'Nhà cung cấp lưu trữ media',
  },
  {
    key: 'mail.from',
    group: 'notification',
    value: 'Duky Store <no-reply@dukystore.local>',
    valueType: 'STRING',
    isPublic: false,
    description: 'Email gửi mặc định',
  },
  {
    key: 'seo.default_title',
    group: 'seo',
    value: 'Duky Store',
    valueType: 'STRING',
    isPublic: true,
    description: 'Meta title mặc định',
  },
  {
    key: 'seo.default_description',
    group: 'seo',
    value: 'Duky Store - thời trang và giày boot.',
    valueType: 'STRING',
    isPublic: true,
    description: 'Meta description mặc định',
  },
  {
    key: 'search.synonyms',
    group: 'search',
    value: {
      'giày': ['boot', 'bốt', 'giày boot'],
      'boot': ['giày', 'giày boot', 'bốt'],
      'sandal': ['dép', 'dép sandal'],
      'dép': ['sandal', 'dép sandal'],
      'túi': ['bag', 'ví'],
      'bag': ['túi', 'ví'],
      'ví': ['túi', 'bag'],
      'áo khoác': ['jacket', 'áo jacket'],
      'jacket': ['áo khoác', 'áo jacket'],
      'đi chơi': ['dạo phố', 'đi dạo'],
      'dạo phố': ['đi chơi', 'đi dạo'],
      'công sở': ['đi làm', 'văn phòng'],
      'đi làm': ['công sở', 'văn phòng'],
      'tết': ['xuân', 'ngày tết', 'năm mới'],
      'xuân': ['tết', 'ngày tết', 'năm mới'],
      'da': ['leather', 'da thật'],
      'leather': ['da', 'da thật'],
    },
    valueType: 'JSON',
    isPublic: false,
    description: 'Từ đồng nghĩa cho tìm kiếm thông minh',
  },
] as const;

const orderConfirmationBody = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Xác nhận đơn hàng {{orderCode}}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0ece8;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0ece8;padding:40px 20px;">
  <tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <tr>
      <td style="background:#0f1923;padding:36px 48px;text-align:center;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
          <tr><td style="border:1px solid rgba(201,169,110,0.45);padding:6px 22px;border-radius:3px;"><span style="color:#c9a96e;font-size:11px;letter-spacing:5px;font-weight:700;text-transform:uppercase;">DUKY STORE</span></td></tr>
        </table>
        <p style="color:rgba(255,255,255,0.45);font-size:10px;letter-spacing:3px;margin:0;text-transform:uppercase;">Thời Trang &amp; Phong Cách</p>
      </td>
    </tr>
    <tr>
      <td style="padding:44px 48px 32px;text-align:center;background:#faf8f5;border-bottom:1px solid #ede8e3;">
        <table role="presentation" width="68" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;"><tr><td style="width:68px;height:68px;background:#0f1923;border-radius:50%;text-align:center;vertical-align:middle;"><span style="color:#c9a96e;font-size:30px;line-height:1;">&#10003;</span></td></tr></table>
        <h1 style="color:#0f1923;font-size:24px;font-weight:700;margin:0 0 12px;">Đặt hàng thành công!</h1>
        <p style="color:#666;font-size:15px;margin:0;line-height:1.65;">Cảm ơn <strong style="color:#0f1923;">{{customerName}}</strong>, đơn hàng của bạn đã được ghi nhận.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 48px;background:#faf8f5;border-bottom:2px solid #ede8e3;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#0f1923;border-radius:12px;padding:22px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><p style="color:rgba(201,169,110,0.65);font-size:10px;text-transform:uppercase;letter-spacing:2px;margin:0 0 5px;font-weight:600;">Mã đơn hàng</p><p style="color:#ffffff;font-size:24px;font-weight:700;margin:0;letter-spacing:1.5px;">{{orderCode}}</p></td><td style="text-align:right;vertical-align:middle;"><p style="color:rgba(255,255,255,0.45);font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:0 0 5px;">Ngày đặt</p><p style="color:rgba(255,255,255,0.85);font-size:13px;font-weight:500;margin:0;">{{orderDate}}</p></td></tr></table></td></tr></table>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 48px 0;">
        <p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2.5px;font-weight:700;margin:0 0 16px;">Sản phẩm đặt mua</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ede8e3;border-radius:10px;overflow:hidden;">
          <tr style="background:#0f1923;"><th style="color:#c9a96e;font-size:10px;font-weight:600;padding:12px 16px;text-align:left;text-transform:uppercase;letter-spacing:1.5px;">Sản phẩm</th><th style="color:#c9a96e;font-size:10px;font-weight:600;padding:12px 10px;text-align:center;text-transform:uppercase;letter-spacing:1.5px;width:36px;">SL</th><th style="color:#c9a96e;font-size:10px;font-weight:600;padding:12px 16px;text-align:right;text-transform:uppercase;letter-spacing:1.5px;white-space:nowrap;">Thành tiền</th></tr>
          {{itemsHtml}}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 48px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="color:#888;font-size:14px;padding:6px 0;border-bottom:1px solid #f0ece8;">Tạm tính</td><td style="color:#444;font-size:14px;text-align:right;padding:6px 0;border-bottom:1px solid #f0ece8;">{{subtotal}}&nbsp;₫</td></tr>
          <tr><td style="color:#888;font-size:14px;padding:6px 0;border-bottom:1px solid #f0ece8;">Phí vận chuyển</td><td style="color:#444;font-size:14px;text-align:right;padding:6px 0;border-bottom:1px solid #f0ece8;">{{shippingFee}}</td></tr>
          <tr><td style="color:#0f1923;font-size:17px;font-weight:700;padding:16px 0 8px;">Tổng cộng</td><td style="color:#c9a96e;font-size:22px;font-weight:700;text-align:right;padding:16px 0 8px;">{{grandTotal}}&nbsp;₫</td></tr>
        </table>
      </td>
    </tr>
    <tr><td style="padding:0 48px;"><div style="height:1px;background:#ede8e3;"></div></td></tr>
    <tr>
      <td style="padding:28px 48px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="47%" style="vertical-align:top;"><p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin:0 0 12px;">Địa chỉ giao hàng</p><p style="color:#555;font-size:14px;line-height:1.75;margin:0;">{{shippingAddress}}</p></td><td width="6%"></td><td width="47%" style="vertical-align:top;border-left:1px solid #ede8e3;padding-left:24px;"><p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin:0 0 12px;">Thanh toán</p><p style="color:#555;font-size:14px;line-height:1.75;margin:0;">{{paymentMethod}}</p></td></tr></table>
      </td>
    </tr>
    {{customerNoteHtml}}
    <tr>
      <td style="background:#0f1923;padding:32px 48px;text-align:center;">
        <p style="color:#c9a96e;font-size:12px;font-weight:700;margin:0 0 10px;letter-spacing:3px;text-transform:uppercase;">Duky Store</p>
        <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;line-height:1.9;">Nếu bạn có bất kỳ thắc mắc nào, vui lòng liên hệ chúng tôi qua email hoặc hotline.<br>Cảm ơn bạn đã tin tưởng mua sắm tại Duky Store!</p>
      </td>
    </tr>
  </table>
  </td></tr>
</table>
</body>
</html>`;

const orderAdminNotificationBody = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Đơn hàng mới: {{orderCode}}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0ece8;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0ece8;padding:40px 20px;">
  <tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <tr>
      <td style="background:#0f1923;padding:36px 48px 28px;text-align:center;">
        <p style="color:rgba(201,169,110,0.55);font-size:10px;letter-spacing:4px;margin:0 0 18px;text-transform:uppercase;font-weight:600;">Duky Store &mdash; Quản trị</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 12px;"><tr><td style="background:rgba(201,169,110,0.12);border:1px solid rgba(201,169,110,0.5);border-radius:8px;padding:12px 28px;text-align:center;"><span style="color:#c9a96e;font-size:20px;font-weight:700;letter-spacing:1px;">&#128717; ĐƠN HÀNG MỚI</span></td></tr></table>
        <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0;">Vui lòng xác nhận và xử lý đơn hàng</p>
      </td>
    </tr>
    <tr>
      <td style="background:#faf8f5;padding:20px 48px;border-bottom:2px solid #ede8e3;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><p style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:2px;margin:0 0 4px;font-weight:600;">Mã đơn hàng</p><p style="color:#0f1923;font-size:26px;font-weight:700;margin:0;letter-spacing:1px;">{{orderCode}}</p></td><td style="text-align:right;vertical-align:middle;"><p style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 4px;font-weight:600;">Thời gian đặt</p><p style="color:#0f1923;font-size:14px;font-weight:600;margin:0;">{{orderDate}}</p></td></tr></table>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 48px 0;">
        <p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2.5px;font-weight:700;margin:0 0 16px;">Thông tin khách hàng</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;border-radius:10px;border:1px solid #ede8e3;overflow:hidden;">
          <tr><td style="padding:12px 20px;border-bottom:1px solid #ede8e3;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#888;font-size:12px;width:110px;vertical-align:middle;">Họ tên</td><td style="color:#0f1923;font-size:14px;font-weight:600;">{{customerName}}</td></tr></table></td></tr>
          <tr><td style="padding:12px 20px;border-bottom:1px solid #ede8e3;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#888;font-size:12px;width:110px;vertical-align:middle;">Điện thoại</td><td style="color:#0f1923;font-size:14px;font-weight:600;">{{customerPhone}}</td></tr></table></td></tr>
          <tr><td style="padding:12px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#888;font-size:12px;width:110px;vertical-align:middle;">Email</td><td style="color:#0f1923;font-size:14px;font-weight:600;">{{customerEmail}}</td></tr></table></td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 48px 0;">
        <p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2.5px;font-weight:700;margin:0 0 16px;">Chi tiết sản phẩm</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ede8e3;border-radius:10px;overflow:hidden;">
          <tr style="background:#0f1923;"><th style="color:#c9a96e;font-size:10px;font-weight:600;padding:12px 16px;text-align:left;text-transform:uppercase;letter-spacing:1.5px;">Sản phẩm</th><th style="color:#c9a96e;font-size:10px;font-weight:600;padding:12px 10px;text-align:center;text-transform:uppercase;letter-spacing:1.5px;width:36px;">SL</th><th style="color:#c9a96e;font-size:10px;font-weight:600;padding:12px 16px;text-align:right;text-transform:uppercase;letter-spacing:1.5px;white-space:nowrap;">Thành tiền</th></tr>
          {{itemsHtml}}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 48px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="46%" style="vertical-align:top;padding-right:20px;"><p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin:0 0 12px;">Địa chỉ giao hàng</p><p style="color:#555;font-size:13px;line-height:1.75;margin:0 0 20px;">{{shippingAddress}}</p><p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin:0 0 8px;">Thanh toán</p><p style="color:#555;font-size:13px;line-height:1.75;margin:0;">{{paymentMethod}}</p></td>
          <td width="8%" style="border-left:1px solid #ede8e3;"></td>
          <td width="46%" style="vertical-align:top;padding-left:20px;"><p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin:0 0 12px;">Tổng đơn hàng</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#888;font-size:13px;padding:5px 0;border-bottom:1px solid #f0ece8;">Tạm tính</td><td style="color:#333;font-size:13px;text-align:right;padding:5px 0;border-bottom:1px solid #f0ece8;">{{subtotal}}&nbsp;₫</td></tr><tr><td style="color:#888;font-size:13px;padding:5px 0;border-bottom:1px solid #f0ece8;">Phí ship</td><td style="color:#333;font-size:13px;text-align:right;padding:5px 0;border-bottom:1px solid #f0ece8;">{{shippingFee}}</td></tr><tr><td colspan="2" style="padding:4px 0;"><div style="border-top:2px solid #0f1923;margin:8px 0;"></div></td></tr><tr><td style="color:#0f1923;font-size:14px;font-weight:700;padding:4px 0;">Tổng cộng</td><td style="color:#c9a96e;font-size:20px;font-weight:700;text-align:right;padding:4px 0;">{{grandTotal}}&nbsp;₫</td></tr></table></td>
        </tr></table>
      </td>
    </tr>
    {{customerNoteHtml}}
    <tr>
      <td style="padding:28px 48px 36px;text-align:center;">
        <p style="color:#0f1923;font-size:13px;margin:0 0 20px;line-height:1.6;">
          Truy cập trang quản trị để xem chi tiết và xác nhận đơn hàng <strong>{{orderCode}}</strong>.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr>
            <td style="border-radius:8px;background:#0f1923;">
              <a href="https://admin.dukystore.com/orders"
                 target="_blank"
                 style="display:inline-block;padding:14px 36px;font-size:14px;font-weight:700;color:#c9a96e;text-decoration:none;letter-spacing:1.5px;text-transform:uppercase;border-radius:8px;border:2px solid #c9a96e;">
                &#9998;&nbsp; Duyệt đơn hàng
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="background:#0f1923;padding:24px 48px;text-align:center;">
        <p style="color:#c9a96e;font-size:11px;font-weight:700;margin:0 0 6px;letter-spacing:3px;text-transform:uppercase;">Duky Store Admin</p>
        <p style="color:rgba(255,255,255,0.35);font-size:11px;margin:0;">Email tự động từ hệ thống &mdash; Vui lòng không trả lời email này.</p>
      </td>
    </tr>
  </table>
  </td></tr>
</table>
</body>
</html>`;

const notificationTemplates = [
  {
    key: 'order.confirmation',
    channel: NotificationChannel.EMAIL,
    subject: 'Duky Store - Xác nhận đơn hàng {{orderCode}}',
    body: orderConfirmationBody,
    variables: ['customerName', 'orderCode', 'orderDate', 'itemsHtml', 'subtotal', 'shippingFee', 'discountTotal', 'grandTotal', 'shippingAddress', 'paymentMethod', 'customerNoteHtml'],
  },
  {
    key: 'order.admin_notification',
    channel: NotificationChannel.EMAIL,
    subject: 'Duky Store - Đơn hàng mới {{orderCode}}',
    body: orderAdminNotificationBody,
    variables: ['orderCode', 'orderDate', 'customerName', 'customerPhone', 'customerEmail', 'itemsHtml', 'subtotal', 'shippingFee', 'discountTotal', 'grandTotal', 'shippingAddress', 'paymentMethod', 'customerNoteHtml'],
  },
  {
    key: 'order.status_update',
    channel: NotificationChannel.EMAIL,
    subject: 'Cập nhật đơn hàng {{orderCode}}',
    body: 'Đơn hàng {{orderCode}} hiện đang ở trạng thái {{orderStatus}}.',
    variables: ['orderCode', 'orderStatus'],
  },
  {
    key: 'contact.admin_notification',
    channel: NotificationChannel.EMAIL,
    subject: 'Liên hệ mới từ {{fullName}}',
    body: '{{fullName}} vừa gửi liên hệ mới: {{message}}',
    variables: ['fullName', 'message'],
  },
];

function permissionKey(action: string, subject: string) {
  return `${subject}.${action}`;
}

function canAssign(rule: string[], action: string, subject: string) {
  return (
    rule.includes('*') ||
    rule.includes(permissionKey(action, subject)) ||
    rule.includes(`${subject}.manage`)
  );
}

async function seedRolesAndPermissions() {
  const roles = new Map<string, string>();
  const permissions = new Map<string, string>();

  for (const name of roleNames) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {
        description: `${name} role`,
        isSystem: true,
      },
      create: {
        name,
        description: `${name} role`,
        isSystem: true,
      },
    });
    roles.set(name, role.id);
  }

  for (const subject of subjects) {
    for (const action of actions) {
      const permission = await prisma.permission.upsert({
        where: {
          action_subject: {
            action,
            subject,
          },
        },
        update: {
          description: `${action} ${subject}`,
        },
        create: {
          action,
          subject,
          description: `${action} ${subject}`,
        },
      });
      permissions.set(permissionKey(action, subject), permission.id);
    }
  }

  for (const roleName of roleNames) {
    const roleId = roles.get(roleName);
    if (!roleId) {
      continue;
    }

    const rule = rolePermissionRules[roleName];
    for (const subject of subjects) {
      for (const action of actions) {
        if (!canAssign(rule, action, subject)) {
          continue;
        }

        const permissionId = permissions.get(permissionKey(action, subject));
        if (!permissionId) {
          continue;
        }

        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId,
              permissionId,
            },
          },
          update: {},
          create: {
            roleId,
            permissionId,
          },
        });
      }
    }
  }

  return roles;
}

async function seedSuperAdmin(roles: Map<string, string>) {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@dukystore.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123456';
  const fullName = process.env.SEED_ADMIN_FULL_NAME ?? 'Duky Super Admin';
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fullName,
      status: 'ACTIVE',
    },
    create: {
      email,
      fullName,
      passwordHash,
      status: 'ACTIVE',
    },
  });

  const superAdminRoleId = roles.get('SUPER_ADMIN');
  if (superAdminRoleId) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: superAdminRoleId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: superAdminRoleId,
      },
    });
  }

  return user;
}

async function seedSettings() {
  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {
        group: setting.group,
        value: setting.value,
        valueType: setting.valueType,
        isPublic: setting.isPublic,
        description: setting.description,
      },
      create: {
        key: setting.key,
        group: setting.group,
        value: setting.value,
        valueType: setting.valueType,
        isPublic: setting.isPublic,
        description: setting.description,
      },
    });
  }
}

async function seedPaymentAndShipping() {
  await prisma.bankAccount.upsert({
    where: { id: 'seed_default_bank_account' },
    update: {
      bankName: 'Demo Bank',
      accountName: 'DUKY STORE',
      accountNumber: '0000000000',
      isDefault: true,
      isActive: true,
    },
    create: {
      id: 'seed_default_bank_account',
      bankName: 'Demo Bank',
      accountName: 'DUKY STORE',
      accountNumber: '0000000000',
      isDefault: true,
      isActive: true,
    },
  });

  await prisma.shippingZone.upsert({
    where: { id: 'seed_vietnam_shipping_zone' },
    update: {
      name: 'Vietnam',
      provinces: [],
      isActive: true,
    },
    create: {
      id: 'seed_vietnam_shipping_zone',
      name: 'Vietnam',
      provinces: [],
      isActive: true,
    },
  });

  await prisma.shippingRate.upsert({
    where: { id: 'seed_default_shipping_rate' },
    update: {
      zoneId: 'seed_vietnam_shipping_zone',
      name: 'Phí ship mặc định',
      fee: 30000,
      freeShippingThreshold: 1000000,
      isDefault: true,
      isActive: true,
    },
    create: {
      id: 'seed_default_shipping_rate',
      zoneId: 'seed_vietnam_shipping_zone',
      name: 'Phí ship mặc định',
      fee: 30000,
      freeShippingThreshold: 1000000,
      isDefault: true,
      isActive: true,
    },
  });
}

async function seedSeoAndNotifications() {
  await prisma.robotsRule.upsert({
    where: { id: 'seed_robots_allow_all' },
    update: {
      userAgent: '*',
      rule: 'Allow',
      path: '/',
      isActive: true,
    },
    create: {
      id: 'seed_robots_allow_all',
      userAgent: '*',
      rule: 'Allow',
      path: '/',
      isActive: true,
    },
  });

  await prisma.sitemapEntry.upsert({
    where: { url: '/' },
    update: {
      entityType: 'HOMEPAGE',
      priority: 1,
      changefreq: 'daily',
      isActive: true,
    },
    create: {
      url: '/',
      entityType: 'HOMEPAGE',
      priority: 1,
      changefreq: 'daily',
      isActive: true,
    },
  });

  for (const template of notificationTemplates) {
    await prisma.notificationTemplate.upsert({
      where: { key: template.key },
      update: {
        channel: template.channel,
        subject: template.subject,
        body: template.body,
        variables: template.variables,
        isActive: true,
      },
      create: {
        key: template.key,
        channel: template.channel,
        subject: template.subject,
        body: template.body,
        variables: template.variables,
        isActive: true,
      },
    });
  }
}

async function main() {
  const roles = await seedRolesAndPermissions();
  const superAdmin = await seedSuperAdmin(roles);
  await seedSettings();
  await seedPaymentAndShipping();
  await seedSeoAndNotifications();

  console.log('Seed completed');
  console.log(`Super admin: ${superAdmin.email}`);
  console.log(
    `Default password: ${process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123456'}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
