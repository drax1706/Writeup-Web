## Khi đường dẫn bị ẩn

Bạn đã mở được bài demo bằng một session do server xác minh. Nội dung này chỉ được đọc và render sau khi cookie vượt qua kiểm tra chữ ký, thời hạn và slug bài viết.

Trong lab giả lập, một trang quản trị chỉ bị ẩn khỏi thanh điều hướng. Ứng dụng vẫn cho phép người dùng chưa đăng nhập gọi trực tiếp endpoint lấy báo cáo. Đây là lỗi **missing authorization**, vì biết đường dẫn không phải là bằng chứng về quyền truy cập.

## Phân tích luồng truy cập

Một điều kiện trong giao diện chỉ quyết định nút nào được hiển thị:

```typescript
if (user.role === "admin") {
  showReportButton();
}
```

Điều kiện đó không ngăn request trực tiếp. Mỗi điểm đọc dữ liệu phải tự xác minh quyền trước khi trả nội dung:

```typescript
async function readReport(session: Session | null) {
  if (!session || session.role !== "admin") {
    throw new Error("Forbidden");
  }

  return loadReport();
}
```

## Proof of Solve trong Vault

Form gửi flag đến API cùng origin. API kiểm tra bcrypt hash trên server rồi cấp cookie HttpOnly có thời hạn 30 phút. Cookie chứa token được ký bằng HMAC-SHA256; nội dung token không chứa flag và chỉ có hiệu lực cho bài demo này.

Hàm đọc bài khóa tự kiểm tra token trước khi đọc Markdown. Người đọc chưa mở khóa chỉ nhận metadata công khai. Request không hợp lệ, cookie bị sửa, token hết hạn hoặc token của slug khác đều không mở được nội dung.

## Giới hạn của demo

Đây là bài tập tự tạo, không phải write-up của một challenge đang diễn ra. Markdown được commit để người đọc repository có thể kiểm tra cách triển khai. Cơ chế này bảo vệ đường phục vụ nội dung của ứng dụng; repository công khai không phải nơi lưu nội dung bí mật.

Rate limit của MVP nằm trong bộ nhớ mỗi tiến trình. Khi chạy nhiều instance, cần chuyển bộ đếm sang dịch vụ dùng chung. Với tài liệu riêng tư thực tế, dùng private storage và kiểm tra quyền tại mọi đường đọc file, ảnh và tệp đính kèm.
