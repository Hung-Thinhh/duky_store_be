# Duky Store Backend

Backend API cho hệ thống thương mại điện tử **Duky Store**, được xây dựng để thay thế backend WordPress/WooCommerce cũ bằng hệ thống riêng, dễ mở rộng, dễ quản lý và phù hợp với **Client App Next.js** + **Admin Dashboard**.

Backend chịu trách nhiệm xử lý toàn bộ nghiệp vụ: sản phẩm, danh mục, biến thể size, tồn kho, giỏ hàng, đơn hàng, thanh toán, vận chuyển, khách hàng, nội dung SEO, migration dữ liệu từ WordPress và cấu hình vận hành hệ thống.

---

## 1. Mục tiêu dự án

- Thay thế backend WordPress/WooCommerce hiện tại.
- Cung cấp REST API cho Client App và Admin Dashboard.
- Quản lý đầy đủ dữ liệu ecommerce: sản phẩm, danh mục, biến thể, tồn kho, đơn hàng.
- Giữ lại dữ liệu SEO quan trọng từ website cũ.
- Hỗ trợ mapping URL cũ sang URL mới để tránh mất SEO.
- Hỗ trợ vận hành thực tế cho shop: COD, chuyển khoản, phí ship, quản lý đơn.
- Dễ mở rộng thêm payment gateway, customer account, analytics, automation về sau.

---

## 2. Công nghệ sử dụng

### Backend Framework

- NestJS
- TypeScript
- REST API

### Database

- PostgreSQL
- Prisma ORM

### Authentication

- JWT Access Token
- Refresh Token
- Role-Based Access Control

### Storage

- Cloudinary hoặc Cloudflare R2/S3

### Queue / Background Job

- Redis
- BullMQ

### Deployment

- Docker
- VPS / Railway / Render / Fly.io

---

## 3. Kiến trúc tổng quan

```txt
Client App Next.js
        |
        | REST API
        v
Duky Store Backend - NestJS
        |
        | Prisma ORM
        v
PostgreSQL Database
        |
        +--> Redis Queue
        +--> Cloudinary / R2 Storage
        +--> Email Provider
```

Hệ thống có 2 nhóm consumer chính:

```txt
1. Client App
   - Khách hàng xem sản phẩm
   - Tìm kiếm sản phẩm
   - Thêm giỏ hàng
   - Checkout
   - Gửi liên hệ
   - Đọc blog/chính sách

2. Admin Dashboard
   - Quản lý sản phẩm
   - Quản lý đơn hàng
   - Quản lý tồn kho
   - Quản lý khách hàng
   - Quản lý blog
   - Quản lý SEO
   - Quản lý cấu hình website
```

---

## 4. Cấu trúc thư mục đề xuất

```txt
src
├── main.ts
├── app.module.ts
│
├── config
│   ├── app.config.ts
│   ├── database.config.ts
│   ├── jwt.config.ts
│   ├── mail.config.ts
│   └── storage.config.ts
│
├── common
│   ├── decorators
│   ├── guards
│   ├── interceptors
│   ├── filters
│   ├── pipes
│   ├── constants
│   └── utils
│
├── database
│   ├── prisma.module.ts
│   └── prisma.service.ts
│
├── modules
│   ├── auth
│   ├── users
│   ├── roles
│   ├── permissions
│   ├── products
│   ├── categories
│   ├── product-variants
│   ├── inventory
│   ├── carts
│   ├── checkout
│   ├── orders
│   ├── payments
│   ├── shipping
│   ├── customers
│   ├── coupons
│   ├── reviews
│   ├── wishlist
│   ├── blog
│   ├── pages
│   ├── media
│   ├── seo
│   ├── redirects
│   ├── migration
│   ├── notifications
│   ├── analytics
│   └── settings
│
└── jobs
    ├── mail
    ├── image
    ├── migration
    └── sitemap
```

---

## 5. Danh sách module backend

### 5.1 Auth Module

Quản lý đăng nhập, đăng xuất và bảo vệ API.

**Chức năng:**

- Đăng nhập admin.
- Đăng xuất.
- Refresh access token.
- Đổi mật khẩu.
- Quên mật khẩu.
- Phân quyền theo role.
- Bảo vệ API admin.
- Kiểm tra trạng thái tài khoản.

**Role mặc định:**

```txt
SUPER_ADMIN
ADMIN
STAFF
CONTENT_EDITOR
ORDER_MANAGER
```

