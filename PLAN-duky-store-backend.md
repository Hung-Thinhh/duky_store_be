# Duky Store Backend Implementation Plan

File này là roadmap để follow khi build backend Duky Store bằng NestJS + PostgreSQL + Prisma + Redis/BullMQ + Docker.

Mục tiêu chính: build MVP ecommerce chạy được trước, sau đó mới mở rộng dashboard, SEO migration, analytics và automation.

---

## 0. Nguyên tắc làm dự án

- Làm từ dễ đến khó, từ nền móng đến nghiệp vụ phức tạp.
- Ưu tiên MVP bán hàng trước: sản phẩm, giỏ hàng, checkout, đơn hàng.
- Không build tất cả module cùng lúc.
- Các nghiệp vụ giá, tồn kho, checkout, thanh toán phải tính ở backend.
- Dữ liệu quan trọng phải có migration, index và validation rõ ràng.
- Admin API và Public API tách route rõ:

```txt
Public: /api/v1/...
Admin:  /api/v1/admin/...
```

---

## 1. Phase 1 - Setup nền móng

Độ khó: dễ  
Mục tiêu: backend chạy ổn local, có database, Redis và cấu trúc project sạch.

### 1.1. Setup môi trường local

- [ ] Kiểm tra Node.js LTS
- [x] Kiểm tra NestJS project chạy được
- [x] Cài Docker Desktop
- [x] Tạo `.env`
- [x] Tạo `.env.example`
- [x] Thêm `PORT=4000`
- [x] Thêm `DATABASE_URL`
- [x] Thêm Redis config
- [x] Thêm JWT config

### 1.2. Docker Compose

- [x] Tạo `docker-compose.yml`
- [x] Thêm service PostgreSQL
- [x] Thêm service Redis
- [x] Thêm volume cho PostgreSQL
- [x] Test `docker compose up -d`
- [x] Test connect database

### 1.3. NestJS base config

- [x] Cài `@nestjs/config`
- [x] Load env global trong `AppModule`
- [x] Cấu hình API prefix `/api/v1`
- [x] Bật CORS
- [x] Bật global validation pipe
- [x] Bật transform DTO
- [x] Thêm global exception filter nếu cần
- [x] Thêm Swagger docs

### 1.4. Cấu trúc thư mục

- [x] Tạo `src/config`
- [x] Tạo `src/common`
- [x] Tạo `src/database`
- [x] Tạo `src/modules`
- [x] Tạo `src/jobs`

Đề xuất:

```txt
src
├── config
├── common
│   ├── decorators
│   ├── guards
│   ├── interceptors
│   ├── filters
│   ├── pipes
│   └── utils
├── database
├── modules
└── jobs
```

### 1.5. Prisma base

- [x] Cấu hình `prisma/schema.prisma`
- [x] Tạo `PrismaService`
- [x] Tạo `PrismaModule`
- [x] Export PrismaService dùng chung
- [x] Chạy `npx prisma generate`
- [x] Chạy migration đầu tiên

Kết quả phase 1:

- Backend chạy được tại `http://localhost:4000`
- API prefix là `/api/v1`
- PostgreSQL và Redis chạy bằng Docker
- Prisma kết nối database được
- Project có structure để phát triển lâu dài

---

## 2. Phase 2 - Database core

Độ khó: dễ đến trung bình  
Mục tiêu: có schema nền cho admin, sản phẩm, media, SEO và setting.

### 2.1. Auth/Admin schema

- [x] `User`
- [x] `Role`
- [x] `Permission`
- [x] `RefreshToken`
- [x] `LoginHistory` nếu cần
- [x] `AuditLog` nếu cần

Role mặc định:

```txt
SUPER_ADMIN
ADMIN
STAFF
CONTENT_EDITOR
ORDER_MANAGER
```

- [x] Seed role mặc định
- [x] Seed permission cơ bản
- [x] Seed super admin

### 2.2. Catalog schema

