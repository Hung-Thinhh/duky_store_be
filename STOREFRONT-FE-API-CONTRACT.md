# Duky Storefront FE API Contract

Tai lieu nay danh cho client trang ban hang ket noi voi Backend Duky Store.

Base URL:

```txt
Local: http://localhost:4000/api/v1
Prod:  https://<be-domain>/api/v1
Swagger: /api/v1/docs
```

Trang storefront khong goi truc tiep DB. Moi request tu FE di qua API backend.

---

## 1. Chuan response

Tat ca API JSON thanh cong deu duoc wrap:

```ts
type ApiResponse<T> = {
  EC: 0;
  EM: "success" | string;
  DT: T;
};
```

List co pagination:

```ts
type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type PaginatedData<T> = {
  data: T[];
  pagination: Pagination;
};
```

Error response:

```ts
type ApiError = {
  EC: number;        // HTTP status, vi du 400, 401, 404, 500
  EM: string;        // message
  DT: {
    code: string;
    path: string;
    timestamp: string;
    details?: unknown;
  };
};
```

Ngoai le:

- `GET /media/files/:fileName` tra file binary, khong wrap `EC/EM/DT`.
- `GET /sitemap.xml` tra XML.
- `GET /robots.txt` tra text/plain.

---

## 2. Auth, session va header

### 2.1. Public endpoints

Khong can token:

- Product, category, homepage, blog, settings public, SEO.
- Cart/checkout dang dung `sessionId` cua guest.

### 2.2. Customer auth endpoints

Dung Bearer token cho endpoint customer can login:

```txt
Authorization: Bearer <customerAccessToken>
```

Hien tai customer auth chi ho tro Google login:

- `POST /customer/auth/google`
- `POST /customer/auth/refresh`
- `POST /customer/auth/logout`
- `GET /customer/auth/me`

### 2.3. Guest cart session

Storefront tu tao va luu `sessionId` trong localStorage/cookie.

Quy uoc:

```ts
sessionId: string; // min length 8, nen dung crypto.randomUUID()
```

Cart, checkout dung `sessionId` nay de tim gio hang.

---

## 3. Enums

```ts
type ProductStatus = "DRAFT" | "PUBLISHED" | "HIDDEN" | "SOLD_OUT" | "DISCONTINUED";
type ProductType = "SIMPLE" | "GROUPED" | "EXTERNAL" | "VARIABLE";
type ProductCatalogVisibility = "VISIBLE" | "CATALOG" | "SEARCH" | "HIDDEN";
type CategoryStatus = "ACTIVE" | "INACTIVE";

type CartStatus = "ACTIVE" | "CHECKED_OUT" | "ABANDONED" | "EXPIRED";

type PaymentMethod = "COD" | "BANK_TRANSFER" | "PAYOS" | "VNPAY" | "MOMO" | "ZALOPAY";
type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPING"
  | "COMPLETED"
  | "RETURNED"
  | "CANCELLED"
  | "REFUNDED";
type PaymentStatus = "UNPAID" | "PAID" | "PARTIALLY_PAID" | "REFUNDED" | "FAILED";
type ShippingStatus = "NOT_SHIPPED" | "READY_TO_SHIP" | "SHIPPING" | "DELIVERED" | "RETURNED" | "FAILED";

type ContentStatus = "DRAFT" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";
type SeoEntityType = "PRODUCT" | "CATEGORY" | "TAG" | "BLOG_POST" | "BLOG_CATEGORY" | "PAGE" | "HOMEPAGE" | "SYSTEM";
```

---

## 4. Shared schemas

### 4.1. Media

```ts
type MediaSummary = {
  id: string;
  url: string;
  secureUrl?: string | null;
  fileName?: string;
  altText?: string | null;
  title?: string | null;
  width?: number | null;
  height?: number | null;
};
```

### 4.2. SEO metadata

