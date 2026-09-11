# Lyrad Market Place 1.1.0

## Đã bổ sung

- Bộ lọc Tất cả / Mobile (PE) / Máy Tính (PC) trong Khám Phá, Ứng Dụng, Trò Chơi.
- Admin Panel → Đăng Tải APK / EXE: hai tab chọn nền tảng, lưu bản cài đặt gốc, tính SHA-256 thật và tải lại đúng nội dung.
- Đăng Bán Sản Phẩm nằm ngay sau Hỗ Trợ & Hòm Thư: tên, mô tả, danh mục, nền tảng, giá VNĐ, phương thức thanh toán tự nhập, thông tin liên hệ, tệp cài đặt.
- Khách xem được các bài đã duyệt; đăng bán yêu cầu đăng nhập Google. Admin/NPH được đăng trực tiếp; USER/DEV phải chờ duyệt.
- Kiểm Duyệt Sản Phẩm yêu cầu tài khoản có quyền trên máy chủ và khóa riêng. Có xác nhận, từ chối, trả về sửa đúng một lần, lý do và lọc bốn trạng thái.
- Người bán sửa bài đã trả về trong “Bài đăng của tôi”, có thể giữ tệp cũ hoặc thay tệp mới rồi gửi lại. Bài quay về “Chưa kiểm tra”; không thể trả về lần thứ hai.
- Lịch sử ghi từng lần đăng, gửi lại và quyết định kiểm duyệt. Xóa lịch sử có hộp xác nhận; không xóa sản phẩm, không đặt lại số lần sửa, không đổi trạng thái bài.
- Các quyết định dùng transaction và khóa hàng để tránh hai người duyệt ghi đè nhau.
- Danh mục dữ liệu có sẵn Android, Windows, iOS và Linux. Chỉ Android/Windows được bật; chưa nhận file iOS/Linux.

## Trạng thái Neon

Migration `migrations/002_marketplace.sql` đã được áp dụng thành công ngày 11/09/2026 vào:
- Project: Lyrad Market 2 (`rapid-dust-22202306`).
- Branch: `br-snowy-sea-b3rk3fmh`, database `neondb`.
- Đã kiểm tra trên nhánh tạm trước khi áp dụng, nhánh tạm đã được xóa.
- Năm bảng mới đã tồn tại; bốn nền tảng đã được tạo. Không chèn bài đăng hoặc tệp giả vào database.

NPH đã được cấu hình trong Neon là `yuriyir57@gmail.com` theo xác nhận của chủ hệ thống. NPH đăng nhập Google, mở Admin Panel → Phân Quyền & Cấp Bậc, nhập email Google và chọn ADMIN để cấp quyền hoặc USER để thu hồi. Admin không thể cấp quyền cho người khác; không thể thay đổi tài khoản NPH bằng giao diện này.

Máy chủ xác minh tài khoản Google và đọc quyền từ `lyrad_market_roles` trên mỗi yêu cầu. Trường role trong hồ sơ / localStorage không tự cấp quyền cho hệ thống bán hàng. Khóa kiểm duyệt được cấu hình riêng trong Environment, không đưa lên GitHub.

## Đưa bản cập nhật lên web

Đây là bản mã nguồn cập nhật, chưa triển khai lên Render/Vercel đang chạy.

1. Cập nhật mã nguồn backend và thư mục `public` từ gói này vào repository của web.
2. Trên backend Render, giữ biến AI đang có và thêm:
   - `DATABASE_URL`: chuỗi kết nối của Lyrad Market 2, endpoint `ep-wispy-recipe-b3lsg7w2-pooler`.
   - `FIREBASE_WEB_API_KEY`: giá trị trong `.env.example` của dự án Firebase hiện tại.
   - `PRODUCT_REVIEW_KEY`: khóa kiểm duyệt riêng đã thống nhất (nhập nguyên giá trị trong Render, không thêm dấu ngoặc kép).
3. Deploy backend với lệnh hiện tại `npm start`, sau đó deploy frontend. `vercel.json` tiếp tục chuyển `/api/*` đến backend Render hiện tại.
4. NPH đăng nhập bằng Google, cấp role Admin cho các tài khoản cần quản trị. Các tài khoản đó đăng nhập Google và nhập khóa riêng để kiểm duyệt.
5. Không cần chạy lại migration trên database nêu trên. File SQL được kèm để dùng cho môi trường khác hoặc đối chiếu. Script có thể chạy lại và không xóa dữ liệu hiện có.

Chạy local: `npm ci`, sao chép `.env.example` thành `.env`, điền `DATABASE_URL` thật rồi `npm start`. Không đưa `.env` vào Git. Gói bàn giao không chứa `.env`, lịch sử Git hay node_modules.

## Giới hạn cần biết

- Tệp hiện được lưu dạng binary trong Neon: tối đa **32 MB/tệp**, **128 MB/tài khoản**. File đã tải lên nhưng chưa tạo bài vẫn tính dung lượng. Nên bổ sung object storage và upload phân đoạn trước khi nhận EXE/game dung lượng lớn.
- Bài bán hiển thị cách thanh toán và liên hệ do người bán nhập. Chưa có cổng thu tiền, đơn hàng, xác nhận thanh toán hay giao file tự động. File bán không có đường tải công khai; người kiểm duyệt được tải để kiểm tra.
- Kiểm tra đầu tệp APK/EXE và SHA-256 không phải quét mã độc. Giao diện không tuyên bố tệp đã an toàn.
- Bản APK cũ chỉ có metadata, không có tệp gốc, cần nhà phát hành đăng tải lại. Đã bỏ cơ chế tạo tệp văn bản giả đuôi APK.
- Các tính năng hồ sơ/diễn đàn cũ vẫn dùng API JSON cũ. Bản này không thay toàn bộ hệ thống xác thực và phân quyền cũ.

## Kiểm tra

`npm test`: 9 bài kiểm tra đã đạt, bao gồm quyền, khóa kiểm duyệt, giới hạn trả về, trạng thái đã xử lý và nội dung binary/SHA-256.

Đã kiểm tra cú pháp server, module marketplace, script frontend và script inline. Đã kiểm tra migration thật trên Neon.

`tests/browser.cjs` có kịch bản giao diện với dữ liệu kiểm thử riêng, không ghi vào Neon. Chưa chạy được do môi trường không có trình duyệt Chromium. Để chạy trên máy phát triển có Playwright/Chromium: khởi động web local rồi chạy `node tests/browser.cjs`. Cần kiểm tra trực quan desktop/mobile và đăng nhập Google thật sau khi deploy; không coi kiểm tra unit là thay thế cho bước này.