- [x] `Product`
- [x] `ProductVariant`
- [x] `ProductImage`
- [x] `Category`
- [x] `Tag`
- [x] Bảng nối product-category
- [x] Bảng nối product-tag
- [x] Bảng related products nếu cần

### 2.3. Inventory schema

- [x] `Inventory`
- [x] `InventoryLog`
- [x] Index theo `productId`
- [x] Index theo `variantId`

### 2.4. Media/SEO/Setting schema

- [x] `Media`
- [x] `SeoMetadata`
- [x] `Redirect`
- [x] `Setting`

### 2.5. Quy tắc database

- [x] `slug` unique cho product/category/blog/page
- [x] `sku` unique cho product hoặc variant
- [x] Money dùng `Decimal` hoặc integer VND
- [x] Các cột query nhiều cần index
- [x] Soft delete bằng `deletedAt` cho dữ liệu quan trọng
- [x] Có `createdAt` và `updatedAt`

Kết quả phase 2:

- Có Prisma schema core
- Có migration chạy được
- Có seed role và super admin
- Có nền dữ liệu để build Auth và Product

---

## 3. Phase 3 - Auth admin

Độ khó: trung bình  
Mục tiêu: Admin Dashboard có thể đăng nhập và gọi API bảo vệ.

### 3.1. Dependencies

- [x] Cài JWT/Passport
- [x] Cài bcrypt hoặc argon2
- [x] Cài type packages cần thiết

### 3.2. Auth module

- [x] `AuthModule`
- [x] `AuthController`
- [x] `AuthService`
- [x] `JwtStrategy`
- [x] `JwtAuthGuard`
- [x] `RolesGuard`
- [x] `@CurrentUser()` decorator
- [x] `@Roles()` decorator

### 3.3. API

- [x] `POST /api/v1/admin/auth/login`
- [x] `POST /api/v1/admin/auth/refresh`
- [x] `POST /api/v1/admin/auth/logout`
- [x] `GET /api/v1/admin/auth/me`
- [x] `PATCH /api/v1/admin/auth/change-password`

### 3.4. User/Admin module

- [x] Tạo admin user
- [x] List admin users
- [x] Update admin user
- [x] Lock/unlock admin user
- [x] Assign role

Kết quả phase 3:

- Admin login được
- Access token ngắn hạn
- Refresh token dài hạn
- Admin API được bảo vệ bằng guard

---

## 4. Phase 4 - Category, Tag, Media

Độ khó: trung bình  
Mục tiêu: chuẩn bị nền để nhập sản phẩm.

### 4.1. Category module

- [x] CRUD category
- [x] Category cha/con
- [x] Slug unique
- [x] Sort order
- [x] Status active/inactive
- [x] SEO metadata
- [x] Public API list category

API admin:

```txt
GET    /api/v1/admin/categories
POST   /api/v1/admin/categories
GET    /api/v1/admin/categories/:id
PATCH  /api/v1/admin/categories/:id
DELETE /api/v1/admin/categories/:id
```

API public:

```txt
GET /api/v1/categories
GET /api/v1/categories/:slug
```

### 4.2. Tag module

- [x] CRUD tag
- [x] Slug unique
- [ ] Gán tag cho product sau

### 4.3. Media module

- [ ] Chọn Cloudinary hoặc Cloudflare R2
- [ ] Upload image
- [x] Validate file type
- [x] Validate file size
- [x] Lưu media record
- [x] Xóa media
- [x] Update alt text

Kết quả phase 4:

- Admin quản lý category/tag/media được
- Product module có thể dùng category, tag, image

---

## 5. Phase 5 - Product MVP

Độ khó: trung bình  
Mục tiêu: Admin tạo sản phẩm và client xem sản phẩm được.

### 5.1. Product admin

- [x] Tạo product
- [x] Sửa product
- [x] Xóa mềm product
- [x] Ẩn/hiện product
- [x] Publish/draft product
- [x] Quản lý name
- [x] Quản lý slug
- [x] Quản lý SKU
- [x] Quản lý giá gốc
- [x] Quản lý giá sale
- [x] Quản lý giá liên hệ
- [x] Mô tả ngắn
- [x] Mô tả dài
- [x] Ảnh đại diện
- [x] Gallery ảnh
- [x] Gán category
- [x] Gán tag
- [x] SEO metadata

