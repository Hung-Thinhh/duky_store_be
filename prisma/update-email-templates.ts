import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ─── HTML Templates ───────────────────────────────────────────────────────────

const customerConfirmationTemplate = `<!DOCTYPE html>
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

    <!-- HEADER -->
    <tr>
      <td style="background:#0f1923;padding:36px 48px;text-align:center;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
          <tr>
            <td style="border:1px solid rgba(201,169,110,0.45);padding:6px 22px;border-radius:3px;">
              <span style="color:#c9a96e;font-size:11px;letter-spacing:5px;font-weight:700;text-transform:uppercase;">DUKY STORE</span>
            </td>
          </tr>
        </table>
        <p style="color:rgba(255,255,255,0.45);font-size:10px;letter-spacing:3px;margin:0;text-transform:uppercase;">Thời Trang &amp; Phong Cách</p>
      </td>
    </tr>

    <!-- HERO -->
    <tr>
      <td style="padding:44px 48px 32px;text-align:center;background:#faf8f5;border-bottom:1px solid #ede8e3;">
        <table role="presentation" width="68" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
          <tr>
            <td style="width:68px;height:68px;background:#0f1923;border-radius:50%;text-align:center;vertical-align:middle;">
              <span style="color:#c9a96e;font-size:30px;line-height:1;">&#10003;</span>
            </td>
          </tr>
        </table>
        <h1 style="color:#0f1923;font-size:24px;font-weight:700;margin:0 0 12px;letter-spacing:-0.5px;">Đặt hàng thành công!</h1>
        <p style="color:#666;font-size:15px;margin:0;line-height:1.65;">Cảm ơn <strong style="color:#0f1923;">{{customerName}}</strong>, đơn hàng của bạn đã được ghi nhận.</p>
      </td>
    </tr>

    <!-- ORDER CODE BOX -->
    <tr>
      <td style="padding:28px 48px;background:#faf8f5;border-bottom:2px solid #ede8e3;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#0f1923;border-radius:12px;padding:22px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="color:rgba(201,169,110,0.65);font-size:10px;text-transform:uppercase;letter-spacing:2px;margin:0 0 5px;font-weight:600;">Mã đơn hàng</p>
                    <p style="color:#ffffff;font-size:24px;font-weight:700;margin:0;letter-spacing:1.5px;">{{orderCode}}</p>
                  </td>
                  <td style="text-align:right;vertical-align:middle;">
                    <p style="color:rgba(255,255,255,0.45);font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:0 0 5px;">Ngày đặt</p>
                    <p style="color:rgba(255,255,255,0.85);font-size:13px;font-weight:500;margin:0;">{{orderDate}}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ITEMS TABLE -->
    <tr>
      <td style="padding:32px 48px 0;">
        <p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2.5px;font-weight:700;margin:0 0 16px;">Sản phẩm đặt mua</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ede8e3;border-radius:10px;overflow:hidden;">
          <tr style="background:#0f1923;">
            <th style="color:#c9a96e;font-size:10px;font-weight:600;padding:12px 16px;text-align:left;text-transform:uppercase;letter-spacing:1.5px;">Sản phẩm</th>
            <th style="color:#c9a96e;font-size:10px;font-weight:600;padding:12px 10px;text-align:center;text-transform:uppercase;letter-spacing:1.5px;width:36px;">SL</th>
            <th style="color:#c9a96e;font-size:10px;font-weight:600;padding:12px 16px;text-align:right;text-transform:uppercase;letter-spacing:1.5px;white-space:nowrap;">Thành tiền</th>
          </tr>
          {{itemsHtml}}
        </table>
      </td>
    </tr>

    <!-- TOTALS -->
    <tr>
      <td style="padding:20px 48px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:#888;font-size:14px;padding:6px 0;border-bottom:1px solid #f0ece8;">Tạm tính</td>
            <td style="color:#444;font-size:14px;text-align:right;padding:6px 0;border-bottom:1px solid #f0ece8;">{{subtotal}}&nbsp;₫</td>
          </tr>
          <tr>
            <td style="color:#888;font-size:14px;padding:6px 0;border-bottom:1px solid #f0ece8;">Phí vận chuyển</td>
            <td style="color:#444;font-size:14px;text-align:right;padding:6px 0;border-bottom:1px solid #f0ece8;">{{shippingFee}}</td>
          </tr>
          <tr>
            <td style="color:#0f1923;font-size:17px;font-weight:700;padding:16px 0 8px;">Tổng cộng</td>
            <td style="color:#c9a96e;font-size:22px;font-weight:700;text-align:right;padding:16px 0 8px;">{{grandTotal}}&nbsp;₫</td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- DIVIDER -->
    <tr>
      <td style="padding:0 48px;"><div style="height:1px;background:#ede8e3;"></div></td>
    </tr>

    <!-- SHIPPING & PAYMENT -->
    <tr>
      <td style="padding:28px 48px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="47%" style="vertical-align:top;">
              <p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin:0 0 12px;">Địa chỉ giao hàng</p>
              <p style="color:#555;font-size:14px;line-height:1.75;margin:0;">{{shippingAddress}}</p>
            </td>
            <td width="6%"></td>
            <td width="47%" style="vertical-align:top;border-left:1px solid #ede8e3;padding-left:24px;">
              <p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin:0 0 12px;">Thanh toán</p>
              <p style="color:#555;font-size:14px;line-height:1.75;margin:0;">{{paymentMethod}}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CUSTOMER NOTE (pre-rendered HTML block or empty) -->
    {{customerNoteHtml}}

    <!-- FOOTER -->
    <tr>
      <td style="background:#0f1923;padding:32px 48px;text-align:center;">
        <p style="color:#c9a96e;font-size:12px;font-weight:700;margin:0 0 10px;letter-spacing:3px;text-transform:uppercase;">Duky Store</p>
        <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;line-height:1.9;">
          Nếu bạn có bất kỳ thắc mắc nào, vui lòng liên hệ chúng tôi qua email hoặc hotline.<br>
          Cảm ơn bạn đã tin tưởng mua sắm tại Duky Store!
        </p>
      </td>
    </tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;

const adminNotificationTemplate = `<!DOCTYPE html>
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

    <!-- HEADER ALERT -->
    <tr>
      <td style="background:#0f1923;padding:36px 48px 28px;text-align:center;">
        <p style="color:rgba(201,169,110,0.55);font-size:10px;letter-spacing:4px;margin:0 0 18px;text-transform:uppercase;font-weight:600;">Duky Store &mdash; Quản trị</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
          <tr>
            <td style="background:rgba(201,169,110,0.12);border:1px solid rgba(201,169,110,0.5);border-radius:8px;padding:12px 28px;text-align:center;">
              <span style="color:#c9a96e;font-size:20px;font-weight:700;letter-spacing:1px;">&#128717; ĐƠN HÀNG MỚI</span>
            </td>
          </tr>
        </table>
        <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0;">Vui lòng xác nhận và xử lý đơn hàng</p>
      </td>
    </tr>

    <!-- ORDER CODE STRIP -->
    <tr>
      <td style="background:#faf8f5;padding:20px 48px;border-bottom:2px solid #ede8e3;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <p style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:2px;margin:0 0 4px;font-weight:600;">Mã đơn hàng</p>
              <p style="color:#0f1923;font-size:26px;font-weight:700;margin:0;letter-spacing:1px;">{{orderCode}}</p>
            </td>
            <td style="text-align:right;vertical-align:middle;">
              <p style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 4px;font-weight:600;">Thời gian đặt</p>
              <p style="color:#0f1923;font-size:14px;font-weight:600;margin:0;">{{orderDate}}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CUSTOMER INFO -->
    <tr>
      <td style="padding:28px 48px 0;">
        <p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2.5px;font-weight:700;margin:0 0 16px;">Thông tin khách hàng</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;border-radius:10px;border:1px solid #ede8e3;overflow:hidden;">
          <tr>
            <td style="padding:12px 20px;border-bottom:1px solid #ede8e3;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="color:#888;font-size:12px;width:110px;vertical-align:middle;">Họ tên</td>
                <td style="color:#0f1923;font-size:14px;font-weight:600;">{{customerName}}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 20px;border-bottom:1px solid #ede8e3;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="color:#888;font-size:12px;width:110px;vertical-align:middle;">Điện thoại</td>
                <td style="color:#0f1923;font-size:14px;font-weight:600;">{{customerPhone}}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="color:#888;font-size:12px;width:110px;vertical-align:middle;">Email</td>
                <td style="color:#0f1923;font-size:14px;font-weight:600;">{{customerEmail}}</td>
              </tr></table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ITEMS TABLE -->
    <tr>
      <td style="padding:24px 48px 0;">
        <p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2.5px;font-weight:700;margin:0 0 16px;">Chi tiết sản phẩm</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ede8e3;border-radius:10px;overflow:hidden;">
          <tr style="background:#0f1923;">
            <th style="color:#c9a96e;font-size:10px;font-weight:600;padding:12px 16px;text-align:left;text-transform:uppercase;letter-spacing:1.5px;">Sản phẩm</th>
            <th style="color:#c9a96e;font-size:10px;font-weight:600;padding:12px 10px;text-align:center;text-transform:uppercase;letter-spacing:1.5px;width:36px;">SL</th>
            <th style="color:#c9a96e;font-size:10px;font-weight:600;padding:12px 16px;text-align:right;text-transform:uppercase;letter-spacing:1.5px;white-space:nowrap;">Thành tiền</th>
          </tr>
          {{itemsHtml}}
        </table>
      </td>
    </tr>

    <!-- TOTALS + ADDRESS -->
    <tr>
      <td style="padding:24px 48px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="46%" style="vertical-align:top;padding-right:20px;">
              <p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin:0 0 12px;">Địa chỉ giao hàng</p>
              <p style="color:#555;font-size:13px;line-height:1.75;margin:0 0 20px;">{{shippingAddress}}</p>
              <p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin:0 0 8px;">Thanh toán</p>
              <p style="color:#555;font-size:13px;line-height:1.75;margin:0;">{{paymentMethod}}</p>
            </td>
            <td width="8%" style="border-left:1px solid #ede8e3;"></td>
            <td width="46%" style="vertical-align:top;padding-left:20px;">
              <p style="color:#0f1923;font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin:0 0 12px;">Tổng đơn hàng</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:#888;font-size:13px;padding:5px 0;border-bottom:1px solid #f0ece8;">Tạm tính</td>
                  <td style="color:#333;font-size:13px;text-align:right;padding:5px 0;border-bottom:1px solid #f0ece8;">{{subtotal}}&nbsp;₫</td>
                </tr>
                <tr>
                  <td style="color:#888;font-size:13px;padding:5px 0;border-bottom:1px solid #f0ece8;">Phí ship</td>
                  <td style="color:#333;font-size:13px;text-align:right;padding:5px 0;border-bottom:1px solid #f0ece8;">{{shippingFee}}</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:4px 0;"><div style="border-top:2px solid #0f1923;margin:8px 0;"></div></td>
                </tr>
                <tr>
                  <td style="color:#0f1923;font-size:14px;font-weight:700;padding:4px 0;">Tổng cộng</td>
                  <td style="color:#c9a96e;font-size:20px;font-weight:700;text-align:right;padding:4px 0;">{{grandTotal}}&nbsp;₫</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CUSTOMER NOTE -->
    {{customerNoteHtml}}

    <!-- CTA BUTTON -->
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

    <!-- FOOTER -->
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

