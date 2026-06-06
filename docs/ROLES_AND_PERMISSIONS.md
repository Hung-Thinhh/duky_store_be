# 🔐 HỆ THỐNG PHÂN QUYỀN CHI TIẾT (ROLES & PERMISSIONS) - DUKY STORE

Tài liệu này cung cấp cái nhìn chi tiết và toàn diện về mô hình phân quyền **RBAC (Role-Based Access Control)** đang được áp dụng trong hệ thống Duky Store. 

Hệ thống phân quyền được đồng bộ chặt chẽ giữa **Database**, **NestJS Backend** (sử dụng guards bảo vệ API) và **Next.js Frontend** (sử dụng để hiển thị/ẩn menu và các nút thao tác trên Dashboard).

---

## 📌 Các Khái Niệm Cơ Bản

Hệ thống phân quyền được cấu thành từ 3 thành phần chính:
1. **Vai trò (Role):** Nhóm người dùng (ví dụ: Admin, Biên tập viên, Quản lý đơn hàng).
2. **Đối tượng (Subject):** Chức năng nghiệp vụ trong hệ thống (ví dụ: `products` - Sản phẩm, `orders` - Đơn hàng, `users` - Tài khoản quản trị).
3. **Hành động (Action):** Thao tác được phép thực hiện trên đối tượng đó:
   * `read`: Xem danh sách & xem chi tiết.
   * `create`: Thêm mới dữ liệu.
   * `update`: Chỉnh sửa dữ liệu.
   * `delete`: Xóa dữ liệu (thường là xóa mềm).
   * `export`: Xuất dữ liệu ra Excel / CSV.
   * `manage`: Toàn quyền tối cao đối với đối tượng này (tương đương với cả 5 quyền trên).

---

## 👑 Chi Tiết Quyền Hạn Của Từng Vai Trò (Roles)

### 1. 👑 SUPER_ADMIN (Quản trị tối cao) & ADMIN (Quản trị viên)
Đây là vai trò có quyền lực tối cao nhất trong toàn bộ hệ thống.
* **Mã quyền:** `['*']`
* **Quyền hạn chi tiết:**
  * **Toàn quyền quản trị nhân sự:** Thêm mới, chỉnh sửa thông tin, khóa/mở khóa hoặc xóa các tài khoản Admin khác.
  * **Toàn quyền cấu hình hệ thống:** Quản lý vai trò (`roles`), nhóm quyền hạn (`permissions`), chỉnh sửa các cài đặt chung (`settings`) như cấu hình gửi mail, cổng thanh toán ngân hàng, phí ship mặc định, SEO toàn trang, sitemap.
  * **Toàn quyền nghiệp vụ:** Quản lý sản phẩm, tồn kho, đơn hàng, thanh toán, bài viết blog, bình luận, mã giảm giá, thư viện hình ảnh media, v.v.

---

### 📦 2. ORDER_MANAGER (Quản lý đơn hàng & Kho)
Vai trò chuyên trách xử lý luồng vận hành bán hàng, quản lý dòng tiền giao dịch và điều phối hàng hóa trong kho.
* **Quyền hạn chi tiết:**
  * **Quản lý Đơn hàng (`orders.manage`, `orders.export`):** Được phép tạo đơn hàng mới, duyệt đơn, hủy đơn, cập nhật trạng thái đơn hàng, xuất toàn bộ dữ liệu đơn hàng ra file Excel để bàn giao cho bưu tá.
  * **Quản lý Kho hàng (`inventory.read`, `inventory.update`):** Xem số lượng tồn kho của từng biến thể sản phẩm và trực tiếp điều chỉnh tăng/giảm số lượng tồn kho khi nhập/xuất kho thực tế.
  * **Quản lý Thanh toán (`payments.manage`):** Xác nhận khách hàng đã chuyển khoản thành công hoặc xác nhận thu hộ COD.
  * **Quản lý Vận chuyển (`shipping.manage`):** Tạo vận đơn, liên kết hãng vận chuyển, cấu hình các vùng và phí vận chuyển.
  * **Quản lý Khách hàng (`customers.read`, `customers.update`):** Xem danh sách khách hàng và chỉnh sửa thông tin liên hệ của khách hàng.
  * **Xem sản phẩm (`products.read`):** Xem chi tiết thông tin, giá bán và hình ảnh sản phẩm để hỗ trợ việc tạo/xử lý đơn hàng.
  * **Chỉnh sửa sản phẩm (`products.update`):** Cập nhật thông tin sản phẩm và quản lý gallery hình ảnh sản phẩm.
  * **Quản lý Media (`media.manage`):** Upload, chỉnh sửa và xóa hình ảnh trong thư viện media để sử dụng cho gallery sản phẩm.
  * **Xem thống kê (`dashboard.read`):** Xem các biểu đồ doanh thu, số lượng đơn hàng trên trang chủ Dashboard để theo dõi hiệu suất bán hàng.
  * **Khác:** Xem phản hồi liên hệ khách hàng gửi về (`contacts.read`).