```ts
type SeoMetadata = {
  id: string;
  entityType: SeoEntityType;
  entityId: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageMediaId?: string | null;
  ogImage?: MediaSummary | null;
  twitterTitle?: string | null;
  twitterDescription?: string | null;
  focusKeyword?: string | null;
  seoScore?: number | null;
  analysisJson?: unknown;
  schemaType?: string | null;
  schemaJson?: unknown;
  breadcrumbJson?: unknown;
  noIndex: boolean;
  noFollow: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### 4.3. Inventory

```ts
type InventorySummary = {
  id?: string;
  quantity?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  lowStockThreshold?: number;
  soldOut?: boolean;
  isLowStock?: boolean;
  createdAt?: string;
  updatedAt?: string;
};
```

---

## 5. Product APIs

### 5.1. List products

```txt
GET /products
```

Query:

```ts
type ListProductsQuery = {
  page?: number;          // default 1
  limit?: number;         // default 20, max 100
  search?: string;
  categorySlug?: string;
  tagSlug?: string;
  isFeatured?: boolean;
  isBestSeller?: boolean;
  isNewArrival?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: "newest" | "price_asc" | "price_desc";
};
```

Response:

```ts
type ProductListItem = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  type: ProductType;
  status: ProductStatus;
  catalogVisibility: ProductCatalogVisibility;
  originalPrice: number;
  salePrice: number | null;
  contactForPrice: boolean;
  thumbnailMediaId: string | null;
  thumbnailMedia?: MediaSummary | null;
  image?: {
    id: string;
    mediaId: string;
    altText?: string | null;
    sortOrder: number;
    isPrimary: boolean;
    media: MediaSummary;
  } | null;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListProductsResponse = ApiResponse<PaginatedData<ProductListItem>>;
```

Example:

```http
GET /api/v1/products?page=1&limit=12&categorySlug=boot-nu&sort=newest
GET /api/v1/products?isFeatured=true&limit=8
GET /api/v1/products?isBestSeller=true&limit=8
GET /api/v1/products?isNewArrival=true&limit=8
```

### 5.2. Product detail by slug

```txt
GET /products/:slug
```

Response:

```ts
type CategorySummary = {
  id: string;
  name: string;
  slug: string;
  status?: string;
};

type TagSummary = {
  id: string;
  name: string;
  slug: string;
  type?: string;
};

type BrandSummary = {
  id: string;
  name: string;
  slug: string;
  logoMediaId?: string | null;
};

type ProductImage = {
  id: string;
  mediaId: string;
  altText?: string | null;
  sortOrder: number;
  isPrimary: boolean;
  media: MediaSummary;
};

type ProductRelation = {
  id: string;
  name: string;
  slug: string;
  sku?: string | null;
  relationType: "RELATED" | "UPSELL" | "CROSS_SELL";
  sortOrder: number;
};

type ProductDetail = ProductListItem & {
  shortDescription?: string | null;
  description?: string | null;
  additionalInfo?: unknown;
  sizeGuide?: unknown;
  externalUrl?: string | null;
  externalButtonText?: string | null;
  soldIndividually: boolean;
  purchaseNote?: string | null;
  menuOrder: number;
  enableReviews: boolean;
  viewCount: number;
  soldCount: number;
  categories: CategorySummary[];
  categoryIds: string[];
  tags: TagSummary[];
  tagIds: string[];
  brands: BrandSummary[];
  brandIds: string[];
  images: ProductImage[];
  variantsCount: number;
  reviewsCount: number;
  shipping?: {
    id: string;
    weight?: number | null;
    length?: number | null;
    width?: number | null;
    height?: number | null;
    shippingClass?: string | null;
  } | null;
  inventory?: InventorySummary | null;
  relations: {
    relatedProductIds: string[];
    upsellIds: string[];
    crossSellIds: string[];
    relatedProducts: ProductRelation[];
  };
  seo?: SeoMetadata | null;
};

