# Hỗ trợ tệp nén khi đăng bán sản phẩm

- Mobile: .apk, .zip, .rar, .7z.
- PC: .exe, .zip, .rar, .7z.
- Giữ giới hạn 32 MB/tệp; kiểm tra chữ ký định dạng, hỗ trợ RAR 4/5.
- Đồng bộ bộ chọn tệp khi đổi nền tảng, sửa bài và nhập mới.
- Lưu nguyên byte và SHA-256; không giải nén trên máy chủ.

## Cài đặt và kiểm thử

Express 5.2.1 đã được khai báo trong dependencies và package-lock.json.
Chạy `npm ci` để cài đầy đủ thư viện, `npm test` để kiểm thử, `npm start` để khởi động Node.
Không đưa node_modules lên Git; môi trường triển khai cài thư viện từ lockfile.

Đã cài dependencies và chạy đạt 9/9 bài kiểm thử, bao gồm tải APK/EXE, ZIP, RAR 4/5, 7Z, kiểm tra byte và SHA-256, từ chối đuôi/nội dung sai và kiểm tra phân quyền.

## Triển khai

Cập nhật frontend và dịch vụ Node phục vụ API từ commit mới. Không cần thay đổi SQL Neon hoặc dịch vụ Python.
