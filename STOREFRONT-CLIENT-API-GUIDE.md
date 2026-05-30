# Storefront Client API Setup Guide

Tai lieu nay mo ta dashboard dang cau hinh API nhu nao va storefront client nen lam tuong tu de ket noi Backend Duky Store cho chuan.

File nay khong phai API contract chi tiet. Contract endpoint va schema day du nam o:

```txt
STOREFRONT-FE-API-CONTRACT.md
```

---

## 1. Dashboard hien dang cau hinh API nhu nao

Dashboard dang dung pattern:

```txt
lib/api/axios-client.ts
lib/api/schemas/*.schema.ts
lib/api/services/*.service.ts
lib/auth/browser-session.ts
lib/auth/session-cookies.ts
```

Luong xu ly:

1. Lay base URL tu env:

```ts
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
```

2. Tao axios client dung chung:

```ts
axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});
```

3. Request interceptor tu gan Bearer token cho route admin:

```ts
if (config.url?.startsWith('/admin')) {
  config.headers.Authorization = `Bearer ${accessToken}`;
}
```

4. Response interceptor unwrap response backend:

```ts
// BE tra: { EC, EM, DT }
return response.data;
```

Neu `EC !== 0` thi reject loi.

5. Khi gap HTTP 401, dashboard goi refresh token:

```txt
POST /admin/auth/refresh
```

Neu refresh thanh cong thi luu token moi va retry request cu. Neu fail thi xoa session va redirect ve `/login`.

6. Service layer khong return raw axios response. Moi service parse schema roi moi tra data cho UI:

```ts
const response = await apiClient.get('/admin/products', { params });
return ProductListResponseSchema.parse(response).DT;
```

Ket luan: UI dashboard khong goi API lung tung. UI chi goi service, service parse schema, axios-client lo auth/error/refresh.

---

## 2. Storefront client nen lam tuong tu, nhung khac dashboard o dau

Storefront khong dung `/admin/*`.

Storefront gom 3 nhom request:

```txt
Public API:
GET /products
GET /products/:slug
GET /products/:slug/variants
GET /categories
GET /homepage
GET /blog
GET /settings/public

Guest cart / checkout:
GET /cart?sessionId=...
POST /cart/items
PATCH /cart/items/:id
DELETE /cart/items/:id
POST /checkout
GET /orders/:code?phone=...

Customer auth:
POST /customer/auth/google
POST /customer/auth/refresh
POST /customer/auth/logout
GET /customer/auth/me
```

Quy tac token:

```txt
Chi tu gan Bearer token cho /customer/*
Khong gan token cho /products, /categories, /cart, /checkout
Cart dung sessionId rieng
```

Refresh token cua storefront dung:

```txt
POST /customer/auth/refresh
```

Khong goi:

```txt
POST /admin/auth/refresh
```

---

## 3. Env can co ben storefront client

Tao `.env.local` o client:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

Khi deploy:

```env
NEXT_PUBLIC_API_URL=https://api.your-domain.com/api/v1
```

Luu y:

```txt
Khong dua DATABASE_URL vao client.
Khong dua REDIS_URL vao client.
Khong dua JWT secret vao client.
Khong dua Postgres/Redis password vao client.
```

Client chi can URL public cua backend.

---

## 4. Dependencies nen dung

Storefront nen dung cung style voi dashboard:

```txt
Bat buoc nen co:
zod       -> validate response runtime
axios     -> browser API client, interceptor, refresh token

Dung san cua Next.js:
fetch     -> Server Components, public SEO data

Chi can khi co customer login:
js-cookie -> luu accessToken/refreshToken/customer trong browser
```

Cai dat toi thieu khi bat dau connect BE:

```bash
npm i zod axios
```

Neu lam dang nhap customer:

```bash
npm i js-cookie
npm i -D @types/js-cookie
```

Khong can them Redux/React Query ngay tu dau neu client dang co Zustand va nhu cau chua phuc tap. Co the them React Query sau neu can cache, retry, optimistic update, infinite list.

Vai tro chuan:

```txt
zod:
  Chi parse o service layer.
  Khong parse truc tiep trong page/component.

axios:
  Dung cho Client Components can interceptor.
  Vi du: add cart, update cart, checkout, login/logout.

fetch/apiFetch:
  Dung cho Server Components/public pages.
  Vi du: home, product list, product detail, category, blog.

js-cookie:
  Chi dung khi co customer accessToken/refreshToken.
```