---

### 5.2 User / Admin Module

Quản lý tài khoản nội bộ dùng trong Admin Dashboard.

**Chức năng:**

- Tạo tài khoản admin.
- Cập nhật tài khoản admin.
- Khóa/mở khóa tài khoản.
- Gán role cho tài khoản.
- Xem lịch sử đăng nhập.
- Xem lịch sử thao tác nếu có audit log.

---

### 5.3 Product Module

Quản lý sản phẩm chính của shop.

**Chức năng:**

- Tạo sản phẩm.
- Sửa sản phẩm.
- Xóa mềm sản phẩm.
- Ẩn/hiện sản phẩm.
- Quản lý tên sản phẩm.
- Quản lý slug.
- Quản lý SKU.
- Quản lý giá gốc.
- Quản lý giá sale.
- Quản lý trạng thái giá liên hệ.
- Quản lý mô tả ngắn.
- Quản lý mô tả dài.
- Quản lý ảnh đại diện.
- Quản lý gallery ảnh.
- Gán danh mục.
- Gán tag.
- Gán sản phẩm liên quan.
- Đánh dấu sản phẩm nổi bật.
- Đánh dấu sản phẩm bán chạy.
- Đánh dấu sản phẩm mới.
- Quản lý trạng thái publish/draft.

**Trạng thái sản phẩm:**

```txt
DRAFT
PUBLISHED
HIDDEN
SOLD_OUT
DISCONTINUED
```

---

### 5.4 Category Module

Quản lý danh mục sản phẩm.

**Chức năng:**

- Tạo danh mục.
- Sửa danh mục.
- Xóa danh mục.
- Quản lý danh mục cha/con.
- Quản lý slug danh mục.
- Quản lý ảnh danh mục.
- Sắp xếp thứ tự danh mục.
- Gán sản phẩm vào danh mục.
- Quản lý SEO cho danh mục.

**Ví dụ danh mục:**

```txt
Giày boot nam
Giày boot nữ
Phụ kiện
Unisex
Áo khoác da
Áo thun thiết kế
Quần âu
Chân váy
```

---

### 5.5 Product Variant Module

Quản lý biến thể sản phẩm, chủ yếu là size giày.

**Chức năng:**

- Tạo biến thể sản phẩm.
- Quản lý size giày nam.
- Quản lý size giày nữ.
- Quản lý màu sắc nếu có.
- Quản lý SKU theo biến thể.
- Quản lý giá theo biến thể nếu có.
- Quản lý tồn kho theo biến thể.
- Bật/tắt biến thể.
- Validate biến thể trước khi thêm vào giỏ hàng.

**Ví dụ biến thể:**

```txt
Size: 38, 39, 40, 41, 42, 43, 44
Color: Black, Brown, White
```

---

### 5.6 Inventory Module

Quản lý tồn kho sản phẩm.

**Chức năng:**

- Nhập tồn kho.
- Cập nhật tồn kho.
- Trừ kho khi tạo đơn hàng.
- Hoàn kho khi hủy đơn hàng.
- Đánh dấu sản phẩm hết hàng.
- Cảnh báo sản phẩm sắp hết hàng.
- Theo dõi lịch sử thay đổi tồn kho.

**Luồng tồn kho:**

```txt
Admin nhập kho
→ Sản phẩm có tồn kho
→ Khách đặt hàng
→ Hệ thống trừ kho
→ Nếu hủy đơn thì hoàn kho
```

---

### 5.7 Pricing & Promotion Module

Quản lý giá, sale và mã giảm giá.

**Chức năng:**

- Quản lý giá gốc.
- Quản lý giá sale.
- Quản lý giá liên hệ.
- Tạo mã giảm giá.
- Giảm theo phần trăm.
- Giảm theo số tiền cố định.
- Giới hạn số lượt dùng.
- Giới hạn thời gian sử dụng.
- Gán coupon cho sản phẩm hoặc danh mục.
- Campaign sale.
- Freeship theo điều kiện.

---

### 5.8 Search Module

Cung cấp API tìm kiếm, lọc và sắp xếp sản phẩm.

**Chức năng:**

- Tìm sản phẩm theo tên.
- Tìm sản phẩm theo slug.
- Tìm theo danh mục.
- Tìm theo tag.
- Lọc theo khoảng giá.
- Lọc theo trạng thái còn hàng.
- Lọc theo sản phẩm sale.
- Sắp xếp theo mới nhất.
- Sắp xếp theo giá thấp đến cao.
- Sắp xếp theo giá cao đến thấp.
- Sắp xếp theo bán chạy.
- Phân trang.