API admin:

```txt
GET    /api/v1/admin/products
POST   /api/v1/admin/products
GET    /api/v1/admin/products/:id
PATCH  /api/v1/admin/products/:id
DELETE /api/v1/admin/products/:id
```

### 5.2. Product public

- [x] List product published
- [x] Detail product by slug
- [x] Filter theo category
- [x] Filter theo tag
- [x] Filter theo giá
- [x] Sort mới nhất
- [x] Sort giá thấp đến cao
- [x] Sort giá cao đến thấp
- [x] Pagination

API public:

```txt
GET /api/v1/products
GET /api/v1/products/:slug
GET /api/v1/categories/:slug/products
```
Kết quả phase 5:

- Admin nhập sản phẩm được
- Client xem catalog được

---

## 6. Phase 6 - Variant và Inventory

Độ khó: trung bình đến khó  
Mục tiêu: sản phẩm giày có size/màu và tồn kho chính xác.

### 6.1. Product variant

- [x] Tạo variant theo product
- [x] Size giày nam/nữ
- [x] Color nếu có
- [x] SKU variant
- [x] Giá variant nếu có
- [x] Bật/tắt variant
- [x] Validate variant trước khi add cart

### 6.2. Inventory

- [x] Nhập tồn kho
- [x] Cập nhật tồn kho
- [x] Tồn kho theo variant
- [x] Tồn kho theo product nếu product không có variant
- [x] Inventory log
- [x] Cảnh báo sắp hết hàng
- [x] Đánh dấu sold out
Kết quả phase 6:

- Biết chính xác sản phẩm/size nào còn hàng
- Có lịch sử thay đổi tồn kho

---

## 7. Phase 7 - Cart

Độ khó: khó vừa  
Mục tiêu: khách thêm sản phẩm vào giỏ, backend tính subtotal và validate tồn kho.

### 7.1. Cart schema

- [x] `Cart`
- [x] `CartItem`
- [x] Hỗ trợ guest/session cart
- [ ] Hỗ trợ customer cart sau này

### 7.2. Cart logic

- [x] Tạo cart theo session
- [x] Add product vào cart
- [x] Add variant vào cart
- [x] Update quantity
- [x] Remove item
- [x] Clear cart
- [x] Validate product published
- [x] Validate variant active
- [x] Validate stock
- [x] Tính subtotal server-side
API public:

```txt
GET    /api/v1/cart
POST   /api/v1/cart/items
PATCH  /api/v1/cart/items/:id
DELETE /api/v1/cart/items/:id
DELETE /api/v1/cart
```

Kết quả phase 7:

- Khách thêm giỏ hàng được
- Backend không tin giá từ client

---

## 8. Phase 8 - Checkout và Order

Độ khó: khó  
Mục tiêu: đặt hàng an toàn, trừ kho đúng, tạo đơn đầy đủ.

### 8.1. Order schema

- [x] `Order`
- [x] `OrderItem`
- [x] `OrderStatusHistory`
- [x] `Customer`
- [x] `ShippingAddress`
- [x] `Payment`

### 8.2. Checkout logic

- [x] Nhận thông tin khách
- [x] Nhận địa chỉ giao hàng
- [x] Nhận ghi chú
- [x] Nhận payment method
- [x] Lấy lại cart từ database
- [x] Validate lại product/variant
- [x] Validate lại tồn kho
- [x] Tính lại giá server-side
- [x] Tính phí ship
- [x] Tạo customer nếu chưa có
- [x] Tạo order
- [x] Tạo order items
- [x] Trừ kho
- [x] Ghi inventory log
- [x] Tạo payment record
- [x] Đóng cart sau khi order thành công

Quan trọng: checkout phải dùng transaction.

```txt
Validate cart
-> Calculate total
-> Create order
-> Create order items
-> Decrease stock
-> Create payment
-> Close cart
```

API public:

```txt
POST /api/v1/checkout
GET  /api/v1/orders/:code
```

### 8.3. Order admin

- [x] List orders
- [x] Detail order
- [x] Update order status
- [x] Cancel order
- [x] Restore stock khi cancel nếu cần
- [x] Internal note
- [x] Status history

API admin:

```txt
GET   /api/v1/admin/orders
GET   /api/v1/admin/orders/:id
PATCH /api/v1/admin/orders/:id/status
PATCH /api/v1/admin/orders/:id/cancel
PATCH /api/v1/admin/orders/:id/note
```

Kết quả phase 8:

- Khách đặt hàng được
- Admin xử lý đơn được
- Tồn kho không bị lệch khi tạo/hủy đơn

---

## 9. Phase 9 - Payment và Shipping basic

Độ khó: trung bình  
Mục tiêu: đủ vận hành COD và chuyển khoản.

### 9.1. Payment

- [x] COD
- [x] Bank transfer
- [x] Payment status: unpaid/paid/refunded/failed
- [x] Admin xác nhận đã thanh toán
- [x] Lưu ghi chú thanh toán
- [ ] Lưu thông tin tài khoản ngân hàng trong settings

### 9.2. Shipping

- [ ] Cấu hình phí ship mặc định
- [ ] Cấu hình freeship theo ngưỡng
- [x] Lưu địa chỉ giao hàng vào order
- [ ] Lưu mã vận đơn nếu có
- [ ] Update shipping status

Kết quả phase 9:

- Shop bán hàng thực tế được bằng COD/chuyển khoản
- Admin kiểm soát thanh toán và vận chuyển

---

## 10. Phase 10 - Customer

Độ khó: trung bình  
Mục tiêu: lưu thông tin khách từ đơn hàng và xem lịch sử mua.

- [x] Lưu customer theo phone/email
- [x] List customers
- [x] Detail customer
- [x] Lịch sử đơn hàng
- [x] Địa chỉ khách
- [x] Ghi chú khách hàng
- [x] Phân loại khách nếu cần

API admin:

```txt
GET   /api/v1/admin/customers
GET   /api/v1/admin/customers/:id
GET   /api/v1/admin/customers/:id/orders
PATCH /api/v1/admin/customers/:id
```

Kết quả phase 10:

- Admin xem và chăm sóc khách hàng được

---

## 11. Phase 11 - Blog, Page, SEO

Độ khó: trung bình đến khó  
Mục tiêu: thay WooCommerce/WordPress nhưng giữ nền SEO.

### 11.1. Blog

- [x] Blog post CRUD
- [x] Blog category
- [x] Blog tag
- [x] Slug unique
- [x] Thumbnail
- [x] Content
- [x] Draft/published
- [x] SEO metadata

### 11.2. Page

- [ ] Trang liên hệ
- [ ] Chính sách bảo mật
- [ ] Chính sách vận chuyển
- [ ] Chính sách bảo hành
- [ ] Chính sách đổi trả
- [ ] FAQ
- [ ] SEO metadata

### 11.3. SEO

- [x] Meta title
- [x] Meta description
- [x] Canonical
- [x] Open Graph
- [x] Product schema data
- [x] Article schema data
- [x] Breadcrumb data
- [x] Sitemap API
- [x] Robots API
- [x] Redirect 301 table

Kết quả phase 11:

- Client Next.js có đủ API content
- SEO từ site cũ được giữ tốt hơn

---

## 12. Phase 12 - Notification và Queue

Độ khó: khó vừa  
Mục tiêu: email và tác vụ nền chạy qua BullMQ để không làm chậm API.

### 12.1. Redis/BullMQ

- [x] Cài `@nestjs/bullmq`, `bullmq`, `ioredis`
- [x] Tạo queue mail
- [ ] Tạo queue image nếu cần
- [ ] Tạo queue sitemap nếu cần
- [x] Retry job khi lỗi
- [x] Log job status

### 12.2. Email