type ProductDetailResponse = ApiResponse<ProductDetail>;
```

Example:

```http
GET /api/v1/products/boot-nu-zip-10cm
```

### 5.3. Product variants by slug

```txt
GET /products/:slug/variants
```

Dung endpoint nay o trang chi tiet san pham de render size/mau/SKU va lay `variantId` khi add to cart.

Response:

```ts
type ProductVariant = {
  id: string;
  productId: string;
  name?: string | null;
  sku: string;
  sizeLabel?: string | null;
  sizeGender?: "MEN" | "WOMEN" | "UNISEX" | null;
  colorName?: string | null;
  colorHex?: string | null;
  price?: number | null;
  salePrice?: number | null;
  isActive: boolean;
  sortOrder: number;
  inventory?: InventorySummary | null;
  createdAt?: string;
  updatedAt?: string;
};

type ProductVariantsResponse = ApiResponse<{ data: ProductVariant[] }>;
```

---

## 6. Category APIs

### 6.1. List active categories

```txt
GET /categories
```

Response:

```ts
type Category = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  parent?: { id: string; name: string; slug: string } | null;
  imageMediaId?: string | null;
  imageMedia?: MediaSummary | null;
  sortOrder: number;
  status: CategoryStatus;
  childrenCount: number;
  productsCount: number;
  createdAt: string;
  updatedAt: string;
  seo?: SeoMetadata | null;
};

