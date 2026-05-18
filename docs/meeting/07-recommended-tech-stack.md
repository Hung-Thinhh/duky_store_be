# Recommended Tech Stack

File nay dung de thong nhat cong nghe nen dung cho BE va FE trong MVP. Muc tieu la lam nhanh, de maintain, de handoff, va phu hop voi source backend hien tai.

## Backend

| Area | Goi y | Ly do |
|---|---|---|
| Runtime | Node.js LTS | Phu hop NestJS, de deploy |
| Framework | NestJS | Repo hien tai da dung NestJS, co module/controller/service ro rang |
| Language | TypeScript | Dong bo BE/FE, type-safe |
| Database | PostgreSQL | Phu hop ecommerce, transaction, relation, index |
| ORM | Prisma | Repo hien tai da dung Prisma, migration ro |
| Cache/queue | Redis + BullMQ | Phu hop job sau nay: email, notification, import, sitemap |
| Auth | JWT + role guard | Da co huong NestJS guard/decorator |
| Validation | class-validator + class-transformer | Validate DTO o API boundary |
| API docs | Swagger/OpenAPI | FE doc API truc tiep tai `/api/v1/docs` |
| Test | Jest + Supertest | Unit/e2e cho flow API quan trong |
| Container | Docker Compose | Local PostgreSQL/Redis on dinh |

## Frontend

| Area | Goi y | Ly do |
|---|---|---|
| Framework | Next.js App Router | SEO product/detail tot, routing tot, de deploy |
| Language | TypeScript | Dong bo contract voi BE |
| Styling | Tailwind CSS | Lam nhanh UI ecommerce, responsive nhanh |
| Component base | shadcn/ui hoac custom components nhe | Form, dialog, toast, button co san pattern |
| Data fetching | TanStack Query hoac fetch wrapper rieng | Quan ly loading/error/cache cho product/cart |
| Form | React Hook Form + Zod | Checkout validate ro, code gon |
| State nhe | Zustand hoac Context | Cart badge/session state neu can |
| Icons | lucide-react | Dong nhat icon, nhe |
| Image | Next Image | Lazy load, size optimize |
| Test | Playwright cho E2E | Test flow mua hang that tren browser |
| Deploy | Vercel/Netlify/Render static-compatible | De co preview link cho UAT |

## Integration tools

| Area | Goi y |
|---|---|
| API contract | `FE-API-CONTRACT.md` + Swagger |
| Bug tracking | Sheet/Linear/Jira tuy team, nhung moi bug phai co steps va owner |
| Env | `.env.example` cho BE va FE |
| Code quality | ESLint + Prettier |
| Git flow | Feature branch theo task/module |
| Review | PR review toi thieu voi task P0 checkout/cart/order |

## Thu tu uu tien cong nghe

1. Dung stack hien co cua backend truoc: NestJS, Prisma, PostgreSQL, Redis.
2. FE nen chon stack it rui ro, uu tien Next.js + TypeScript.
3. Khong them cong nghe moi neu no khong giai quyet truc tiep van de MVP.
4. Khong dua online payment, account, recommendation vao stack MVP neu scope chua chot.

## Goi y cau truc FE

```txt
src
  app
    page.tsx
    products
    categories
    cart
    checkout
    orders
  components
    layout
    product
    cart
    checkout
    ui
  lib
    api
    format
    validation
  types
    api.ts
    product.ts
    cart.ts
    order.ts
```

## Goi y cau truc BE

```txt
src
  common
    decorators
    filters
    guards
    interceptors
    utils
  database
  modules
    products
    categories
    cart
    checkout
    orders
    homepage
    settings
```

## Khong nen lam trong MVP neu khong bat buoc

- Microservices.
- GraphQL.
- Complex state machine cho checkout.
- Custom CMS rieng cho homepage.
- Payment gateway khi COD/bank transfer da du cho MVP.
- Recommendation engine.
- Full customer account system.