- [x] Cấu hình SMTP/email provider
- [x] Email xác nhận đơn cho khách
- [x] Email thông báo đơn mới cho admin
- [ ] Email cập nhật trạng thái đơn
- [ ] Email contact form

Kết quả phase 12:

- Checkout không bị chậm vì gửi email
- Job lỗi có retry và log

---

## 13. Phase 13 - Settings và Homepage Management

Độ khó: trung bình  
Mục tiêu: Admin tự cấu hình nội dung website.

### 13.1. Settings

- [x] Logo
- [x] Favicon
- [x] Tên website
- [x] Hotline
- [x] Email
- [x] Địa chỉ
- [x] Zalo
- [x] Facebook
- [x] TikTok
- [x] Shopee
- [x] Google Maps
- [x] Phí ship
- [x] Freeship
- [ ] Bank account
- [x] Maintenance mode

### 13.2. Homepage sections

- [x] Hero banner
- [x] Banner sale
- [x] Section sản phẩm bán chạy
- [x] Section sản phẩm mới
- [x] Section sản phẩm nam/nữ
- [x] Feedback khách hàng
- [x] Video/lifestyle
- [x] CTA

Kết quả phase 13:

- Admin chỉnh nội dung website mà không cần sửa code

---

## 14. Phase 14 - Migration từ WordPress/WooCommerce

Độ khó: khó  
Mục tiêu: chuyển dữ liệu cũ sang backend mới và tránh mất SEO.

### 14.1. Chuẩn bị dữ liệu

- [ ] Export products
- [ ] Export categories
- [ ] Export tags
- [ ] Export product images
- [ ] Export variations
- [ ] Export SEO metadata
- [ ] Export blog posts
- [ ] Export pages
- [ ] Export old URLs

### 14.2. Import

- [ ] Import categories
- [ ] Import tags
- [ ] Import media
- [ ] Import products
- [ ] Import variants
- [ ] Import inventory
- [ ] Import blog
- [ ] Import pages
- [ ] Import redirects

### 14.3. SEO safety

- [ ] Giữ slug cũ nếu có thể
- [ ] Mapping old URL sang new URL
- [ ] Tạo redirect 301
- [ ] Kiểm tra redirect chain
- [ ] Kiểm tra redirect loop
- [ ] Generate sitemap mới
- [ ] Theo dõi 404 sau deploy

Kết quả phase 14:

- Dữ liệu cũ chạy trong hệ thống mới
- URL quan trọng không bị 404

---

## 15. Phase 15 - Analytics và Report

Độ khó: trung bình đến khó  
Mục tiêu: admin có số liệu vận hành cơ bản.

- [ ] Tổng doanh thu
- [ ] Tổng đơn hàng
- [ ] Đơn mới
- [ ] Sản phẩm bán chạy
- [ ] Sản phẩm sắp hết hàng
- [ ] Khách hàng mới
- [ ] Tỷ lệ hủy đơn
- [ ] Báo cáo theo ngày/tháng
- [ ] Export report

API admin:

```txt
GET /api/v1/admin/dashboard/overview
GET /api/v1/admin/reports/revenue
GET /api/v1/admin/reports/orders
GET /api/v1/admin/reports/products
```

Kết quả phase 15:

- Admin Dashboard có overview và report cơ bản

---

## 16. Phase 16 - Module nâng cao sau MVP

Độ khó: tùy module  
Mục tiêu: mở rộng sau khi MVP đã ổn.

### 16.1. Promotion

- [ ] Coupon percentage
- [ ] Coupon fixed amount
- [ ] Usage limit
- [ ] Date range
- [ ] Apply product/category
- [ ] Campaign sale

### 16.2. Review

- [ ] Khách gửi review
- [ ] Rating sao
- [ ] Admin duyệt review
- [ ] Ẩn/xóa review
- [ ] Tính rating trung bình

### 16.3. Wishlist

- [ ] Add wishlist
- [ ] Remove wishlist
- [ ] List wishlist
- [ ] Analytics sản phẩm được yêu thích

### 16.4. Customer account

