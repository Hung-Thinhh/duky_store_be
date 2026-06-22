# Tài Liệu Mô Tả Thông Số Bảng Điều Khiển SEO (SEO Dashboard Metrics)

Tài liệu này mô tả chi tiết nguồn gốc dữ liệu, công thức tính toán và các bảng cơ sở dữ liệu (Database Tables) chịu trách nhiệm cung cấp thông tin cho **Bảng điều khiển index, technical SEO và content** trên ứng dụng `seo-console`.

---

## 1. Kiến Trúc Kết Nối API
Hệ thống frontend `seo-console` gọi tới hai API chính của dự án NestJS `Backend-Dukyboot`:
*   **Tổng quan lỗi kỹ thuật (Overview API):** `GET /api/v1/admin/gsc/overview`
*   **Ứng cử viên lập chỉ mục (Candidates API):** `GET /api/v1/admin/gsc/candidates`

Cả hai API này đều được xử lý bởi lớp `AdminGscController` và logic nghiệp vụ được thực hiện trong **`GscService`** (File: `src/modules/seo/gsc.service.ts`).

---

## 2. Chi Tiết Các Chỉ Số Trên Bảng Điều Khiển

### 🟢 2.1. Google Connection (Trạng thái kết nối Google)
*   **Giá trị hiển thị:** `Live` (Màu xanh - Đang hoạt động) hoặc `Off` (Màu xám - Ngắt kết nối).
*   **Logic tính toán:**
    *   Hàm `getGoogleConnectionStatus()` kiểm tra xem các cấu hình biến môi trường `.env` (`GSC_SERVICE_ACCOUNT_JSON` chứa Private Key và Client Email của Service Account) có hợp lệ không.
    *   Xác minh xem tài khoản dịch vụ có quyền truy cập vào URL site được khai báo qua biến `GSC_SITE_URL` (mặc định là `https://dukystore.com/`) trên Search Console hay không.
*   **Cấu hình liên quan:** File `.env` chứa `GSC_SITE_URL`, `GSC_SERVICE_ACCOUNT_JSON` hoặc đường dẫn tệp JSON credentials.

### 🔵 2.2. URL Candidates (Tổng số ứng cử viên lập chỉ mục)
*   **Giá trị hiển thị:** Số lượng (ví dụ: `925`) đại diện cho tất cả các trang/đường dẫn Google nên index.
*   **Logic tính toán:**
    Hàm `getCandidates()` thực hiện quét và tổng hợp toàn bộ URL của website từ các nguồn trong DB và tệp tĩnh:
    1.  **Static routes:** Đường dẫn tĩnh mặc định từ cấu hình hệ thống: `/`, `/products`, `/blog`, `/collections/boot-nam`, `/collections/boot-nu`, `/collections/phu-kien`, `/collections/outfit`.
    2.  **Public entities:** Các trang động có trạng thái hiển thị công khai:
        *   Sản phẩm đang bán: `/san-pham/[slug]` (Bảng `Product` với `status: PUBLISHED`, `deletedAt: null`).
        *   Bài viết đang hiển thị: `/blog/[slug]` (Bảng `BlogPost` với `status: PUBLISHED`, `deletedAt: null`).
        *   Danh mục sản phẩm hoạt động: `/danh-muc/[slug]` (Bảng `Category` với `status: ACTIVE`, `deletedAt: null`).
    3.  **Sitemap entries:** Các bản ghi khai báo URL sitemap thủ công trong bảng `SitemapEntry`.
    4.  **Redirects:** Cả đường dẫn nguồn (`sourcePath`) và đích (`targetPath`) đang hoạt động trong bảng `Redirect`.
    5.  **Url Mappings:** Đường dẫn cũ và mới phục vụ di chuyển web trong bảng `UrlMapping`.
    6.  **Live Sitemap:** Quét trực tiếp file sitemap thực tế đang chạy trên web (`sitemap.xml`).
    *Sau khi gom toàn bộ, hệ thống chuẩn hóa (normalize) và loại bỏ trùng lặp (de-duplicate) để ra con số tổng.*

### 🔴 2.3. Critical Fixes (Lỗi nghiêm trọng cần xử lý)
*   **Giá trị hiển thị:** Tổng số lượng các lỗi kỹ thuật nghiêm trọng (các nhóm lỗi có `severity: 'error'`).
*   **Công thức:** `Critical Fixes = (Lỗi trỏ tới URL sản phẩm chết) + (Lỗi trỏ tới URL blog chết) + (Trang chủ bị redirect) + (Redirect vòng lặp tự thân)`.

