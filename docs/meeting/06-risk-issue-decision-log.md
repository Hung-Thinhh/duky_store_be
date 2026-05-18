# Risk, Issue, Decision Log

Dung file nay trong va sau buoi hop. Moi dong can co owner va deadline ro.

## Decisions

| Date | Decision | Owner | Notes |
|---|---|---|---|
| 2026-05-11 | MVP tap trung guest checkout, account de Post MVP | PM/BA | Can confirm trong hop |
| 2026-05-11 | COD/bank transfer la payment method MVP | PM/BA | Online payment de sau neu khong co yeu cau moi |

## Open questions

| Question | Owner | Due date | Status | Notes |
|---|---|---|---|---|
| Variant size/mau co bat buoc trong MVP khong? | BE/PM | 2026-05-11 | Open | Neu API chua san sang, FE lam simple product truoc |
| Cart guest dung cookie/session/header nao? | BE | 2026-05-11 | Open | Anh huong FE apiClient |
| Shipping fee tinh nhu the nao? | BE/Owner | 2026-05-11 | Open | Fixed/config/backend rule |
| Checkout response chinh xac tra nhung field nao? | BE/FE | 2026-05-11 | Open | Can `orderCode`, total, payment info |
| Homepage content fallback khi thieu data? | FE/Owner | 2026-05-11 | Open | Anh huong ngay 2026-05-11 |

## Risks

| Risk | Impact | Probability | Owner | Mitigation | Status |
|---|---|---|---|---|---|
| API contract thay doi trong luc FE dang lam | High | Medium | BE/FE lead | Chot contract va update `FE-API-CONTRACT.md` ngay khi doi | Open |
| Cart guest khong on dinh | High | Medium | BE | Test som add/update/delete cart truoc checkout | Open |
| Variant data chua san sang | Medium | Medium | BE/PM | Cho phep fallback simple product trong MVP | Open |
| Homepage chua xong dung deadline | High | Medium | FE-HOMEPAGE | Chot minimum homepage: header, hero, products, CTA, footer | Open |
| Checkout phat sinh rule shipping/payment | High | Medium | PM/BE | Chot rule MVP don gian truoc | Open |

## Bug reporting format

```txt
Title:
Severity: Blocker / High / Medium / Low
Route:
Environment:
Steps:
Expected:
Actual:
Screenshot/video:
Owner:
Status:
```

