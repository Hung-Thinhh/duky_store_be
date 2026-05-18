# Duky Store FE API Contract

Tài liệu này dành cho frontend Client App và Admin Dashboard tuân thủ khi gọi API backend Duky Store.

Base URL local:

```txt
http://localhost:4000/api/v1
```

Swagger:

```txt
http://localhost:4000/api/v1/docs
```

---

## 1. Response chuẩn

Tất cả API JSON trả về theo format:

```json
{
  "EC": 0,
  "EM": "success",
  "DT": {}
}
```

Quy ước:

```txt
EC = 0: thành công
EC != 0: lỗi, thường là HTTP status code như 400, 401, 404, 500
EM = message
DT = data hoặc error details
```

### 1.1. Success list

```json
{
  "EC": 0,
  "EM": "success",
  "DT": {
    "data": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

### 1.2. Success detail

```json
{
  "EC": 0,
  "EM": "success",
  "DT": {
    "id": "xxx",
    "name": "Boot nam da"
  }
}
```

### 1.3. Error

```json
{
  "EC": 404,
  "EM": "Product not found",
  "DT": {
    "code": "404_NOT_FOUND",
    "path": "/api/v1/products/abc",
    "timestamp": "2026-05-09T00:00:00.000Z"
  }
}
```

### 1.4. Validation error

```json
{
  "EC": 400,
  "EM": "email must be an email",
  "DT": {
    "code": "400_BAD_REQUEST",
    "path": "/api/v1/admin/auth/login",
    "timestamp": "2026-05-09T00:00:00.000Z",
    "details": [
      "email must be an email",
      "password must be longer than or equal to 8 characters"
    ]
  }
}
```

### 1.5. Raw response ngoại lệ

Hai API này trả raw text/XML, không wrap `EC/EM/DT`:

```txt
GET /api/v1/sitemap.xml
GET /api/v1/robots.txt
```

---

## 2. Auth

Admin API cần header:

```txt
Authorization: Bearer <accessToken>
```

Public API không cần token.

### Login admin

```txt
POST /api/v1/admin/auth/login
```

Body:

```json
{
  "email": "admin@dukystore.local",
  "password": "Admin@123456"
}
```

Response:

```json
{
  "EC": 0,
  "EM": "success",
  "DT": {
    "accessToken": "...",
    "refreshToken": "...",
    "user": {
      "id": "xxx",
      "email": "admin@dukystore.local",
      "fullName": "Duky Super Admin",
      "roles": ["SUPER_ADMIN"]
    }
  }
}
```

### Login admin with Google

```txt
POST /api/v1/admin/auth/google
```

Body:

```json
{
  "idToken": "google_id_token",
  "clientId": "optional_google_oauth_client_id.apps.googleusercontent.com"
}
```

Notes:

- Backend must configure `GOOGLE_CLIENT_ID`, or `GOOGLE_CLIENT_IDS` for multiple OAuth clients.
- The Google account email must match an existing active admin user in `users`.
- Response shape is the same as email/password login.

### Auth routes

```txt
POST  /api/v1/admin/auth/login
POST  /api/v1/admin/auth/google
POST  /api/v1/admin/auth/refresh
POST  /api/v1/admin/auth/logout
GET   /api/v1/admin/auth/me
PATCH /api/v1/admin/auth/change-password
```

### Customer login with Google

```txt
POST /api/v1/customer/auth/google
```

Body:

```json
{
  "idToken": "google_id_token",
  "clientId": "optional_google_oauth_client_id.apps.googleusercontent.com"
}
```

Notes:

- Customer Google login auto-creates a row in `customers` when the Google email does not exist yet.
- Admin Google login does not auto-create admin users and still returns an authorization error for unknown emails.
- Backend uses `GOOGLE_CUSTOMER_CLIENT_IDS` when configured, otherwise falls back to `GOOGLE_CLIENT_IDS` / `GOOGLE_CLIENT_ID`.

Customer auth routes:

```txt
POST /api/v1/customer/auth/google
POST /api/v1/customer/auth/refresh
POST /api/v1/customer/auth/logout
GET  /api/v1/customer/auth/me
```

---

## 3. Public API

### 3.1. Products

```txt
GET /api/v1/products
GET /api/v1/products/:slug
```

Query list:

```txt
page?: number
limit?: number
search?: string
categorySlug?: string
tagSlug?: string
minPrice?: number
maxPrice?: number
sort?: newest | price_asc | price_desc
```

Example:

```txt
GET /api/v1/products?page=1&limit=20&categorySlug=giay-boot-nam
```

### 3.2. Categories

```txt
GET /api/v1/categories
GET /api/v1/categories/:slug
GET /api/v1/categories/:slug/products
```

### 3.3. Blog

```txt
GET /api/v1/blog
GET /api/v1/blog/:slug
GET /api/v1/blog/categories
GET /api/v1/blog/categories/:slug
```

Query blog list:

```txt
page?: number
limit?: number
search?: string
categorySlug?: string
tagSlug?: string
sort?: newest | oldest
```

### 3.4. Homepage

```txt
GET /api/v1/homepage
```

Trả danh sách section đã publish, có items, imageMedia, product nếu item gắn sản phẩm.

### 3.5. Settings public

```txt
GET /api/v1/settings/public
GET /api/v1/settings/public?group=site
```

Response có cả list và grouped:

```json
{
  "EC": 0,
  "EM": "success",
  "DT": {
    "data": [],
    "grouped": {
      "site": {
        "site.name": "Duky Store"
      }
    }
  }
}
```

### 3.6. Cart

Guest cart dùng `sessionId`. FE tự tạo `sessionId` và lưu localStorage/cookie.

```txt
GET    /api/v1/cart?sessionId=guest-session-uuid
POST   /api/v1/cart/items
PATCH  /api/v1/cart/items/:id
DELETE /api/v1/cart/items/:id?sessionId=guest-session-uuid
DELETE /api/v1/cart?sessionId=guest-session-uuid
```

Add item body:

```json
{
  "sessionId": "guest-session-uuid",
  "productId": "product-id",
  "variantId": "variant-id",
  "quantity": 1
}
```

Update item body:

```json
{
  "sessionId": "guest-session-uuid",
  "quantity": 2
}
```

### 3.7. Checkout

```txt
POST /api/v1/checkout
GET  /api/v1/orders/:code?phone=0901234567
```

Checkout body:

```json
{
  "sessionId": "guest-session-uuid",
  "customerName": "Nguyen Van A",
  "customerPhone": "0901234567",
  "customerEmail": "a@example.com",
  "paymentMethod": "COD",
  "addressLine": "12 Nguyen Trai",
  "ward": "Phuong A",
  "district": "Quan 1",
  "province": "TP.HCM",
  "country": "VN",
  "customerNote": "Giao giờ hành chính",
  "shippingNote": "Gọi trước khi giao"
}
```

Lưu ý:

- FE không gửi tổng tiền.
- Backend tự tính lại giá, tồn kho, ship fee.
- `paymentMethod` MVP: `COD`, `BANK_TRANSFER`.

### 3.8. SEO

```txt
GET /api/v1/seo/metadata?entityType=PRODUCT&entityId=xxx
GET /api/v1/seo/redirect?path=/old-url
GET /api/v1/sitemap.xml
GET /api/v1/robots.txt
```

---

## 4. Admin API

Tất cả route dưới đây cần bearer token.

### 4.1. Admin users

```txt
GET   /api/v1/admin/users
GET   /api/v1/admin/users/roles
GET   /api/v1/admin/users/:id
PATCH /api/v1/admin/users/:id
PATCH /api/v1/admin/users/:id/lock
PATCH /api/v1/admin/users/:id/unlock
PATCH /api/v1/admin/users/:id/roles
```

### 4.2. Products

```txt
GET    /api/v1/admin/products
POST   /api/v1/admin/products
GET    /api/v1/admin/products/:id
PATCH  /api/v1/admin/products/:id
DELETE /api/v1/admin/products/:id
```

Create/update product body mẫu:

```json
{
  "name": "Boot nam da bò",
  "slug": "boot-nam-da-bo",
  "sku": "BOOT-NAM-001",
  "type": "SIMPLE",
  "status": "PUBLISHED",
  "originalPrice": 1200000,
  "salePrice": 990000,
  "contactForPrice": false,
  "shortDescription": "Boot nam da bò cao cấp",
  "description": "Mô tả dài...",
  "thumbnailMediaId": "media-id",
  "categoryIds": ["category-id"],
  "tagIds": ["tag-id"],
  "images": [
    {
      "mediaId": "media-id",
      "altText": "Boot nam da bò",
      "sortOrder": 0,
      "isPrimary": true
    }
  ],
  "seo": {
    "metaTitle": "Boot nam da bò",
    "metaDescription": "Boot nam da bò cao cấp",
    "canonicalUrl": "/san-pham/boot-nam-da-bo"
  }
}
```

### 4.3. Product variants

```txt
GET    /api/v1/admin/products/:productId/variants
POST   /api/v1/admin/products/:productId/variants
GET    /api/v1/admin/product-variants/:id
PATCH  /api/v1/admin/product-variants/:id
DELETE /api/v1/admin/product-variants/:id
```

Body mẫu:

```json
{
  "sku": "BOOT-NAM-001-42",
  "sizeLabel": "42",
  "sizeGender": "MEN",
  "colorName": "Black",
  "colorHex": "#000000",
  "price": 1200000,
  "salePrice": 990000,
  "isActive": true,
  "sortOrder": 0
}
```

### 4.4. Inventory

```txt
GET   /api/v1/admin/inventory
GET   /api/v1/admin/inventory/:id
GET   /api/v1/admin/inventory/:id/logs
PATCH /api/v1/admin/inventory/:id/adjust
```

### 4.5. Categories

```txt
GET    /api/v1/admin/categories
POST   /api/v1/admin/categories
GET    /api/v1/admin/categories/:id
PATCH  /api/v1/admin/categories/:id
DELETE /api/v1/admin/categories/:id
```

### 4.6. Tags

```txt
GET    /api/v1/admin/tags
POST   /api/v1/admin/tags
GET    /api/v1/admin/tags/:id
PATCH  /api/v1/admin/tags/:id
DELETE /api/v1/admin/tags/:id
```

### 4.7. Media

```txt
GET    /api/v1/admin/media
POST   /api/v1/admin/media/external
GET    /api/v1/admin/media/:id
PATCH  /api/v1/admin/media/:id
DELETE /api/v1/admin/media/:id
```

Hiện tại có external media record. Upload file binary trực tiếp lên Cloudinary/R2 chưa hoàn thiện.

### 4.8. Orders

```txt
GET   /api/v1/admin/orders
GET   /api/v1/admin/orders/:id
PATCH /api/v1/admin/orders/:id/status
PATCH /api/v1/admin/orders/:id/cancel
PATCH /api/v1/admin/orders/:id/note
PATCH /api/v1/admin/orders/:id/payment
```

Update status body:

```json
{
  "status": "CONFIRMED",
  "note": "Đã xác nhận đơn"
}
```

Update payment body:

```json
{
  "status": "PAID",
  "transactionCode": "BANK123",
  "note": "Khách đã chuyển khoản"
}
```

### 4.9. Customers

```txt
GET   /api/v1/admin/customers
GET   /api/v1/admin/customers/:id
GET   /api/v1/admin/customers/:id/orders
PATCH /api/v1/admin/customers/:id
```

### 4.10. Blog

```txt
GET    /api/v1/admin/blog-categories
POST   /api/v1/admin/blog-categories
GET    /api/v1/admin/blog-categories/:id
PATCH  /api/v1/admin/blog-categories/:id
DELETE /api/v1/admin/blog-categories/:id