Neu khong dung `zod` thi van connect BE duoc, nhung khong cung chuan dashboard va de bi loi ngam khi API tra sai shape.

---

## 5. Folder structure nen tao ben client

Neu client la Next.js App Router, nen tach nhu sau:

```txt
src/lib/api/
  api-fetch.ts
  axios-client.ts
  schemas/
    base.schema.ts
    product.schema.ts
    category.schema.ts
    cart.schema.ts
    checkout.schema.ts
    customer-auth.schema.ts
    settings.schema.ts
    blog.schema.ts
  services/
    product.service.ts
    category.service.ts
    cart.service.ts
    checkout.service.ts
    customer-auth.service.ts
    homepage.service.ts
    settings.service.ts
    blog.service.ts

src/lib/auth/
  customer-session.ts
  session-cookies.ts

src/lib/cart/
  guest-session.ts
```

Ly do co ca `api-fetch.ts` va `axios-client.ts`:

```txt
api-fetch.ts:
  Dung cho Server Components / SEO pages / public data.
  Vi du: home, product list, product detail, category, blog.

axios-client.ts:
  Dung cho Client Components can interceptor browser.
  Vi du: login Google, logout, add to cart, update cart, checkout form.
```

Neu muon don gian giai doan dau, co the chi dung axios-client, nhung voi Next.js storefront can SEO tot thi nen co `api-fetch.ts` cho server-side render.

---

## 6. Zod base response schema

Backend tra JSON chung:

```ts
type ApiResponse<T> = {
  EC: number;
  EM: string;
  DT: T;
};
```

Trong client nen co schema base bang `zod`:

```ts
import { z } from 'zod';

export const BaseResponseSchema = z.object({
  EC: z.number(),
  EM: z.string(),
});

export const PaginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

export function createResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return BaseResponseSchema.extend({
    DT: dataSchema,
  });
}

export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(
  itemSchema: T,
) {
  return BaseResponseSchema.extend({
    DT: z.object({
      data: z.array(itemSchema),
      pagination: PaginationSchema,
    }),
  });
}
```

Moi service nen parse response full wrapper `{ EC, EM, DT }`:

```ts
const response = await apiClient.get('/products', { params });
return ProductListResponseSchema.parse(response).DT;
```

Khong nen parse trong UI component:

```txt
Khong nen:
page.tsx -> fetch -> parse zod -> render

Nen:
page.tsx -> productService.list()
product.service.ts -> fetch/axios -> zod parse -> return DT
```

---

## 7. api-fetch cho Server Components

Dung cho cac page public can SSR/SEO:

```ts
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const json = await response.json();

  if (!response.ok || json.EC !== 0) {
    throw json;
  }

  return json as T;
}
```

Vi du service dung `apiFetch`:

```ts
export async function listProducts(params: ListProductsParams) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });

  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await apiFetch<unknown>(`/products${suffix}`);

  return ProductListResponseSchema.parse(response).DT;
}
```

Khong nen de `apiFetch` return thang `DT`, vi nhu vay service khong parse duoc full schema response giong dashboard.

Neu muon helper gon hon, co the truyen schema vao helper:

```ts
import { z } from 'zod';

export async function apiFetchWithSchema<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestInit = {},
) {
  const response = await apiFetch<unknown>(path, options);
  return schema.parse(response);
}
```

Sau do service van la noi goi schema:

```ts
const response = await apiFetchWithSchema(
  '/products?page=1&limit=24&sort=newest',
  ProductListResponseSchema,
);

return response.DT;
```

---

## 8. axios-client cho browser interaction

Dung cho request can browser session, refresh token, retry 401:

```ts
import axios from 'axios';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

apiClient.interceptors.request.use((config) => {
  if (config.url?.startsWith('/customer')) {
    const token = getCustomerAccessToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    if (response.data?.EC !== undefined && response.data.EC !== 0) {
      return Promise.reject(response.data);
    }

    // Tra ve full wrapper de service parse schema giong dashboard.
    return response.data;
  },
  async (error) => {
    // Neu 401 va khong phai auth request thi goi /customer/auth/refresh
    // Thanh cong: luu session moi, retry request cu
    // That bai: clear session, redirect ve trang login/user
    return Promise.reject(error);
  },
);
```

Trong code that, phan refresh nen copy y tu dashboard nhung doi:

```txt
/admin/auth/refresh -> /customer/auth/refresh
/login              -> route login/account cua storefront
```