---

### 5.9 Cart Module

Quản lý giỏ hàng của khách.

**Chức năng:**

- Tạo giỏ hàng theo session.
- Thêm sản phẩm vào giỏ.
- Thêm sản phẩm có variant vào giỏ.
- Cập nhật số lượng.
- Xóa sản phẩm khỏi giỏ.
- Xóa toàn bộ giỏ hàng.
- Validate tồn kho.
- Validate biến thể.
- Tính tạm tính.
- Áp coupon.
- Tính phí ship tạm tính.

**Lưu ý:**

Khách có thể chưa đăng nhập vẫn mua hàng, nên cart cần hỗ trợ:

```txt
Session cart
Guest cart
Customer cart nếu có tài khoản
```

---

### 5.10 Checkout Module

Xử lý bước đặt hàng.

**Chức năng:**

- Nhận thông tin khách hàng.
- Nhận địa chỉ giao hàng.
- Nhận ghi chú đơn hàng.
- Nhận phương thức thanh toán.
- Kiểm tra lại giỏ hàng.
- Kiểm tra tồn kho.
- Tính tổng đơn hàng.
- Tạo đơn hàng.
- Xóa hoặc đóng giỏ hàng sau khi đặt thành công.
- Gửi thông báo cho admin/khách.

---

### 5.11 Order Module

Quản lý đơn hàng.

**Chức năng:**

- Tạo đơn hàng.
- Xem danh sách đơn hàng.
- Xem chi tiết đơn hàng.
- Cập nhật trạng thái đơn hàng.
- Hủy đơn hàng.
- Ghi chú nội bộ.
- Lưu lịch sử trạng thái đơn.
- Xuất dữ liệu đơn hàng.
- In đơn hàng nếu cần.

**Trạng thái đơn hàng:**

```txt
PENDING
CONFIRMED
PROCESSING
SHIPPING
COMPLETED
CANCELLED
REFUNDED
```

---

### 5.12 Payment Module

Quản lý thanh toán.

**Chức năng giai đoạn đầu:**

- COD.
- Chuyển khoản ngân hàng.
- Admin xác nhận đã thanh toán.
- Lưu trạng thái thanh toán.
- Lưu ghi chú thanh toán.

**Trạng thái thanh toán:**

```txt
UNPAID
PAID
PARTIALLY_PAID
REFUNDED
FAILED
```

**Có thể mở rộng sau:**

- PayOS.
- VNPay.
- MoMo.
- ZaloPay.

---

### 5.13 Shipping Module

Quản lý vận chuyển.

**Chức năng:**

- Cấu hình phí ship.
- Cấu hình freeship theo giá trị đơn hàng.
- Lưu địa chỉ giao hàng.
- Lưu ghi chú giao hàng.
- Cập nhật trạng thái giao hàng.
- Lưu mã vận đơn nếu có.
- Quản lý khu vực giao hàng nếu cần.

---

### 5.14 Customer Module

Quản lý khách hàng.

**Chức năng:**

- Lưu thông tin khách hàng từ đơn hàng.
- Quản lý họ tên.
- Quản lý số điện thoại.
- Quản lý email.
- Quản lý địa chỉ.
- Xem lịch sử mua hàng.
- Ghi chú khách hàng.
- Phân loại khách hàng nếu cần.

---

### 5.15 Wishlist Module

Quản lý sản phẩm yêu thích.

**Chức năng:**

- Thêm sản phẩm vào yêu thích.
- Xóa sản phẩm khỏi yêu thích.
- Xem danh sách yêu thích.
- Lưu wishlist theo session hoặc user.
- Thống kê sản phẩm được yêu thích nhiều.

---

### 5.16 Review Module

Quản lý đánh giá sản phẩm.

**Chức năng:**

- Khách gửi đánh giá.
- Chấm sao.
- Nhập nội dung nhận xét.
- Admin duyệt đánh giá.
- Admin ẩn/xóa đánh giá.
- Tính điểm trung bình.
- Hiển thị tổng số lượt đánh giá.

---

### 5.17 Blog Module

Quản lý bài viết SEO.

**Chức năng:**