GET    /api/v1/admin/blog-posts
POST   /api/v1/admin/blog-posts
GET    /api/v1/admin/blog-posts/:id
PATCH  /api/v1/admin/blog-posts/:id
DELETE /api/v1/admin/blog-posts/:id
```

### 4.11. Homepage

```txt
GET    /api/v1/admin/homepage/sections
POST   /api/v1/admin/homepage/sections
GET    /api/v1/admin/homepage/sections/:id
PATCH  /api/v1/admin/homepage/sections/:id
DELETE /api/v1/admin/homepage/sections/:id

POST   /api/v1/admin/homepage/sections/:id/items
PATCH  /api/v1/admin/homepage/items/:id
DELETE /api/v1/admin/homepage/items/:id
```

Section body mẫu:

```json
{
  "type": "HERO",
  "title": "Duky Store",
  "subtitle": "Boot và thời trang cá tính",
  "content": "Nội dung section",
  "imageMediaId": "media-id",
  "ctaLabel": "Mua ngay",
  "ctaUrl": "/san-pham",
  "status": "PUBLISHED",
  "sortOrder": 0,
  "metadata": {},
  "items": []
}
```

### 4.12. SEO redirects

```txt
GET    /api/v1/admin/redirects
POST   /api/v1/admin/redirects
GET    /api/v1/admin/redirects/:id
PATCH  /api/v1/admin/redirects/:id
DELETE /api/v1/admin/redirects/:id
```

Body:

```json
{
  "sourcePath": "/old-url/",
  "targetPath": "/new-url/",
  "statusCode": 301,
  "status": "ACTIVE"
}
```

### 4.13. Settings

```txt
GET   /api/v1/admin/settings
GET   /api/v1/admin/settings/:key
POST  /api/v1/admin/settings
PATCH /api/v1/admin/settings/bulk
```

Upsert setting body:

```json
{
  "key": "site.name",
  "group": "site",
  "value": "Duky Store",
  "valueType": "STRING",
  "isPublic": true,
  "description": "Tên website"
}
```

### 4.14. Notifications

```txt
GET  /api/v1/admin/notifications/logs
POST /api/v1/admin/notifications/test-email
```

---

## 5. Enum FE cần map

### ProductStatus

```txt
DRAFT
PUBLISHED
HIDDEN
SOLD_OUT
DISCONTINUED
```

### ProductType

```txt
SIMPLE
VARIABLE
```

### ContentStatus

```txt
DRAFT
PUBLISHED
HIDDEN
ARCHIVED
```

### OrderStatus

```txt
PENDING
CONFIRMED
PROCESSING
SHIPPING
COMPLETED
CANCELLED
REFUNDED
```

### PaymentStatus

```txt
UNPAID
PAID
PARTIALLY_PAID
REFUNDED
FAILED
```

### ShippingStatus

```txt
NOT_SHIPPED
READY_TO_SHIP
SHIPPING
DELIVERED
RETURNED
FAILED
```

### PaymentMethod

```txt
COD
BANK_TRANSFER
PAYOS
VNPAY
MOMO
ZALOPAY
```

MVP frontend chỉ nên bật:

```txt
COD
BANK_TRANSFER
```

### CustomerStatus

```txt
ACTIVE
BLOCKED
```

### CustomerType

```txt
NEW
REGULAR
VIP
WHOLESALE
```

### TagType

```txt
PRODUCT
BLOG
BOTH
```

### HomepageSectionType

```txt
HERO
SALE_BANNER
FEATURED_PRODUCTS
BEST_SELLERS
NEW_PRODUCTS
MEN_PRODUCTS
WOMEN_PRODUCTS
FEEDBACK
VIDEO
SERVICE_COMMITMENT
CTA
CUSTOM
```

### SettingValueType

```txt
STRING
NUMBER
BOOLEAN
JSON
IMAGE
```

---

## 6. FE handling guideline

### 6.1. API helper

FE nên unwrap theo `EC`:

```ts
type ApiResponse<T> = {
  EC: number;
  EM: string;
  DT: T;
};

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${url}`, options);
  const json = (await res.json()) as ApiResponse<T>;

  if (json.EC !== 0) {
    throw new Error(json.EM);
  }

  return json.DT;
}
```

