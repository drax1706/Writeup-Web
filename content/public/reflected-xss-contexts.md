---
title: "Reflected XSS và bài toán output context"
slug: "reflected-xss-contexts"
platform: "PortSwigger Web Security Academy"
difficulty: "Medium"
vulnerabilities: ["Cross-Site Scripting", "Output Encoding"]
publishedAt: "2026-09-02"
summary: "Theo dấu input phản chiếu qua HTML, attribute và JavaScript context để chọn cách encode đầu ra chính xác."
---

> Mọi ví dụ trong bài được thực hiện trên lab dành riêng cho học Web Security.

## Bối cảnh thử thách

Trang tìm kiếm phản chiếu từ khóa vào phần kết quả. Input được encode ở một vị trí nhưng xuất hiện thêm trong thuộc tính HTML, khiến cùng một giá trị đi qua hai output context khác nhau.

```html
<h2>Kết quả cho: user input</h2>
<input value="user input" />
```

Mục tiêu là xác định chính xác **source**, các **sink**, và phép biến đổi dữ liệu trên đường đi.

## Lập bản đồ context

Không nên bắt đầu bằng danh sách payload dài. Trước hết, gửi một marker dễ tìm như `wsv-7391` rồi kiểm tra toàn bộ response.

### HTML text context

Trong nội dung giữa hai thẻ, các ký tự như `<` và `>` có thể mở thẻ mới nếu không được HTML encode. Cách phòng thủ phù hợp là để template engine escape output theo mặc định.

### HTML attribute context

Trong thuộc tính được đặt trong dấu nháy, input cần được encode theo attribute context. Chỉ thay `<` và `>` là chưa đủ nếu dấu nháy vẫn có thể kết thúc giá trị hiện tại.

### JavaScript context

Nếu input nằm trong một chuỗi JavaScript, HTML encoding không giải quyết đầy đủ vấn đề. Thiết kế tốt hơn là truyền dữ liệu qua JSON an toàn hoặc gán bằng DOM API thay vì sinh code từ chuỗi.

## Kiểm chứng trong lab

Quy trình kiểm chứng gồm:

1. Đặt marker và tìm tất cả vị trí phản chiếu.
2. Xác định parser đang xử lý từng vị trí.
3. Thử đóng context bằng input tối thiểu.
4. Xác nhận tác động bằng thao tác không phá hoại.

Ví dụ code dễ gặp lỗi:

```ts
results.innerHTML = `<p>${query}</p>`;
```

Thay bằng API coi input là text:

```ts
const paragraph = document.createElement("p");
paragraph.textContent = query;
results.replaceChildren(paragraph);
```

## Cách khắc phục

Ưu tiên framework binding an toàn và giữ dữ liệu ở dạng dữ liệu. Nếu thật sự cần render HTML do người dùng kiểm soát, phải sanitize bằng thư viện được duy trì và policy allowlist phù hợp.

| Sink | Lựa chọn an toàn hơn |
| --- | --- |
| `innerHTML` | `textContent` |
| `document.write` | Tạo node bằng DOM API |
| Chuỗi trong `<script>` | JSON serialization an toàn hoặc data attribute |
| URL do người dùng nhập | Parse URL và allowlist protocol |

### Header hỗ trợ phòng thủ

Content Security Policy có thể giảm tác động của một số XSS, nhưng không thay thế output encoding. Một policy tốt cũng giúp phát hiện inline script ngoài dự kiến qua report.

## Bài học rút ra

“Đã encode” chưa phải kết luận bảo mật. Câu hỏi đúng là: **encode cho parser nào, tại vị trí nào?** Cùng một chuỗi có thể an toàn trong text node nhưng nguy hiểm khi được đặt vào attribute, URL hoặc JavaScript.