> [!WARNING]
> **Hạn chế:** Vai trò này **KHÔNG** được phép tạo mới hoặc xóa sản phẩm, không được viết bài viết blog và tuyệt đối không được can thiệp vào cài đặt hệ thống hoặc danh sách nhân viên.

---

### ✍️ 3. CONTENT_EDITOR (Biên tập viên nội dung & SEO)
Vai trò chịu trách nhiệm xây dựng nội dung truyền thông, viết bài viết chia sẻ, quản lý hình ảnh sản phẩm, tối ưu SEO và cấu hình giao diện.
* **Quyền hạn chi tiết:**
  * **Quản lý Bài viết (`blog.manage`):** Toàn quyền viết bài viết mới, chỉnh sửa nội dung, thêm danh mục bài viết, gắn thẻ tags, hẹn giờ đăng hoặc xóa bài viết.
  * **Quản lý Thư viện Media (`media.manage`):** Toàn quyền upload, xóa hoặc chỉnh sửa metadata của hình ảnh/video trong thư viện media.
  * **Quản lý Trang tĩnh (`pages.manage`):** Biên tập nội dung các trang như Giới thiệu, Chính sách bảo mật, Chính sách đổi trả.
  * **Quản lý Giao diện trang chủ (`homepage.manage`):** Cập nhật hình ảnh banner slider, các bài viết nổi bật, các danh mục sản phẩm muốn trình bày ở trang chủ.
  * **Quản lý SEO (`seo.read`, `seo.update`):** Xem và tối ưu hóa SEO Meta Title, Meta Description cho từng bài viết và toàn website.
  * **Xem sản phẩm (`products.read`):** Xem danh sách sản phẩm để trích dẫn hoặc chèn liên kết sản phẩm vào bài viết blog.
  * **Khác:** Xem chuyển hướng URL (`redirects.read`), xem sitemap (`sitemap.read`), xem dashboard tổng quan (`dashboard.read`).

> [!WARNING]
> **Hạn chế:** Vai trò này **KHÔNG** được chỉnh sửa giá bán sản phẩm, không được xem/sửa đơn hàng, không được can thiệp vào kho hàng, không được duyệt thanh toán và không được xem thông tin khách hàng.

---

### 👥 4. STAFF (Nhân viên hỗ trợ cửa hàng)
Vai trò hỗ trợ trực tuyến cơ bản, kiểm tra trạng thái hệ thống để trả lời khách hàng và tiếp nhận các yêu cầu hỗ trợ.
* **Quyền hạn chi tiết:**
  * **Xem thông tin hệ thống (Read-only):** Xem danh sách sản phẩm (`products.read`), xem tồn kho (`inventory.read`), xem thư viện ảnh (`media.read`), xem thông tin khách hàng (`customers.read`), xem thanh toán (`payments.read`) để tư vấn giá cả, tình trạng còn/hết hàng cho khách hàng.
  * **Theo dõi đơn hàng (`orders.read`, `orders.update`, `orders.export`):** Được xem chi tiết đơn hàng để giải đáp thắc mắc của khách và cập nhật nhẹ trạng thái đơn (ví dụ: ghi chú bưu tá gọi không nghe máy).
  * **Xử lý liên hệ (`contacts.read`, `contacts.update`):** Xem các lời nhắn hỗ trợ của khách gửi về từ form liên hệ trên website và cập nhật trạng thái xử lý liên hệ đó.
  * **Theo dõi vận chuyển (`shipping.read`, `shipping.update`):** Xem trạng thái giao nhận và cập nhật tiến độ giao hàng.
  * **Xem thống kê (`dashboard.read`):** Xem biểu đồ chung trên Dashboard.

> [!WARNING]
> **Hạn chế:** Vai trò này chỉ có quyền xem (Read), hoàn toàn **KHÔNG** được phép tạo mới hoặc xóa sản phẩm, đơn hàng, bài viết, media, hay thay đổi cấu hình tài khoản quản trị.

---

## 📊 Ma Trận Phân Quyền Chi Tiết (Permission Matrix)