- Tạo bài viết.
- Sửa bài viết.
- Xóa bài viết.
- Quản lý slug bài viết.
- Quản lý ảnh đại diện.
- Quản lý nội dung bài viết.
- Quản lý danh mục bài viết.
- Quản lý tag bài viết.
- Quản lý trạng thái draft/published.
- Quản lý SEO bài viết.

**Nhóm nội dung quan trọng:**

```txt
Kinh nghiệm
Mix đồ nam
Mix đồ nữ
Bí kíp giày boot
Số đo giày nam
Số đo giày nữ
Số đo áo
```

---

### 5.18 Page Module

Quản lý các trang tĩnh.

**Chức năng:**

- Trang liên hệ.
- Chính sách bảo mật.
- Chính sách vận chuyển.
- Chính sách bảo hành.
- Chính sách đổi trả.
- Quy định sử dụng.
- FAQ.
- Giới thiệu nếu cần.

---

### 5.19 Homepage Management Module

Quản lý nội dung trang chủ.

**Chức năng:**

- Hero banner.
- Banner sale.
- Section sản phẩm bán chạy.
- Section sản phẩm mới.
- Section sản phẩm nam.
- Section sản phẩm nữ.
- Feedback khách hàng.
- Video/lifestyle.
- Cam kết dịch vụ.
- CTA mua hàng/liên hệ.

---

### 5.20 Media Module

Quản lý hình ảnh và file.

**Chức năng:**

- Upload ảnh.
- Xóa ảnh.
- Sửa alt ảnh.
- Quản lý thư viện ảnh.
- Quản lý ảnh sản phẩm.
- Quản lý ảnh banner.
- Quản lý ảnh feedback.
- Resize/optimize ảnh.
- Lưu file trên Cloudinary hoặc R2/S3.

---

### 5.21 SEO Module

Quản lý SEO cho toàn hệ thống.

**Chức năng:**

- Meta title.
- Meta description.
- Canonical URL.
- Open Graph.
- Twitter Card.
- Product Schema.
- Breadcrumb Schema.
- Article Schema.
- Organization Schema.
- Sitemap.
- Robots.txt.
- Redirect 301.
- URL mapping từ website cũ.

---

### 5.22 Redirect Module

Quản lý redirect khi chuyển từ WordPress sang Next.js.

**Chức năng:**

- Lưu URL cũ.
- Lưu URL mới.
- Cấu hình redirect 301.
- Kiểm tra redirect bị lỗi.
- Tránh redirect chain.
- Tránh redirect loop.
- Export redirect config.

**Ví dụ:**

```txt
Old URL: /san-pham/zip-boots-nam-kem-chain/
New URL: /san-pham/zip-boots-nam-kem-chain/
Status: 301 nếu có đổi URL
```

---

### 5.23 Migration Module

Hỗ trợ import dữ liệu từ WordPress/WooCommerce.

**Chức năng:**

- Import sản phẩm.
- Import danh mục.
- Import tag.
- Import ảnh.
- Import bài viết.
- Import page tĩnh.
- Import customer nếu cần.
- Import order nếu cần.
- Mapping URL cũ sang URL mới.
- Kiểm tra dữ liệu thiếu.
- Xuất report migration.

**Dữ liệu cần migrate:**

```txt
Products
Product categories
Product tags
Product images
Product variations
Product SEO metadata
Blog posts
Static pages
Redirects
Customers - optional
Orders - optional
```

---

### 5.24 Notification Module

Quản lý gửi thông báo.

**Chức năng:**

- Email xác nhận đơn hàng cho khách.
- Email thông báo đơn mới cho admin.
- Email cập nhật trạng thái đơn.
- Email form liên hệ.
- Template email.
- Queue gửi email bằng BullMQ.
- Retry khi gửi lỗi.

---

### 5.25 Analytics Module

Thống kê vận hành.

**Chức năng:**

- Tổng doanh thu.
- Tổng đơn hàng.
- Đơn mới.
- Sản phẩm bán chạy.
- Sản phẩm sắp hết hàng.
- Khách hàng mới.
- Tỷ lệ hủy đơn.
- Báo cáo theo ngày/tháng.
- Export report.

---

### 5.26 Settings Module

Quản lý cấu hình website.

**Chức năng:**

- Logo.
- Favicon.
- Tên website.
- Hotline.
- Email.
- Địa chỉ.
- Zalo.
- Facebook.
- TikTok.
- Shopee.
- Google Maps.
- Phí ship.
- Freeship.
- Tài khoản ngân hàng.
- Đơn vị tiền tệ.
- Bật/tắt chế độ bảo trì.

