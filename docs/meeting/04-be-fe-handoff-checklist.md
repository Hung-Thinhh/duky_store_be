# BE/FE Handoff Checklist

## API response chung

- [ ] Tat ca JSON API tra theo format `EC/EM/DT`.
- [ ] `EC = 0` la success.
- [ ] `EC != 0` la error, `EM` co message cho FE hien thi.
- [ ] List API co `DT.data` va `DT.pagination`.
- [ ] Detail API tra object truc tiep trong `DT`.
- [ ] Field name dung `camelCase` cho JSON response/request.
- [ ] Date/time tra theo ISO string.
- [ ] Money amount tra dang number theo VND, khong format dau cham/phay trong API.
- [ ] ID tra dang string neu database/model dang dung UUID/cuid.
- [ ] Optional field neu khong co data thi uu tien `null`, khong tra string rong tru khi do la content thuc su.

### Response success detail

Vi du `GET /api/v1/products/boot-nam-da-den`:

```json
{
  "EC": 0,
  "EM": "success",
  "DT": {
    "id": "prod_001",
    "slug": "boot-nam-da-den",
    "name": "Boot nam da den",
    "sku": "DUKY-BOOT-001",
    "price": 1200000,
    "salePrice": 990000,
    "stockStatus": "in_stock",
    "shortDescription": "Boot nam da that",
    "description": "Noi dung mo ta san pham",
    "images": [
      {
        "id": "img_001",
        "url": "https://example.com/products/boot-001.jpg",
        "alt": "Boot nam da den",
        "isPrimary": true
      }
    ],
    "category": {
      "id": "cat_001",
      "name": "Boot nam",
      "slug": "boot-nam"
    },
    "variants": [
      {
        "id": "var_001",
        "sku": "DUKY-BOOT-001-40",
        "name": "Size 40",
        "price": 1200000,
        "salePrice": 990000,
        "stock": 5,
        "attributes": {
          "size": "40",
          "color": "Den"
        }
      }
    ]
  }
}
```

### Response success list

Vi du `GET /api/v1/products?page=1&limit=12`:

```json
{
  "EC": 0,
  "EM": "success",
  "DT": {
    "data": [
      {
        "id": "prod_001",
        "slug": "boot-nam-da-den",
        "name": "Boot nam da den",
        "price": 1200000,
        "salePrice": 990000,
        "image": {
          "url": "https://example.com/products/boot-001.jpg",
          "alt": "Boot nam da den"
        },
        "stockStatus": "in_stock"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 12,
      "total": 120,
      "totalPages": 10,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

### Response error

Vi du product not found:

```json
{
  "EC": 404,
  "EM": "Product not found",
  "DT": {
    "code": "PRODUCT_NOT_FOUND",
    "path": "/api/v1/products/abc",
    "timestamp": "2026-05-10T10:30:00.000Z"
  }
}
```

Vi du validation error:

```json
{
  "EC": 400,
  "EM": "Validation failed",
  "DT": {
    "code": "VALIDATION_ERROR",
    "fields": [
      {
        "field": "phone",
        "message": "Phone is required"
      },
      {
        "field": "address",
        "message": "Address is required"
      }
    ],
    "path": "/api/v1/checkout",
    "timestamp": "2026-05-10T10:30:00.000Z"
  }
}
```

### Schema rules can chot

| Rule | Quy tac |
|---|---|
| Naming | JSON request/response dung `camelCase`; DB co the dung naming rieng nhung API khong expose lung tung |
| Response wrapper | Moi JSON API dung `EC`, `EM`, `DT`; khong tra object raw ngoai wrapper |
| List data | List API luon tra `DT.data` la array va `DT.pagination` neu co paging |
| Empty list | Empty list tra `data: []`, khong tra `null` |
| Detail missing | Khong tim thay resource tra `EC: 404`, khong tra `DT: null` voi `EC: 0` |
| Money | Tra number VND, FE format hien thi |
| Date | Tra ISO string, FE format theo UI |
| Enum | Dung lowercase snake case cho enum API, vi du `in_stock`, `out_of_stock`, `cod`, `bank_transfer` |
| Boolean | Dung boolean that `true/false`, khong dung `0/1` |
| Image/media | Media object nen co `url`, `alt`, optional `width`, `height`, `isPrimary` |
| Pagination | `page`, `limit`, `total`, `totalPages`, optional `hasNextPage`, `hasPrevPage` |
| Error code | `DT.code` dung stable machine code, FE co the map message neu can |
| Validation error | `DT.fields[]` gom `field` va `message` |
| Backward compatibility | Sau khi FE da integrate, BE khong doi/xoa field P0 neu chua bao truoc |

## Environment

- [ ] BE cung cap local base URL.
- [ ] BE cung cap preview/staging base URL.
- [ ] FE co bien moi truong cho API base URL.
- [ ] CORS cho local va preview FE da duoc bat.

## Product APIs

- [ ] `GET /api/v1/products` ho tro `page`, `limit`.
- [ ] `GET /api/v1/products` ho tro `search`.
- [ ] `GET /api/v1/products` ho tro `minPrice`, `maxPrice`, `sort`.
- [ ] Product list item co `id`, `slug`, `name`, `price`, `salePrice`, `image`, `status`.
- [ ] `GET /api/v1/products/:slug` co day du detail, images, category/tags neu co.
- [ ] Detail API co variant data neu MVP yeu cau chon size/mau.

## Category APIs

- [ ] `GET /api/v1/categories` tra danh muc active cho menu/header.
- [ ] `GET /api/v1/categories/:slug/products` tra products + pagination.
- [ ] Category slug va product slug thong nhat voi route FE.

## Homepage/settings APIs

- [ ] `GET /api/v1/homepage` co data cho hero/banner/sections neu dung.
- [ ] `GET /api/v1/settings/public` co logo, shop name, hotline, address, social, payment/bank info neu can.
- [ ] Co fallback neu homepage/settings thieu data.

## Cart APIs

- [ ] `GET /api/v1/cart` tra cart items va totals.
- [ ] `POST /api/v1/cart/items` add simple product.
- [ ] `POST /api/v1/cart/items` add variant product neu co variant.
- [ ] `PATCH /api/v1/cart/items/:id` update quantity.
- [ ] `DELETE /api/v1/cart/items/:id` xoa item.
- [ ] `DELETE /api/v1/cart` clear cart.
- [ ] Da chot cart guest dung cookie/session/header nao.

## Checkout/order APIs

- [ ] `POST /api/v1/checkout` validate cart va tao order.
- [ ] Checkout request fields da chot: name, phone, email, address, note, paymentMethod.
- [ ] Checkout response tra `orderCode`.
- [ ] Checkout response tra total va payment info can hien thi tren success page.
- [ ] `GET /api/v1/orders/:code` tra order status va order detail cho khach.
- [ ] Error het hang/variant invalid/cart rong co message ro.

## Contract sign-off

| Area | BE owner | FE owner | Status | Notes |
|---|---|---|---|---|
| Response format |  |  | Open |  |
| Products |  |  | Open |  |
| Categories |  |  | Open |  |
| Homepage/settings |  |  | Open |  |
| Cart |  |  | Open |  |
| Checkout/order |  |  | Open |  |
