---
title: "SQL Injection Authentication Bypass"
slug: "sqli-auth-bypass"
platform: "Hack The Box"
difficulty: "Easy"
vulnerabilities: ["SQL Injection","Authentication Bypass"]
publishedAt: "2026-09-03"
summary: "Phân tích cách câu truy vấn đăng nhập bị thay đổi cấu trúc và cách loại bỏ tận gốc lỗi SQL injection."
draft: true
---

> Bài viết sử dụng ứng dụng lab được phép kiểm thử. Không áp dụng payload lên hệ thống khi chưa có sự cho phép.

## Bối cảnh thử thách

Ứng dụng cung cấp form đăng nhập với hai trường `username` và `password`. Khi nhập sai thông tin, server trả cùng một thông báo chung. Mục tiêu đầu tiên là xác định dữ liệu đầu vào có bị nối trực tiếp vào câu truy vấn SQL hay không.

![Luồng request từ trình duyệt đến cơ sở dữ liệu](/writeups/request-flow.svg)

Các dấu hiệu ban đầu:

- Phản hồi thay đổi khi username chứa dấu nháy đơn.
- Thời gian phản hồi không thay đổi đáng kể.
- Không có rate limit trong môi trường lab.

## Phân tích nguyên nhân

Đoạn code rút gọn phía server có dạng:

```ts
const query = `SELECT id, role
  FROM users
  WHERE username = '${username}'
  AND password_hash = '${passwordHash}'`;
```

Giá trị do người dùng kiểm soát được ghép thẳng vào **cấu trúc** của câu lệnh. Database không còn phân biệt được đâu là dữ liệu và đâu là cú pháp SQL.

### Vì sao kiểm tra phía client không đủ?

Thuộc tính HTML như `required` hoặc `maxlength` chỉ cải thiện trải nghiệm nhập liệu. Request vẫn có thể được gửi trực tiếp bằng proxy hoặc script, vì vậy server phải coi mọi input là không đáng tin cậy.

### Xây dựng giả thuyết

Trong lab, một input kiểm thử tối thiểu khiến biểu thức `WHERE` luôn đúng và bỏ qua phần còn lại của câu truy vấn. Mục tiêu của bước này không phải thử thật nhiều payload, mà là kiểm chứng ba điều:

1. Input có thay đổi cú pháp truy vấn hay không.
2. Phần còn lại của truy vấn có thể được vô hiệu hóa hay không.
3. Ứng dụng chọn bản ghi nào khi có nhiều kết quả.

## Khai thác trong môi trường lab

Request gốc:

```http
POST /login HTTP/1.1
Host: lab.example
Content-Type: application/x-www-form-urlencoded

username=test&password=test
```

Sau khi xác nhận injection bằng input vô hại trong lab, request kiểm chứng trả về phiên của tài khoản đầu tiên. Đây là authentication bypass vì server quyết định danh tính từ kết quả của câu SQL đã bị thay đổi.

> Không đưa payload hoạt động trên mục tiêu thật vào automation. Giữ phạm vi thử nghiệm đúng với lab và rule của CTF.

## Cách khắc phục

Sử dụng prepared statement để câu lệnh và dữ liệu được truyền riêng biệt:

```ts
const user = await database.query(
  `SELECT id, role, password_hash
   FROM users
   WHERE username = $1`,
  [username],
);
```

Sau đó so sánh password bằng thư viện hash phù hợp. Không đặt password hoặc hash trực tiếp vào câu SQL nếu không cần thiết.

### Defense in depth

| Biện pháp | Tác dụng |
| --- | --- |
| Prepared statement | Loại bỏ khả năng input thay đổi cấu trúc SQL |
| Tài khoản DB ít quyền | Giảm tác động nếu còn lỗ hổng |
| Thông báo lỗi chung | Không để lộ chi tiết truy vấn |
| Rate limit | Giảm brute force và probing tự động |
| Security logging | Phát hiện chuỗi input bất thường mà không log password |

## Bài học rút ra

Root cause không phải là “thiếu bộ lọc dấu nháy”, mà là **trộn code với data**. Blocklist ký tự có thể bị bypass và dễ làm hỏng input hợp lệ; parameterized query mới là biện pháp sửa đúng lớp.