Chi tiết từng lỗi cụ thể:
1.  **Redirect sản phẩm trỏ tới URL chết:**
    *   *Mô tả:* Lệnh redirect trong DB có URL đích dạng `/san-pham/[slug]` nhưng slug này không tồn tại trong danh sách sản phẩm đang bán.
    *   *Bảng truy vấn:* `Redirect` join logic với `Product`.
2.  **Redirect blog trỏ tới URL chết:**
    *   *Mô tả:* Lệnh redirect trong DB có URL đích dạng `/blog/[slug]` nhưng bài viết đó đã bị xóa hoặc ẩn.
    *   *Bảng truy vấn:* `Redirect` join logic với `BlogPost`.
3.  **Homepage có redirect trong DB:**
    *   *Mô tả:* Lệnh chuyển hướng có đường dẫn nguồn là `/` (khiến người dùng truy cập trang chủ bị chuyển đi trang khác).
    *   *Bảng truy vấn:* `Redirect` với `sourcePath: '/'`.
4.  **Redirect tự trỏ về chính nó:**
    *   *Mô tả:* Đường dẫn nguồn và đường dẫn đích giống hệt nhau, gây ra lỗi chuyển hướng vòng lặp.
    *   *Bảng truy vấn:* `Redirect` với `sourcePath === targetPath`.

### 🟡 2.4. Warnings (Cảnh báo kỹ thuật SEO)
*   **Giá trị hiển thị:** Tổng số lượng lỗi có tính chất cảnh báo hoặc cần kiểm duyệt thông tin (`severity: 'warning'` hoặc `'info'`).
*   **Chi tiết bao gồm:**
    1.  **Sản phẩm thiếu meta description:** Các sản phẩm đang hiển thị công khai nhưng không có nội dung mô tả tìm kiếm trong bảng `SeoMetadata`.
    2.  **Entity đang bật noIndex:** Các trang được gắn cờ chặn Google index (`noIndex: true` trong bảng `SeoMetadata`).
    3.  **Canonical trong DB là URL tương đối:** Thẻ canonical chỉ khai báo dạng tương đối như `/san-pham/giay-boot` thay vì đầy đủ tên miền `https://dukystore.com/san-pham/giay-boot`.
    4.  **Media thiếu alt text:** Đếm số lượng tệp tin đa phương tiện trong bảng `Media` có trường `altText` bị rỗng hoặc NULL.

---

## 3. Các Bảng Cơ Sở Dữ Liệu (Database Tables) Liên Quan

| Tên Bảng (Prisma Model) | Trường dữ liệu được dùng | Mục đích trong SEO |
| :--- | :--- | :--- |
| **`Product`** | `id`, `name`, `slug`, `status`, `deletedAt` | Xác định URL sản phẩm canonical và sản phẩm còn sống hay chết. |
| **`BlogPost`** | `id`, `title`, `slug`, `status`, `deletedAt` | Xác định URL bài viết blog và trạng thái hiển thị bài viết. |
| **`Category`** | `id`, `name`, `slug`, `status`, `deletedAt` | Xác định danh mục sản phẩm công khai. |
| **`Redirect`** | `id`, `sourcePath`, `targetPath`, `status`, `statusCode` | Quét cấu trúc chuyển hướng URL để phát hiện redirect lỗi/chết. |
| **`UrlMapping`** | `oldUrl`, `newUrl`, `entityType`, `entityId` | Quét các liên kết chuyển dịch cấu trúc URL cũ của website. |
| **`SeoMetadata`** | `entityId`, `entityType`, `metaDescription`, `canonicalUrl`, `noIndex` | Kiểm tra thiếu meta, thẻ noindex, và cấu trúc URL canonical của trang. |
| **`Media`** | `id`, `altText`, `deletedAt` | Quét lỗi tối ưu hình ảnh thiếu nhãn thay thế (alt text). |
| **`SitemapEntry`** | `url`, `isActive` | Quét dữ liệu đường dẫn bổ sung cấu hình trong sitemap. |
| **`GscInspection`** | `inspectionUrl`, `coverageState`, `verdict`, `lastRequestedIndexingAt` | Lưu trữ kết quả kiểm tra URL từ Search Console API và nhật ký yêu cầu index. |