### 6.2. Admin auth

- Lưu `accessToken` để gọi admin API.
- Gửi header `Authorization: Bearer <token>`.
- Khi nhận `EC = 401`, thử refresh token hoặc logout.

### 6.3. Cart session

- Client guest phải tự tạo `sessionId`.
- Lưu `sessionId` trong localStorage/cookie.
- Dùng cùng `sessionId` cho cart và checkout.

### 6.4. Money

- Backend lưu tiền dạng integer VND.
- FE format hiển thị bằng `Intl.NumberFormat('vi-VN')`.
- FE không tự tính tổng checkout làm nguồn sự thật.

---

## 7. Schema hiện tại đã đủ chưa?

Schema Prisma hiện tại đã khá đầy đủ cho MVP và phần lớn admin:

```txt
Auth/User/Role/Permission
Product/Category/Tag/Variant/Image
Inventory/InventoryLog
Cart/CartItem
Order/OrderItem/Payment/ShippingAddress/Shipment
Customer/CustomerAddress
BlogCategory/BlogPost
Media
SeoMetadata/Redirect/Sitemap/Robots
NotificationTemplate/NotificationLog/BackgroundJob
Setting
HomepageSection/HomepageItem
Coupon/Campaign/Wishlist/Review
MigrationBatch/MigrationRecord
AnalyticsEvent/SearchQueryLog/ReportExport
```

Những phần schema có rồi nhưng API chưa làm hoặc chưa hoàn thiện:

```txt
Coupon/Campaign
Review
Wishlist
Migration importer
Analytics/report
Contact submission
Bank account admin
Shipping zone/rate admin
Binary file upload Cloudinary/R2
Page tĩnh
```

Kết luận:

```txt
Schema đủ rộng cho MVP và mở rộng.
API hiện đủ cho admin/product/order/customer/blog/seo/homepage/settings.
API còn thiếu cho migration từ WP/WooCommerce, coupon/review/wishlist/contact/analytics và upload file thật.
```