---

## 6. REST API Convention

### Prefix API

```txt
/api/v1
```

### Public API

```txt
GET    /api/v1/products
GET    /api/v1/products/:slug
GET    /api/v1/categories
GET    /api/v1/categories/:slug/products
GET    /api/v1/blog
GET    /api/v1/blog/:slug
POST   /api/v1/cart/items
PATCH  /api/v1/cart/items/:id
DELETE /api/v1/cart/items/:id
POST   /api/v1/checkout
POST   /api/v1/contact
```

### Admin API

```txt
POST   /api/v1/admin/auth/login
POST   /api/v1/admin/auth/logout

GET    /api/v1/admin/products
POST   /api/v1/admin/products
GET    /api/v1/admin/products/:id
PATCH  /api/v1/admin/products/:id
DELETE /api/v1/admin/products/:id

GET    /api/v1/admin/orders
GET    /api/v1/admin/orders/:id
PATCH  /api/v1/admin/orders/:id/status

GET    /api/v1/admin/customers
GET    /api/v1/admin/reports
```

---

## 7. Database Entities chính

```txt
User
Role
Permission

Product
ProductVariant
ProductImage
ProductCategory
Category
Tag

Inventory
InventoryLog

Cart
CartItem

Order
OrderItem
OrderStatusHistory

Payment
ShippingAddress
Customer

Coupon
Review
Wishlist

BlogPost
BlogCategory
Page

Media
SeoMetadata
Redirect

Setting
NotificationLog
AuditLog
```

---

## 8. Luồng nghiệp vụ chính

### 8.1 Luồng mua hàng

```txt
Khách xem sản phẩm
→ Chọn size/variant
→ Thêm vào giỏ hàng
→ Kiểm tra tồn kho
→ Nhập thông tin checkout
→ Chọn thanh toán COD/chuyển khoản
→ Tạo đơn hàng
→ Gửi email/thông báo
→ Admin xử lý đơn
→ Cập nhật trạng thái đơn
```

### 8.2 Luồng quản lý sản phẩm

```txt
Admin đăng nhập
→ Tạo sản phẩm
→ Gán danh mục
→ Gán size/variant
→ Nhập giá/tồn kho
→ Upload ảnh
→ Nhập SEO metadata
→ Publish sản phẩm
```

### 8.3 Luồng xử lý đơn hàng

```txt
Đơn mới
→ Admin xác nhận
→ Kiểm tra thanh toán
→ Chuẩn bị hàng
→ Giao hàng
→ Hoàn thành
```

### 8.4 Luồng migration SEO

```txt
Crawl website WordPress cũ
→ Export URL cũ
→ Import sản phẩm/bài viết/danh mục
→ Giữ slug quan trọng
→ Mapping URL cũ sang URL mới
→ Tạo redirect 301
→ Generate sitemap
→ Submit Search Console
→ Theo dõi lỗi 404/index
```

---

## 9. Environment Variables

```env
NODE_ENV=development
PORT=4000

DATABASE_URL="postgresql://user:password@localhost:5432/duky_store"

JWT_ACCESS_SECRET="access_secret"
JWT_REFRESH_SECRET="refresh_secret"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

REDIS_HOST=localhost
REDIS_PORT=6379

CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""

MAIL_HOST=""
MAIL_PORT=587
MAIL_USER=""
MAIL_PASSWORD=""
MAIL_FROM="Duky Store <no-reply@dukystore.com>"

CLIENT_URL="https://dukystore.com"
ADMIN_URL="https://admin.dukystore.com"
```

---

## 10. Cài đặt local development

### 10.1 Clone project

```bash
git clone <repository-url>
cd duky-store-backend
```

### 10.2 Cài dependencies

```bash
npm install
```

### 10.3 Tạo file môi trường

```bash
cp .env.example .env
```

Sau đó cập nhật thông tin database, JWT, Redis, mail và storage.

### 10.4 Chạy PostgreSQL và Redis bằng Docker

```bash
docker compose up -d
```

### 10.5 Chạy Prisma migration

```bash
npx prisma migrate dev
```

### 10.6 Generate Prisma Client

```bash
npx prisma generate
```

### 10.7 Seed dữ liệu mẫu

```bash
npm run seed
```

### 10.8 Chạy server dev