// ─── Migration ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔄 Updating email notification templates...\n');

  // Update customer confirmation template
  const customerResult = await prisma.notificationTemplate.upsert({
    where: { key: 'order.confirmation' },
    update: {
      channel: 'EMAIL',
      subject: 'Duky Store - Xác nhận đơn hàng {{orderCode}}',
      body: customerConfirmationTemplate,
      variables: [
        'customerName',
        'orderCode',
        'orderDate',
        'itemsHtml',
        'subtotal',
        'shippingFee',
        'discountTotal',
        'grandTotal',
        'shippingAddress',
        'paymentMethod',
        'customerNoteHtml',
      ],
      isActive: true,
    },
    create: {
      key: 'order.confirmation',
      channel: 'EMAIL',
      subject: 'Duky Store - Xác nhận đơn hàng {{orderCode}}',
      body: customerConfirmationTemplate,
      variables: [
        'customerName',
        'orderCode',
        'orderDate',
        'itemsHtml',
        'subtotal',
        'shippingFee',
        'discountTotal',
        'grandTotal',
        'shippingAddress',
        'paymentMethod',
        'customerNoteHtml',
      ],
      isActive: true,
    },
  });
  console.log(`✅ Customer template updated: ${customerResult.key}`);

  // Upsert admin notification template
  const adminResult = await prisma.notificationTemplate.upsert({
    where: { key: 'order.admin_notification' },
    update: {
      channel: 'EMAIL',
      subject: 'Duky Store - Đơn hàng mới {{orderCode}}',
      body: adminNotificationTemplate,
      variables: [
        'orderCode',
        'orderDate',
        'customerName',
        'customerPhone',
        'customerEmail',
        'itemsHtml',
        'subtotal',
        'shippingFee',
        'discountTotal',
        'grandTotal',
        'shippingAddress',
        'paymentMethod',
        'customerNoteHtml',
      ],
      isActive: true,
    },
    create: {
      key: 'order.admin_notification',
      channel: 'EMAIL',
      subject: 'Duky Store - Đơn hàng mới {{orderCode}}',
      body: adminNotificationTemplate,
      variables: [
        'orderCode',
        'orderDate',
        'customerName',
        'customerPhone',
        'customerEmail',
        'itemsHtml',
        'subtotal',
        'shippingFee',
        'discountTotal',
        'grandTotal',
        'shippingAddress',
        'paymentMethod',
        'customerNoteHtml',
      ],
      isActive: true,
    },
  });
  console.log(`✅ Admin template upserted: ${adminResult.key}`);

  console.log('\n🎉 Email templates updated successfully!');
}

main()
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