Dưới đây là bảng tổng hợp trực quan giúp bạn dễ dàng so sánh quyền hạn của các vai trò đối với các chức năng chính:

| Nhóm Chức Năng | Chức Năng Cụ Thể | SUPER_ADMIN / ADMIN | ORDER_MANAGER | CONTENT_EDITOR | STAFF |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Nhân Sự & Hệ Thống** | Quản lý Tài khoản Admin (`users`) | 👑 **Toàn quyền** | ❌ Không | ❌ Không | ❌ Không |
| | Quản lý Vai trò & Quyền (`roles`, `permissions`) | 👑 **Toàn quyền** | ❌ Không | ❌ Không | ❌ Không |
| | Cấu hình cài đặt chung (`settings`) | 👑 **Toàn quyền** | ❌ Không | ❌ Không | ❌ Không |
| **Sản Phẩm & Kho** | Thêm mới / Chỉnh sửa Sản phẩm | 👑 **Toàn quyền** | ✅ Chỉnh sửa | ❌ Không | ❌ Không |
| | Xem thông tin Sản phẩm (`products.read`) | ✅ Có | ✅ Có | ✅ Có | ✅ Có |
| | Xem số lượng tồn kho (`inventory.read`) | ✅ Có | ✅ Có | ❌ Không | ✅ Có |
| | Điều chỉnh số lượng kho (`inventory.update`) | ✅ Có | ✅ **Có** | ❌ Không | ❌ Không |
| **Đơn Hàng & Vận Hành** | Tạo mới / Duyệt / Hủy Đơn hàng | 👑 **Toàn quyền** | ✅ **Toàn quyền** | ❌ Không | ❌ Không |
| | Xem chi tiết đơn hàng (`orders.read`) | ✅ Có | ✅ Có | ❌ Không | ✅ Có |
| | Xuất danh sách đơn hàng (`orders.export`) | ✅ Có | ✅ **Có** | ❌ Không | ✅ Có |
| | Duyệt trạng thái Thanh toán | 👑 **Toàn quyền** | ✅ **Toàn quyền** | ❌ Không | ❌ Không |
| | Cấu hình Vùng & Phí vận chuyển | 👑 **Toàn quyền** | ✅ **Toàn quyền** | ❌ Không | ❌ Không |
| **Nội Dung & SEO** | Viết / Sửa / Xóa bài viết Blog | 👑 **Toàn quyền** | ❌ Không | ✅ **Toàn quyền** | ❌ Không |
| | Upload / Xóa hình ảnh Media | 👑 **Toàn quyền** | ✅ **Toàn quyền** | ✅ **Toàn quyền** | ❌ Không |
| | Biên tập Trang tĩnh & Trang chủ | 👑 **Toàn quyền** | ❌ Không | ✅ **Toàn quyền** | ❌ Không |
| | Cấu hình SEO & Chuyển hướng | 👑 **Toàn quyền** | ❌ Không | ✅ **Toàn quyền** | ❌ Không |
| **Khách Hàng & Liên Hệ** | Xem thông tin Khách hàng | ✅ Có | ✅ Có | ❌ Không | ✅ Có |
| | Tiếp nhận & Trả lời liên hệ | ✅ Có | ✅ Có | ❌ Không | ✅ **Có** |

---

## 🛠️ Hướng Dẫn Kỹ Thuật Dành Cho Lập Trình Viên

### 1. Cách bảo vệ API trong Backend (NestJS)
Để kiểm tra quyền truy cập của một API, lập trình viên sử dụng decorator `@RequirePermissions` đi kèm với Guards tương ứng:

```typescript
// Chỉ cho phép user có quyền 'products.update' hoặc 'products.manage' được truy cập API sửa sản phẩm
@Put(':id')
@RequirePermissions('products.update')
async updateProduct(@Param('id') id: string, @Body() updateDto: UpdateProductDto) {
  return this.productsService.update(id, updateDto);
}
```

### 2. Cách kiểm tra quyền hiển thị ở Frontend (Next.js)
Để ẩn/hiển thị menu hoặc nút thao tác trên Dashboard tùy theo quyền hạn của tài khoản đang đăng nhập, frontend sử dụng hook `usePermissions`:

```tsx
const { hasPermission } = usePermissions();

return (
  <div>
    {/* Chỉ hiển thị nút "Sửa sản phẩm" nếu tài khoản có quyền sửa */}
    {hasPermission('products.update') && (
      <Button onClick={handleEdit}>
        Chỉnh sửa sản phẩm
      </Button>
    )}
  </div>
);
```