```bash
npm run start:dev
```

Server mặc định chạy tại:

```txt
http://localhost:4000
```

---

## 11. Scripts

```json
{
  "start": "nest start",
  "start:dev": "nest start --watch",
  "start:prod": "node dist/src/main",
  "build": "nest build",
  "lint": "eslint .",
  "format": "prettier --write .",
  "test": "jest",
  "prisma:generate": "prisma generate",
  "prisma:migrate": "prisma migrate dev",
  "prisma:studio": "prisma studio",
  "seed": "ts-node prisma/seed.ts"
}
```

---

## 12. Quy chuẩn response API

### Thành công

```json
{
  "success": true,
  "message": "Success",
  "data": {}
}
```

### Lỗi

```json
{
  "success": false,
  "message": "Product not found",
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "details": {}
  }
}
```

### Pagination

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

---

## 13. Quy chuẩn đặt tên

### File

```txt
products.controller.ts
products.service.ts
products.module.ts
dto/create-product.dto.ts
dto/update-product.dto.ts
```

### API route

```txt
/products
/products/:id
/categories
/orders
/admin/products
/admin/orders
```

### Database table

```txt
products
product_variants
product_images
orders
order_items
seo_metadata
```

---

## 14. Bảo mật

Backend cần đảm bảo các điểm sau:

- Hash password bằng bcrypt hoặc argon2.
- Không lưu plain password.
- Dùng JWT access token ngắn hạn.
- Dùng refresh token dài hạn.
- Bảo vệ admin API bằng guard.
- Validate input bằng DTO.
- Rate limit API nhạy cảm.
- Không expose thông tin lỗi database ra client.
- CORS chỉ cho phép domain hợp lệ.
- Upload file phải kiểm tra định dạng và dung lượng.
- API checkout phải validate lại giá và tồn kho phía server.
- Không tin dữ liệu giá/tổng tiền gửi từ client.

---

## 15. SEO Migration Notes

Vì website cũ đã SEO trên domain `dukystore.com`, khi chuyển sang hệ thống mới cần chú ý:

- Giữ URL cũ nếu có thể.
- Nếu đổi URL phải redirect 301.
- Không để URL cũ bị 404.
- Giữ meta title, meta description.
- Giữ nội dung mô tả sản phẩm.
- Giữ nội dung blog SEO.
- Tạo sitemap mới.
- Tạo robots.txt chuẩn.
- Theo dõi Google Search Console sau khi deploy.

---

## 16. MVP Scope

Giai đoạn MVP nên ưu tiên các module sau:

```txt
Auth
Product
Category
Product Variant
Inventory
Media
Cart
Checkout
Order
Payment COD / Bank Transfer
Shipping Basic
Customer
Blog
Page
SEO
Settings
```

Các module có thể làm sau:

```txt
Wishlist
Review
Promotion nâng cao
Analytics nâng cao
Migration UI
Notification template UI
Advanced permission
Customer account
Payment gateway online
```

---

## 17. Roadmap phát triển

### Phase 1: Backend Core

- Setup NestJS.
- Setup PostgreSQL.
- Setup Prisma.
- Auth admin.
- Product/category/variant.
- Media upload.
- SEO metadata.

### Phase 2: Ecommerce Core

- Cart.
- Checkout.
- Order.
- Payment COD/chuyển khoản.
- Shipping basic.
- Customer.

### Phase 3: Content & SEO

- Blog.
- Page chính sách.
- Redirect.
- Sitemap.
- Robots.
- Migration dữ liệu từ WordPress.

### Phase 4: Admin Operation

- Dashboard.
- Reports.
- Notification.
- Review.
- Wishlist.
- Promotion.
- Settings nâng cao.

### Phase 5: Optimization

- Redis cache.
- Queue background jobs.
- Image optimization.
- Search nâng cao.
- Analytics.
- Payment gateway online.

---

## 18. Ghi chú triển khai

Không nên build backend theo kiểu tất cả logic nằm trong một module lớn. Cần tách module rõ ngay từ đầu:

```txt
products
orders
cart
checkout
payments
shipping
seo
migration
settings
```

Với ecommerce, các nghiệp vụ quan trọng như giá, tồn kho, đơn hàng và thanh toán phải luôn được xử lý ở server. Client chỉ gửi lựa chọn của khách, backend mới là nơi tính toán cuối cùng.

---

## 19. License

Private project for Duky Store.
