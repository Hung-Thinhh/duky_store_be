# Shared Code Rules For BE And FE

File nay la quy tac code chung de BE va FE lam cung mot style, de review, debug va handoff nhanh hon.

## Nguyen tac chung

- Code uu tien ro rang hon thong minh.
- Moi module nen co owner ro.
- Khong sua lan sang module khac neu task khong yeu cau.
- Khong hard-code API URL, secret, token, bank info trong code.
- Moi thay doi API P0 phai update `FE-API-CONTRACT.md`.
- Moi thay doi scope/task phai update `DUKY_CLIENT_MVP_TASK_SHEET.csv`.
- Ten bien, function, file phai mo ta dung nghiep vu.
- Comment chi dung khi logic kho hieu hoac co business rule dac biet.

## Naming rules

| Loai | Quy tac | Vi du |
|---|---|---|
| Variable/function | `camelCase` | `getProductBySlug` |
| Type/interface/class | `PascalCase` | `ProductListItem` |
| Constant | `UPPER_SNAKE_CASE` | `DEFAULT_PAGE_SIZE` |
| API JSON field | `camelCase` | `salePrice`, `stockStatus` |
| Enum API value | `snake_case` lowercase | `bank_transfer`, `in_stock` |
| Route path | kebab/lowercase | `/order-success`, `/products/:slug` |
| File FE component | `PascalCase.tsx` | `ProductCard.tsx` |
| File utility | `kebab-case.ts` hoac local convention | `format-money.ts` |

## Backend rules

- Module theo pattern NestJS: controller -> service -> repository/prisma.
- Controller chi xu ly HTTP boundary, khong viet business logic dai.
- Service chua business logic va transaction.
- DTO dung class-validator cho request body/query/params quan trong.
- Khong expose Prisma model raw neu field khong phu hop FE.
- Checkout, price, stock, shipping, total phai validate/tinh o BE.
- Dung transaction cho checkout tao order + order items + cart update/clear.
- Error nen nem exception co message ro; global filter/interceptor wrap ve `EC/EM/DT`.
- Public API va Admin API tach route ro: `/api/v1/...` va `/api/v1/admin/...`.
- Query list can co pagination, limit mac dinh, limit toi da.
- Field search/filter/sort phai whitelist, khong cho sort field tuy y neu nguy hiem.

## Frontend rules

- Tat ca API call di qua mot `apiClient` chung.
- `apiClient` unwrap `DT`, handle `EC != 0`, va throw error co message.
- UI page nao goi API thi phai co loading, empty, error state.
- Money format o FE bang helper chung, API chi tra number.
- Date format o FE bang helper chung, API chi tra ISO string.
- Form checkout validate client co ban, nhung van tin BE la source of truth.
- Component product/cart/checkout nen tach nho, khong de mot file page qua dai.
- Route path va param phai thong nhat voi API contract.
- Cart badge phai refresh sau add/update/delete/clear cart.
- Khong block user bang alert browser; uu tien toast/message component.

## Git and review rules

- Branch theo format de doc: `feature/cart-page`, `fix/checkout-validation`.
- Commit message nen ro module va hanh dong: `feat(cart): update item quantity`.
- PR/task P0 phai noi ro da test route nao.
- Khong commit `.env`, build output, log, local cache.
- Neu sua API response, PR phai ghi FE bi anh huong gi.

## Error handling rules

- BE tra error co `EC`, `EM`, `DT.code`.
- FE hien `EM` neu message an toan cho user.
- Validation error co `DT.fields[]` de FE map vao form.
- Error khong tim thay resource dung 404.
- Error cart rong/het hang/variant invalid phai co code rieng de FE hien dung message.

## Testing rules

| Area | Minimum test |
|---|---|
| BE product/list/detail | List co pagination, detail not found |
| BE cart | Add, update quantity, delete, clear |
| BE checkout | Cart rong, het hang, success order |
| FE product flow | List -> detail -> add cart |
| FE checkout flow | Cart -> checkout -> success |
| Responsive | Mobile, tablet, desktop cho P0 pages |

## Definition of done chung

- Code build/lint pass.
- API contract/task sheet update neu co thay doi.
- UI co loading/empty/error state neu lien quan API.
- Da test happy path va it nhat mot error path.
- Khong co console log/debug code de lai.
- Khong co secret/local config bi commit.

