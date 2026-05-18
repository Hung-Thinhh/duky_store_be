# MVP Scope And User Flows

## Main user flow

```txt
1. Khach vao homepage
2. Khach click category/product/CTA
3. Khach xem danh sach san pham
4. Khach search/filter/sort neu can
5. Khach vao product detail
6. Khach chon variant/quantity neu co
7. Khach them vao gio hoac mua ngay
8. Khach xem gio hang
9. Khach cap nhat quantity hoac xoa item
10. Khach vao checkout
11. Khach dien thong tin nhan hang
12. Backend validate cart, stock, price, shipping, payment method
13. Tao order thanh cong
14. FE redirect sang order success
15. Khach tra cuu lai don bang order code
```

## Routes FE can co

| Route | Muc dich | API chinh |
|---|---|---|
| `/` | Homepage | `GET /homepage`, `GET /products`, `GET /categories`, `GET /settings/public` |
| `/products` | Danh sach san pham | `GET /products` |
| `/products/:slug` | Chi tiet san pham | `GET /products/:slug` |
| `/categories/:slug` | San pham theo danh muc | `GET /categories/:slug/products` |
| `/cart` | Gio hang | `GET /cart`, cart item APIs |
| `/checkout` | Dat hang | `GET /cart`, `POST /checkout` |
| `/order-success` | Dat hang thanh cong | checkout response, optional `GET /orders/:code` |
| `/orders/:code` | Tra cuu don | `GET /orders/:code` |

## Business rules can chot

- FE khong gui total lam source of truth.
- BE validate product, variant, quantity, stock, price va payment method khi checkout.
- Neu cart rong thi khong cho checkout.
- Neu product/variant het hang thi hien message ro.
- Neu order code khong ton tai thi hien not found state.
- Neu API loi thi FE hien error state va co cach retry/di lai.

## Definition of Done cho P0

- Page render duoc tren desktop va mobile.
- Loading, empty, error state co ban.
- API error hien message de hieu.
- Flow mua hang end-to-end chay duoc tren deploy preview.
- Khong co task P0 bi block ma khong co owner.

