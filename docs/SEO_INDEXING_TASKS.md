# Duky Store SEO Indexing Tasks

Ngày tạo: 2026-06-04

Mục tiêu: giảm nhóm URL chưa được index trong Google Search Console bằng cách tách đúng nguyên nhân: URL cũ/redirect/404, sitemap/canonical, nội dung mỏng, và trang không nên index.

## Trạng thái nhanh

- Live `https://dukystore.com/robots.txt`: đã trả `200`, có sitemap, chặn auth/cart/checkout.
- Live `https://dukystore.com/sitemap.xml`: đã trả `200`, hiện có 421 URL tuyệt đối.
- Backend DB có dữ liệu SEO nhưng còn nhiều tín hiệu yếu: redirect cũ, canonical tương đối, product meta description thiếu.
- Không nên thêm `index` hàng loạt. Page không có `noindex` thì mặc định vẫn có thể index; việc cần làm là dọn URL lỗi và tăng chất lượng nội dung.

## Có cần kết nối Google Search Console không?

Không bắt buộc để làm các lỗi backend/local đã thấy.

Cần Google Search Console khi muốn:

- Export đúng 700 URL đang bị báo.
- Biết từng URL thuộc reason nào: `Page with redirect`, `Not found (404)`, `Crawled - currently not indexed`, `Duplicate`, `Discovered - currently not indexed`.
- Bấm `Validate fix` hoặc request recrawl sau khi sửa.

Nếu chưa kết nối được GSC, vẫn làm được các task kỹ thuật bên dưới dựa trên DB và live URL.

## Task 1 - Lập baseline URL/indexing từ backend và live

Status: Done

Kết quả kiểm tra ngày 2026-06-04:

| Hạng mục                                    | Số lượng | Ý nghĩa                                                                          |
| ------------------------------------------- | -------: | -------------------------------------------------------------------------------- |
| Published products                          |      280 | Số sản phẩm public hiện tại                                                      |
| Published blog posts                        |      131 | Số bài blog public hiện tại                                                      |
| Backend active sitemap entries              |      281 | Sitemap DB backend hiện có                                                       |
| Backend relative sitemap entries            |      281 | Tất cả entry backend đang là URL tương đối                                       |
| Relative canonicals in DB                   |      392 | Canonical DB đang là `/path`, FE có thể convert nhưng backend chưa chuẩn độc lập |
| Active redirects                            |      600 | Redirect migration đang khá lớn                                                  |
| Product redirects                           |      467 | Redirect trỏ về `/san-pham/...`                                                  |
| Product redirects to missing targets        |      187 | Redirect đang trỏ tới sản phẩm không tồn tại/published                           |
| Blog redirects                              |      133 | Redirect trỏ về `/blog/...`                                                      |
| Blog redirects to missing targets           |       25 | Redirect đang trỏ tới bài blog không tồn tại/published                           |
| Published products missing meta description |      280 | Tất cả sản phẩm published thiếu meta description trong DB                        |
| Media missing alt text                      |      479 | Ảnh/media thiếu alt text                                                         |

Redirect nguy hiểm đã thấy:

| Source                                                         | Target                                                                       | Vấn đề                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/`                                                            | `/blog/3-bi-quyet-mix-match-cung-ao-khoac-da-nang-tam-phong-cach-thoi-trang` | Không được áp dụng redirect này, có thể làm hỏng homepage nếu FE dùng redirect table tự động |
| `/san-pham/giay-combat-boots-nu-de-cao-8cm-dkg066-duky-store/` | `/san-pham/giay-combat-boots-nu-de-cao-8cm-dkg066-duky-store`                | Target live đang 404                                                                         |

Mẫu redirect sản phẩm đang trỏ tới target thiếu:

- `/san-pham/ao-da-biker-jacket/` -> `/san-pham/ao-da-biker-jacket`
- `/san-pham/ao-da-mangto-dang-dai-tang-kem-day-ao/` -> `/san-pham/ao-da-mangto-dang-dai-tang-kem-day-ao`
- `/san-pham/ao-da-nu-bomber-mau-tuong-phan-trang-den-ca-tinh/` -> `/san-pham/ao-da-nu-bomber-mau-tuong-phan-trang-den-ca-tinh`
- `/san-pham/ao-khoac-da-biker/` -> `/san-pham/ao-khoac-da-biker`
- `/san-pham/ao-khoac-da-bong-co-dung-nut/` -> `/san-pham/ao-khoac-da-bong-co-dung-nut`

Kết luận Task 1:

- 700 URL trong GSC nhiều khả năng có một nhóm lớn là URL cũ/redirect/404, không phải thiếu tag `index`.
- Việc cần làm kế tiếp là dọn redirect target chết trước, rồi mới xử lý nội dung mỏng.

## Task 2 - Dọn redirect migration

Status: Pending

Việc cần làm:

- Xoá hoặc disable redirect `sourcePath="/"`.
- Xuất danh sách 187 product redirect trỏ tới target không tồn tại.
- Với từng URL cũ, chọn hướng xử lý:
  - Redirect sang sản phẩm mới tương đương nếu còn hàng/còn page.
  - Redirect sang category phù hợp nếu không còn sản phẩm.
  - Cho 404/410 nếu page thật sự không còn giá trị SEO.
- Xuất danh sách 25 blog redirect trỏ tới bài không tồn tại và xử lý tương tự.
- Test live các URL mẫu sau khi sửa: status phải là `301/308 -> 200`, không phải `301/308 -> 404`.

## Task 3 - Chuẩn hóa sitemap/canonical backend

Status: Pending

Việc cần làm:

- Thêm env public site URL cho backend, ví dụ `PUBLIC_SITE_URL=https://dukystore.com`.
- Backend `sitemap.xml` phải render absolute URL.
- Backend `robots.txt` phải trỏ sitemap absolute URL.
- Sitemap chỉ chứa canonical/indexable URL.
- Không đưa vào sitemap các entity có `seo.noIndex = true`.
- Lọc category active khi generate category sitemap.

## Task 4 - Tối ưu metadata sản phẩm

Status: Pending

Việc cần làm:

- Bổ sung `metaDescription` cho 280 sản phẩm published.
- Ưu tiên sản phẩm trong sitemap, sản phẩm bán chạy, sản phẩm có impression/click trong GSC.
- Mô tả nên có chất liệu, form, đối tượng, dịp sử dụng, bảo hành/giao hàng nếu phù hợp.
- Tránh fallback mỏng kiểu `{tên sản phẩm} tai Duky Store`.

## Task 5 - Làm sạch Product JSON-LD và media alt

Status: Pending

Việc cần làm:

- Không merge placeholder `{ "source": "sapo_xlsx" }` vào JSON-LD public.
- Product schema cần giữ các trường thật: name, image, description, sku, brand, offer price, availability.
- Bổ sung alt text cho media quan trọng, ưu tiên product thumbnail và ảnh primary.

## Task 6 - Đối chiếu Google Search Console

Status: Pending

Việc cần làm khi có GSC export:

- Export Page Indexing report theo từng reason.
- Match URL export với các nhóm:
  - URL đang có trong sitemap.
  - URL redirect.
  - URL 404/410.
  - URL noindex.
  - URL duplicate/canonical.
  - URL crawled nhưng nội dung mỏng.
- Sau khi sửa từng nhóm, dùng GSC `Validate fix` thay vì request index thủ công từng URL.

## Task 6.1 - Kết nối Google Search Console API

Status: Scaffold done

Đã thêm script:

- `scripts/gsc-url-inspection.ts`
- npm script: `npm run gsc:inspect`
- Dependency: `googleapis`

Cách kết nối chuẩn:

1. Tạo Google Cloud project hoặc dùng project hiện có.
2. Enable `Google Search Console API`.
3. Tạo service account và tải key JSON.
4. Thêm email của service account vào Search Console property `dukystore.com` với quyền đủ đọc dữ liệu.
5. Khuyến nghị không dùng file key trong repo. Convert JSON key thành base64 rồi set vào `GSC_SERVICE_ACCOUNT_JSON_BASE64` trong env/secret manager.
6. Export Page Indexing report trong GSC theo từng reason, lưu CSV vào `docs/seo/gsc-exports/page-indexing.csv`.
7. Chạy:

```bash
npm run gsc:inspect -- --input docs/seo/gsc-exports/page-indexing.csv
```

Tạo giá trị `GSC_SERVICE_ACCOUNT_JSON_BASE64` trên Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\dukystore-search-console.json"))
```

Backend đang hỗ trợ 4 cách credential, theo thứ tự ưu tiên:

1. `GSC_SERVICE_ACCOUNT_JSON_BASE64`
2. `GSC_SERVICE_ACCOUNT_JSON`
3. `GSC_CLIENT_EMAIL` + `GSC_PRIVATE_KEY`
4. `GSC_SERVICE_ACCOUNT_KEY_FILE` hoặc `GOOGLE_APPLICATION_CREDENTIALS` làm fallback local

Ghi chú quan trọng:

- URL Inspection API kiểm tra từng URL, không thay thế hoàn toàn Page Indexing report export.
- Google giới hạn URL Inspection theo property, nên script đang chạy tuần tự và có delay mặc định `1200ms`.
- Nếu property trong GSC là domain property thì dùng `GSC_SITE_URL=sc-domain:dukystore.com`.
- Nếu property là URL-prefix thì dùng `GSC_SITE_URL=https://dukystore.com/` và phải có dấu `/` cuối.
- Các file `.gsc/`, `docs/seo/gsc-exports/`, `docs/seo/gsc-results/` đã được ignore để tránh commit credential và dữ liệu GSC.
- Không commit service account JSON. Nếu lỡ push key lên git thì revoke key cũ trong Google Cloud và tạo key mới.

## Task 7 - Dashboard Google Search Console

Status: Phase 3 done

Đã thêm backend:

- `GET /api/v1/admin/gsc/overview`: trả baseline SEO/indexing từ DB, trạng thái cấu hình GSC, nhóm lỗi redirect/meta/canonical/noIndex/sitemap.
- `GET /api/v1/admin/gsc/candidates`: tự gom URL cần rà từ route tĩnh, entity public, sitemap backend, live sitemap, redirect source/target, URL mapping cũ/mới và legacy `/products/[slug]`.
- `POST /api/v1/admin/gsc/analyze`: nhận danh sách URL export từ Search Console và phân loại theo dữ liệu backend.
- `POST /api/v1/admin/gsc/inspect`: inspect tối đa 100 URL qua Google Search Console URL Inspection API khi đã cấu hình service account.

Đã thêm dashboard:

- Route `/search-console`.
- Menu `SEO -> Google Search Console`.
- KPI sản phẩm/blog/sitemap/redirect.
- Bảng lý do trang không được lập chỉ mục.
- Import CSV/TXT Page Indexing export.
- Quét tự động từ hệ thống để không bắt buộc phải có CSV GSC cho các URL mình kiểm soát được.
- Phân tích URL thành nhóm cần xử lý.
- Inspect Google cho 25 URL đầu trong danh sách đang phân tích.
- Xuất JSON/CSV phân tích và kết quả inspect.
- Lọc danh sách URL theo từng nhóm lỗi/reason.
- Mở nhanh màn sửa product/blog/category từ từng URL đã match entity.
- Mở nhanh màn Redirect 301 theo source path.
- Tắt redirect trực tiếp trên dòng URL sau khi xác nhận.
- Inspect Google lại cho từng URL riêng lẻ.
- Nhận diện URL sản phẩm cũ dạng `/products/[slug]` và map về entity canonical `/san-pham/[slug]`.
- Nhận diện URL cũ trong `url_mappings`; nếu có mapping nhưng chưa có redirect active thì báo rõ cần tạo 301 từ `oldUrl` sang `newUrl`.
- Hiển thị breakdown nguồn auto scan: public entity, backend sitemap, live sitemap, redirect, URL mapping, legacy product path.

Phần còn lại:

- Lưu snapshot lịch sử theo ngày nếu muốn xem xu hướng như biểu đồ GSC.
- Thêm action sửa noIndex/meta/canonical inline thay vì chỉ mở màn entity.
- Nối Search Analytics API để xem click/impression/CTR/position theo URL.
