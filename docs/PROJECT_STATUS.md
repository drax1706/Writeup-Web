# Tiến độ theo WebSec Write-up Vault Final Plan

Tài liệu này đối chiếu kết quả trong source với plan 4 ngày. Phần hoàn thành local và phần cần tài khoản/URL thật được ghi riêng; không coi cấu hình workflow là bằng chứng deploy thành công.

| Mục tiêu                  | Kết quả hiện tại                                                                                          | Cách kiểm chứng                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Ngày 1: Blog              | Home, list/detail, Markdown, TOC, highlight/copy, ảnh, responsive, search/filter; có 2 public và 1 locked | Build + Playwright + Markdown tests                          |
| Ngày 2: Tools             | Encoder URL/Base64/Base64URL/Hex và JWT decode/claims, chạy trong browser                                 | Encoding/JWT tests + kiểm tra không gọi API trong Playwright |
| Ngày 3: Security          | Bcrypt, API theo slug, cookie HMAC/expiry, server-only, rate limit, XSS/access tests, threat model        | Unit/security tests và HTTP smoke trên production build      |
| Ngày 3: CI                | Workflow push/PR/merge queue, kiểm tra content + lint/types/tests/build/browser                           | Source sẵn sàng; cần run xanh trên GitHub thật               |
| Ngày 4: CD                | Vercel Git integration được hướng dẫn; có thêm job CD production sau CI nếu bật DEPLOY_VERCEL             | Cần repo/project, secrets, một deployment và URL thật        |
| Ngày 4: Portfolio         | README, threat model, screenshots, hướng dẫn đọc logic                                                    | Chỉ thêm URL/CV claim sau khi kiểm chứng production          |
| Cải tiến theo yêu cầu mới | Catalog tự tìm bài public/locked, draft, flags riêng; new/import/flag/check CLI; ảnh import tự sửa link   | Catalog/API/CLI/import tests                                 |
| Tùy chọn ngày 4           | Playwright desktop/mobile đã có                                                                           | `npm run test:e2e`                                           |

Chưa triển khai các mục tùy chọn/backlog khác: JWT signing, CVE Watch, Docker, database, admin dashboard, comment, Knowledge Base, chatbot hoặc private storage. Plan không yêu cầu các mục này cho MVP. Tài liệu học logic nằm trong [CODE_GUIDE.md](CODE_GUIDE.md), không phải tính năng Knowledge Base của website.

## Phần cần hoàn thành trên tài khoản thật

1. Chọn/tạo repository GitHub và project Vercel, kết nối source.
2. Đặt secret trực tiếp trong Vercel/GitHub, bật check bắt buộc cho main.
3. Push branch có bài mới và xem CI/preview; merge khi check đạt.
4. Kiểm tra URL production bằng cửa sổ ẩn danh, flag/cookie và ảnh của bài mới.
5. Ghi URL thật và commit triển khai vào README/CV.

Các bước và lựa chọn CD chi tiết: [CI_CD.md](CI_CD.md).

## Ghi chú giao diện

Bản Editorial Cyber Blog đã được áp dụng vào giao diện chính. Các bản preview và báo cáo tạm của đợt redesign đã được dọn; bộ test dùng trong CI và ảnh minh họa README vẫn được giữ.

Điểm accessibility còn lại: vùng kết quả Encoder và ba vùng header/payload/signature của JWT dùng `aria-label` trên `pre` chưa có role hỗ trợ tên truy cập. Các vùng vẫn focus và cuộn được bằng bàn phím, nhưng trình đọc màn hình có thể không thông báo tên ổn định.