---

## 9. Guest cart sessionId

Cart storefront khong can login. Client tu tao `sessionId`.

Nen co file:

```txt
src/lib/cart/guest-session.ts
```

Logic:

```ts
const KEY = 'duky_guest_session_id';

export function getGuestSessionId() {
  const existing = localStorage.getItem(KEY);

  if (existing) return existing;

  const next =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  localStorage.setItem(KEY, next);

  return next;
}
```

Moi API cart gui kem sessionId:

```ts
await cartService.getCart(getGuestSessionId());
await cartService.addItem({
  sessionId: getGuestSessionId(),
  productId,
  variantId,
  quantity: 1,
});
```

---

## 10. Service naming chuan

Product:

```ts
productService.list(params);
productService.getBySlug(slug);
productService.getVariants(slug);
```

Category:

```ts
categoryService.list();
categoryService.getBySlug(slug);
categoryService.getProducts(slug, params);
```

Cart:

```ts
cartService.getCart(sessionId);
cartService.addItem(payload);
cartService.updateItem(itemId, payload);
cartService.removeItem(itemId, sessionId);
cartService.clearCart(sessionId);
```

Checkout/order:

```ts
checkoutService.checkout(payload);
checkoutService.lookupOrder(code, phone);
```

Customer auth:

```ts
customerAuthService.loginWithGoogle(payload);
customerAuthService.refresh(refreshToken);
customerAuthService.logout();
customerAuthService.getMe();
customerAuthService.getCustomer();
```

Homepage/settings/blog:

```ts
homepageService.getHomepage();
settingsService.getPublic(params);
blogService.list(params);
blogService.getBySlug(slug);
blogService.listCategories();
```

---

## 11. Page to service map

Layout/header/footer:

```txt
categoryService.list()
settingsService.getPublic()
cartService.getCart(sessionId) // only in client/cart store
```

Home `/`:

```txt
homepageService.getHomepage()
productService.list({ isFeatured: true, limit: 8 })
productService.list({ isBestSeller: true, limit: 8 })
productService.list({ isNewArrival: true, limit: 8 })
```

Product listing `/san-pham`:

```txt
productService.list({
  page,
  limit: 24,
  search,
  categorySlug,
  minPrice,
  maxPrice,
  sort,
})
categoryService.list()
```

Product detail `/san-pham/:slug`:

```txt
productService.getBySlug(slug)
productService.getVariants(slug)
cartService.addItem({ sessionId, productId, variantId, quantity })
```

Cart drawer/page:

```txt
cartService.getCart(sessionId)
cartService.updateItem(itemId, { sessionId, quantity })
cartService.removeItem(itemId, sessionId)
cartService.clearCart(sessionId)
```

Checkout `/thanh-toan`:

```txt
cartService.getCart(sessionId)
checkoutService.checkout(payload)
```

Order lookup:

```txt
checkoutService.lookupOrder(code, phone)
```

Customer account:

```txt
customerAuthService.loginWithGoogle()
customerAuthService.getMe()
customerAuthService.logout()
```

Blog:

```txt
blogService.list(params)
blogService.getBySlug(slug)
blogService.listCategories()
```

---

## 12. Migration order cho client hien tai

Vi client da co san UI va dang chua connect BE, nen nen lam theo thu tu:

1. Tao env `NEXT_PUBLIC_API_URL`.
2. Cai `zod` va `axios`.
3. Tao `api-fetch.ts`, `axios-client.ts`, base zod schema.
4. Tao product/category schema va service.
5. Connect product list/detail truoc.
6. Connect category filter.
7. Connect product variants o trang detail.
8. Connect cart bang `sessionId`.
9. Connect checkout va order lookup.
10. Connect homepage/settings/blog.
11. Cuoi cung moi connect customer auth neu can account, luc do them `js-cookie`.

Thu tu nay giup moi lan doi co the test rieng, tranh doi ca storefront mot luc.

---

## 13. Nguyen tac quan trong

```txt
UI khong goi fetch/axios truc tiep lung tung.
UI chi goi service.
Service parse zod schema roi moi return data.
apiFetch tra full wrapper de service parse.
axios-client lo token, refresh token, error unwrap.
Server Components dung api-fetch cho public data.
Browser interactions dung axios-client.
Khong goi /admin/* tu storefront.
Khong dua secret backend vao NEXT_PUBLIC_*.
Khong can js-cookie neu chua lam customer login.
```
