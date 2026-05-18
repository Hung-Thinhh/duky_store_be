# UAT Acceptance Checklist

## Homepage

- [ ] Header hien logo/menu/search/cart.
- [ ] Hero/banner hien dung.
- [ ] Section san pham hien anh, ten, gia.
- [ ] Category/CTA click sang dung route.
- [ ] Footer hien thong tin shop co ban.
- [ ] Mobile khong vo layout.

## Product listing/category/search

- [ ] `/products` hien danh sach san pham.
- [ ] Co loading state.
- [ ] Co empty state khi khong co san pham.
- [ ] Co error state khi API loi.
- [ ] Pagination hoat dong.
- [ ] Search keyword hoat dong.
- [ ] Filter gia hoat dong.
- [ ] Sort newest/price asc/price desc hoat dong.
- [ ] Category page hien san pham dung danh muc.

## Product detail

- [ ] Hien ten, gia, sale price, SKU, mo ta.
- [ ] Gallery anh hoat dong.
- [ ] Co fallback no image.
- [ ] Variant size/mau chon duoc neu API co variant.
- [ ] Khong cho add cart neu variant bat buoc ma chua chon.
- [ ] Add cart thanh cong.
- [ ] Buy now sang checkout/cart dung flow da chot.

## Cart

- [ ] Cart hien item, anh, ten, variant, gia, quantity, subtotal.
- [ ] Tang/giam quantity hoat dong.
- [ ] Xoa item hoat dong.
- [ ] Clear cart hoat dong.
- [ ] Cart badge cap nhat.
- [ ] Cart rong co empty state.

## Checkout

- [ ] Form co ho ten, phone, email, dia chi, note, payment method.
- [ ] Validate required fields.
- [ ] Review order hien items, subtotal, shipping fee, total.
- [ ] FE khong tu tinh total lam source of truth.
- [ ] Submit COD/bank transfer tao order thanh cong.
- [ ] Het hang/variant invalid hien loi ro.
- [ ] Cart rong khong checkout duoc.

## Order success/tracking

- [ ] Success page hien order code.
- [ ] Success page hien tong tien va thong tin thanh toan.
- [ ] CTA ve trang chu hoat dong.
- [ ] `/orders/:code` hien trang thai don.
- [ ] Sai order code hien not found/error state.

## Responsive and integration

- [ ] Test desktop.
- [ ] Test tablet.
- [ ] Test mobile width iPhone.
- [ ] Flow homepage -> product -> cart -> checkout -> success chay tren preview.
- [ ] Bug co owner, severity, route, steps, screenshot neu co.