- [ ] Đăng ký
- [ ] Đăng nhập customer
- [ ] Profile
- [ ] Address book
- [ ] Order history

### 16.5. Payment gateway online

- [ ] PayOS
- [ ] VNPay
- [ ] MoMo
- [ ] ZaloPay
- [ ] Webhook payment

Kết quả phase 16:

- Hệ thống có thêm tính năng tăng trưởng, không ảnh hưởng MVP lõi

---

## 17. Phase 17 - Testing và hardening

Độ khó: khó vừa  
Mục tiêu: giảm lỗi khi vận hành thật.

### 17.1. Unit test

- [ ] Auth service
- [ ] Product service
- [ ] Cart service
- [ ] Checkout service
- [ ] Order service

### 17.2. E2E test

- [ ] Admin login
- [ ] Create product
- [ ] Add cart
- [ ] Checkout
- [ ] Update order status

### 17.3. Security

- [ ] Rate limit login
- [ ] Validate DTO toàn bộ input
- [ ] Không expose database error
- [ ] CORS theo domain thật
- [ ] File upload giới hạn type/size
- [ ] Refresh token hash trong DB
- [ ] Không lưu plain password

Kết quả phase 17:

- Các flow quan trọng có test
- API an toàn hơn trước khi deploy

---

## 18. Phase 18 - Docker deploy

Độ khó: khó vừa  
Mục tiêu: chạy được production.

- [ ] Tạo `Dockerfile`
- [ ] Tạo `.dockerignore`
- [ ] Tạo docker compose production nếu deploy VPS
- [ ] Build Nest production
- [ ] Chạy migration production
- [ ] Setup env production
- [ ] Setup database backup
- [ ] Setup health check
- [ ] Setup log
- [ ] Setup domain/API URL
- [ ] Test CORS với Client App/Admin Dashboard

Kết quả phase 18:

- Backend sẵn sàng deploy production

---

## 19. Thứ tự ưu tiên ngắn gọn

Nếu chỉ nhìn danh sách ngắn, cứ follow thứ tự này:

```txt
1. Docker + PostgreSQL + Redis
2. PrismaService + Config + Swagger
3. Database schema core
4. Seed role + super admin
5. Auth admin
6. Category + Tag + Media
7. Product
8. Variant + Inventory
9. Public product API
10. Cart
11. Checkout
12. Order admin
13. Payment COD/Bank Transfer
14. Shipping basic
15. Customer
16. Blog + Page + SEO
17. Queue + Notification
18. Migration WordPress/WooCommerce
19. Analytics
20. Deploy Docker
```

---

## 20. Definition of Done cho MVP

MVP backend được xem là xong khi:

- [ ] Admin login được
- [ ] Admin tạo category/tag/media được
- [ ] Admin tạo product có ảnh, category, tag được
- [ ] Admin tạo variant và tồn kho được
- [ ] Client lấy list/detail product được
- [ ] Client thêm sản phẩm vào cart được
- [ ] Client checkout tạo order được
- [ ] Checkout trừ kho bằng transaction
- [ ] Admin xem và đổi trạng thái đơn được
- [ ] Payment COD/chuyển khoản hoạt động
- [ ] Shipping fee basic hoạt động
- [ ] Customer được lưu từ order
- [ ] Blog/page/SEO basic có API
- [ ] Swagger docs có đủ endpoint chính
- [ ] Docker chạy local ổn
- [ ] Có migration Prisma đầy đủ

---

## 21. Ghi chú kỹ thuật quan trọng

- Checkout phải luôn tính lại giá ở backend.
- Không nhận `totalPrice` từ client làm nguồn sự thật.
- Không trừ kho ngoài transaction.
- Khi hủy đơn cần quyết định rõ có hoàn kho hay không.
- Product có variant thì tồn kho nên theo variant.
- Product không có variant thì có thể tồn kho theo product.
- Slug, SKU, order code phải unique.
- API public chỉ trả product published.
- API admin phải qua JWT guard.
- Upload ảnh cần kiểm tra type và size.
- WordPress migration phải ưu tiên giữ slug và redirect 301.