type ListCategoriesResponse = ApiResponse<{ data: Category[] }>;
```

### 6.2. Category detail

```txt
GET /categories/:slug
```

Response:

```ts
type CategoryDetailResponse = ApiResponse<Category>;
```

### 6.3. Products in category

```txt
GET /categories/:slug/products
```

Query same `ListProductsQuery`, but `categorySlug` is taken from path.

Response:

```ts
type CategoryProductsResponse = ApiResponse<PaginatedData<ProductListItem>>;
```

---

## 7. Homepage API

```txt
GET /homepage
```

Response:

```ts
type HomepageItem = {
  id: string;
  sectionId: string;
  productId?: string | null;
  imageMediaId?: string | null;
  title?: string | null;
  subtitle?: string | null;
  content?: string | null;
  linkUrl?: string | null;
  sortOrder: number;
  metadata?: unknown;
  imageMedia?: Pick<MediaSummary, "id" | "url" | "secureUrl" | "altText" | "title"> | null;
  product?: {
    id: string;
    name: string;
    slug: string;
    status: ProductStatus;
    originalPrice: number;
    salePrice?: number | null;
    thumbnailMedia?: Pick<MediaSummary, "id" | "url" | "secureUrl" | "altText"> | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

type HomepageSection = {
  id: string;
  type:
    | "HERO"
    | "SALE_BANNER"
    | "FEATURED_PRODUCTS"
    | "BEST_SELLERS"
    | "NEW_PRODUCTS"
    | "MEN_PRODUCTS"
    | "WOMEN_PRODUCTS"
    | "FEEDBACK"
    | "VIDEO"
    | "SERVICE_COMMITMENT"
    | "CTA"
    | "CUSTOM";
  title?: string | null;
  subtitle?: string | null;
  content?: string | null;
  imageMediaId?: string | null;
  imageMedia?: Pick<MediaSummary, "id" | "url" | "secureUrl" | "altText" | "title"> | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  status: ContentStatus;
  sortOrder: number;
  metadata?: unknown;
  items: HomepageItem[];
  createdAt: string;
  updatedAt: string;
};

type HomepageResponse = ApiResponse<{ data: HomepageSection[] }>;
```

---

## 8. Cart APIs

Cart la guest cart theo `sessionId`.

### 8.1. Get or create cart

```txt
GET /cart?sessionId=<sessionId>
```

Response:

```ts
type CartItem = {
  id: string;
  productId: string;
  variantId?: string | null;
  productName: string;
  variantName?: string | null;
  sku?: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  product?: {
    id: string;
    name: string;
    slug: string;
    status: ProductStatus;
    thumbnailMedia?: Pick<MediaSummary, "id" | "url" | "secureUrl" | "altText"> | null;
  };
  variant?: {
    id: string;
    name?: string | null;
    sku: string;
    sizeLabel?: string | null;
    sizeGender?: string | null;
    colorName?: string | null;
    colorHex?: string | null;
    isActive: boolean;
  } | null;
};

type Cart = {
  id: string;
  sessionId?: string | null;
  status: CartStatus;
  currency: string;
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  total: number;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items: CartItem[];
};

type CartResponse = ApiResponse<Cart>;
```

### 8.2. Add item

```txt
POST /cart/items
```

Body:

```ts
type AddCartItemBody = {
  sessionId: string;
  productId: string;
  variantId?: string;
  quantity: number; // min 1
};
```

Response: `CartResponse`

### 8.3. Update item quantity

```txt
PATCH /cart/items/:id
```

Body:

```ts
type UpdateCartItemBody = {
  sessionId: string;
  quantity: number; // min 1
};
```

Response: `CartResponse`

### 8.4. Remove item

```txt
DELETE /cart/items/:id?sessionId=<sessionId>
```

Response: `CartResponse`

### 8.5. Clear cart

```txt
DELETE /cart?sessionId=<sessionId>
```

Response: `CartResponse`

---

## 9. Checkout and order lookup

### 9.1. Checkout

```txt
POST /checkout
```

Body:

```ts
type CheckoutBody = {
  sessionId: string;
  customerName: string;       // 2..120
  customerPhone: string;      // 8..20
  customerEmail?: string;     // email
  paymentMethod: PaymentMethod; // UI nen mo COD/BANK_TRANSFER truoc neu chua tich hop cong thanh toan
  addressLine: string;        // 5..255
  ward?: string;
  district?: string;
  province?: string;
  country?: string;           // default VN
  customerNote?: string;
  shippingNote?: string;
};
```

Response:

```ts
type OrderItem = {
  id: string;
  orderId: string;
  productId?: string | null;
  variantId?: string | null;
  productName: string;
  variantName?: string | null;
  sku?: string | null;
  unitPrice: number;
  quantity: number;
  discountTotal: number;
  lineTotal: number;
  createdAt: string;
};

type ShippingAddress = {
  id: string;
  orderId: string;
  fullName: string;
  phone: string;
  addressLine: string;
  ward?: string | null;
  district?: string | null;
  province?: string | null;
  country: string;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

type Payment = {
  id: string;
  orderId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  transactionCode?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type Shipment = {
  id: string;
  orderId: string;
  carrier?: string | null;
  trackingCode?: string | null;
  status: ShippingStatus;
  shippingFee: number;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type Order = {
  id: string;
  code: string;
  customerId?: string | null;
  cartId?: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  shippingStatus: ShippingStatus;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  grandTotal: number;
  customerNote?: string | null;
  source?: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  payments: Payment[];
  shippingAddress?: ShippingAddress | null;
  shipments: Shipment[];
  statusHistories: Array<{
    id: string;
    orderId: string;
    fromStatus?: OrderStatus | null;
    toStatus: OrderStatus;
    note?: string | null;
    createdAt: string;
  }>;
};

type CheckoutResponse = ApiResponse<Order>;
```

Notes:

- Checkout se tru ton kho va chuyen cart sang `CHECKED_OUT`.
- Neu cart rong, san pham het hang, variant khong active, API tra 400.

### 9.2. Public order lookup

```txt
GET /orders/:code?phone=<customerPhone>
```

Response: `ApiResponse<Order>`

---

## 10. Customer auth APIs

### 10.1. Google login

```txt
POST /customer/auth/google
```

Body:

```ts
type GoogleLoginBody = {
  idToken: string;
  clientId?: string;
};
```

Response:

```ts
type Customer = {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  status: "ACTIVE" | "BLOCKED";
  type: "NEW" | "REGULAR" | "VIP" | "WHOLESALE";
  emailVerifiedAt?: string | null;
};

type CustomerAuthResponse = ApiResponse<{
  tokenType: "Bearer";
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
  customer: Customer;
}>;
```

### 10.2. Refresh token

```txt
POST /customer/auth/refresh
```

Body:

```ts
type RefreshBody = {
  refreshToken: string;
};
```

Response: `CustomerAuthResponse`

### 10.3. Logout

```txt
POST /customer/auth/logout
```

Body: `RefreshBody`

Response:

```ts
type LogoutResponse = ApiResponse<{ success: true }>;
```

### 10.4. Me

```txt
GET /customer/auth/me
Authorization: Bearer <customerAccessToken>
```

Response:

```ts
type CustomerMeResponse = ApiResponse<Customer>;
```

Important gaps hien tai:

- Chua co email/password register/login cho customer.
- Chua co `GET /customer/orders` lich su don hang theo token.
- Neu storefront can trang tai khoan day du, can bo sung hai nhom tren.

---

## 11. Settings public API

```txt
GET /settings/public
```

Query:

```ts
type ListSettingsQuery = {
  group?: string;
  search?: string;
};
```

Response:

```ts
type Setting = {
  id: string;
  key: string;
  group: string;
  value: unknown;
  valueType: "STRING" | "NUMBER" | "BOOLEAN" | "JSON" | "IMAGE";
  isPublic: boolean;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

type PublicSettingsResponse = ApiResponse<{
  data: Setting[];
  grouped: Record<string, Record<string, unknown>>;
}>;
```

Common keys seeded:

```txt
site.name
site.currency
site.logo
site.favicon
contact.hotline
contact.email
social.zalo
social.facebook
social.tiktok
social.shopee
shipping.default_fee
shipping.free_threshold
system.maintenance_mode
seo.default_title
seo.default_description
```

---

## 12. SEO APIs

### 12.1. Metadata by entity

```txt
GET /seo/metadata?entityType=PRODUCT&entityId=<id>
```

Query:

```ts
type SeoMetadataQuery = {
  entityType: SeoEntityType;
  entityId: string;
};
```

Response:

```ts
type SeoMetadataResponse = ApiResponse<SeoMetadata>;
```

Note: Product/category/blog detail da co field `seo` neu co metadata.

### 12.2. Redirect lookup

```txt
GET /seo/redirect?path=/old-url
```

Response:

```ts
type Redirect = {
  id: string;
  sourcePath: string;
  targetPath: string;
  statusCode: number;
  status: "ACTIVE" | "INACTIVE";
  hitCount: number;
  lastHitAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type RedirectResponse = ApiResponse<Redirect>;
```

### 12.3. Sitemap and robots

```txt
GET /sitemap.xml
GET /robots.txt
```

These endpoints are not JSON wrapped.

---

## 13. Blog APIs

### 13.1. List posts

```txt
GET /blog
```

Query:

```ts
type ListBlogPostsQuery = {
  page?: number;
  limit?: number;
  search?: string;
  categorySlug?: string;
  tagSlug?: string;
  sort?: "newest" | "oldest";
};
```

Response:

```ts
type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  content: string;
  coverMediaId?: string | null;
  coverMedia?: MediaSummary | null;
  status: ContentStatus;
  authorId?: string | null;
  author?: { id: string; fullName: string; email: string } | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  categories: BlogCategory[];
  tags: TagSummary[];
  seo?: SeoMetadata | null;
};

type ListBlogPostsResponse = ApiResponse<PaginatedData<BlogPost>>;
```

### 13.2. Post detail

```txt
GET /blog/:slug
```

Response:

```ts
type BlogPostDetailResponse = ApiResponse<BlogPost>;
```

### 13.3. List blog categories

```txt
GET /blog/categories
```

Response:

```ts
type BlogCategory = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  parent?: { id: string; name: string; slug: string } | null;
  sortOrder: number;
  status: ContentStatus;
  childrenCount: number;
  postsCount: number;
  createdAt: string;
  updatedAt: string;
  seo?: SeoMetadata | null;
};

type ListBlogCategoriesResponse = ApiResponse<{ data: BlogCategory[] }>;
```

### 13.4. Blog category detail

```txt
GET /blog/categories/:slug
```

Response:

```ts
type BlogCategoryDetailResponse = ApiResponse<BlogCategory>;
```

---

## 14. Media files

```txt
GET /media/files/:fileName
```

Tra file anh local upload. URL thuong nam trong `media.url` hoac `media.secureUrl`.

---

## 15. Page-to-API map

### 15.1. App layout/header/footer

Call khi boot app:

```txt
GET /settings/public
GET /categories
GET /cart?sessionId=<sessionId>
```

Neu co SEO middleware:

```txt
GET /seo/redirect?path=<currentPath>
```

### 15.2. Home page `/`

```txt
GET /homepage
GET /settings/public?group=site
GET /settings/public?group=social
```

Homepage sections da co items/product mini. Neu can carousel san pham rieng:

```txt
GET /products?limit=12&sort=newest
```

### 15.3. Product listing `/san-pham`

```txt
GET /products?page=1&limit=24&sort=newest
GET /categories
GET /settings/public?group=seo
```

Filter/search:

```txt
GET /products?search=<keyword>
GET /products?categorySlug=<slug>
GET /products?minPrice=500000&maxPrice=1500000
GET /products?sort=price_asc
```

### 15.4. Category page `/danh-muc/:slug`

```txt
GET /categories/:slug
GET /categories/:slug/products?page=1&limit=24&sort=newest
```

### 15.5. Product detail `/san-pham/:slug`

```txt
GET /products/:slug
```

Can bo sung de chon bien the:

```txt
GET /products/:slug/variants
```

Add to cart:

```txt
POST /cart/items
```

Body:

```json
{
  "sessionId": "guest-session-id",
  "productId": "product-id",
  "variantId": "variant-id-if-any",
  "quantity": 1
}
```

### 15.6. Cart page `/gio-hang`

```txt
GET /cart?sessionId=<sessionId>
PATCH /cart/items/:id
DELETE /cart/items/:id?sessionId=<sessionId>
DELETE /cart?sessionId=<sessionId>
```

### 15.7. Checkout page `/thanh-toan`

```txt
GET /cart?sessionId=<sessionId>
POST /checkout
```

Sau checkout thanh cong:

```txt
Redirect FE sang /don-hang/:code?phone=<phone>
GET /orders/:code?phone=<phone>
```

### 15.8. Order lookup page `/tra-cuu-don-hang`

```txt
GET /orders/:code?phone=<phone>
```

### 15.9. Customer account pages

Login Google:

```txt
POST /customer/auth/google
GET /customer/auth/me
POST /customer/auth/refresh
POST /customer/auth/logout
```

Can bo sung neu lam account dashboard:

```txt
GET /customer/orders
GET /customer/orders/:code
PATCH /customer/profile
```

### 15.10. Blog list/detail

```txt
GET /blog?page=1&limit=10
GET /blog/categories
GET /blog/categories/:slug
GET /blog?categorySlug=<slug>
GET /blog/:slug
```

### 15.11. SEO routes

Server/Next route handlers nen expose:

```txt
GET /sitemap.xml      -> proxy BE /api/v1/sitemap.xml
GET /robots.txt       -> proxy BE /api/v1/robots.txt
```

---

## 16. API gaps can bo sung truoc khi client ban hang day du

Nhung API can thiet cho product variants va filter san pham noi bat/ban chay/hang moi da co:

```txt
GET /products/:slug/variants
GET /products?isFeatured=true
GET /products?isBestSeller=true
GET /products?isNewArrival=true
```

### Nen co cho UX tot hon

1. Customer order history:

```txt
GET /customer/orders
GET /customer/orders/:code
```

2. Customer profile update:

```txt
PATCH /customer/profile
```

3. Coupon/shipping quote neu storefront can:

```txt
POST /cart/apply-coupon
POST /checkout/shipping-quote
```

Hien checkout tu tinh shipping default rate trong BE.

---

## 17. FE fetch helper goi y

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const json = await res.json();

  if (!res.ok || json.EC !== 0) {
    throw json;
  }

  return json.DT as T;
}
```

Example:

```ts
const products = await apiFetch<PaginatedData<ProductListItem>>(
  "/products?page=1&limit=12",
);
```
