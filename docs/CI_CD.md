# Từ Markdown đến website production

Code đã có CI và một job CD có điều kiện. Chạy local thành công chưa chứng minh GitHub Actions hoặc Vercel đã chạy thật. Cần repository GitHub, project Vercel và cấu hình tài khoản để có URL production.

## 1. Luồng đăng bài hằng ngày

```text
Export Markdown + ảnh từ HackMD
→ writeup:import → sửa metadata và xem local
→ draft: false → content:check
→ push branch → CI → review/merge main → Vercel → kiểm tra URL
```

```powershell
git switch -c content/idor-notes
npm run writeup:import -- --file "C:/Users/chanl/Downloads/idor.md" --slug idor-notes
# Sửa content/public/idor-notes.md và đổi draft thành false
npm run check
git add content/public/idor-notes.md public/images/idor-notes
git commit -m "Add IDOR write-up"
git push -u origin content/idor-notes
```

Nếu bài không có ảnh local, bỏ đường dẫn ảnh khỏi `git add`. File Markdown nguồn được giữ nguyên. Có thể dùng VS Code Source Control cho các thao tác Git. Đối với bài chỉ sửa chữ, chỉnh `.md` trực tiếp cũng được.

## 2. CI kiểm tra gì?

[ci.yml](../.github/workflows/ci.yml) chạy khi push, pull request, merge queue hoặc gọi thủ công. Không lọc bỏ thay đổi Markdown.

| Bước                | Lỗi được phát hiện                                                  |
| ------------------- | ------------------------------------------------------------------- |
| `npm ci`            | Cài dependency đúng lockfile                                        |
| `content:check`     | Metadata sai, slug/env hash trùng, bài/ảnh thiếu; kiểm tra cả draft |
| lint + typecheck    | Lỗi quy tắc code và kiểu TypeScript                                 |
| unit/security tests | XSS, parsing, authorization, cookie, import và ghi cấu hình         |
| build               | Build production và đóng gói nội dung                               |
| Playwright          | Điều hướng, filter, gate, tools, Markdown trên desktop/mobile       |

CI thông thường không cần secret thật. Khi Playwright lỗi, report được lưu 7 ngày trong Actions artifacts. Bật branch ruleset cho `main`, yêu cầu PR và check **Lint, typecheck, test, build** trước merge. Cần một lần check chạy xong để chọn nó trong cấu hình repository. [GitHub: required checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

## 3. Cách kết nối theo plan: Vercel Git integration

1. Đưa source lên repository GitHub. Chọn private nếu nội dung source không được công khai.
2. Import repository trong Vercel, root là thư mục có `package.json`, framework Next.js, Node.js 22 hoặc 24, production branch `main`.
3. Thêm `SESSION_SECRET` và các hash có tên trong `content/locked/*/metadata.json` vào Vercel Environment Variables. Bcrypt dùng `$` nguyên bản trên dashboard; `.env.local` do CLI tạo dùng `\$`.
4. Giữ `DEPLOY_VERCEL` chưa đặt/khác `true`: GitHub chỉ chạy CI, Vercel quản lý deploy và preview.
5. Bật required check ở GitHub để chặn merge khi CI đỏ. Nếu project hỗ trợ Deployment Checks, chọn check CI trong Vercel để production chỉ được promote sau khi check đạt.

Git integration tự deploy từ Git; nó không tự chờ GitHub Actions chỉ vì đã có file workflow. [Vercel Git](https://vercel.com/docs/git), [Deployment Checks](https://vercel.com/docs/deployment-checks).

## 4. Tùy chọn: CD do GitHub Actions điều khiển

Job `deploy` trong cùng workflow có `needs: quality`: chỉ chạy khi toàn bộ CI đạt, sự kiện là **push vào main**, và repository variable **DEPLOY_VERCEL=true**. PR, fork, merge queue và workflow thủ công không chạy job production này.

Thiết lập một lần:

1. Tạo project Vercel và đặt environment của ứng dụng như trên.
2. Trong GitHub Settings → Secrets and variables → Actions, thêm secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Không gửi token vào chat hoặc commit vào repo.
3. Các ID lấy từ Vercel project hoặc `.vercel/project.json` sau khi link. Thư mục `.vercel` được Git bỏ qua.
4. Tạo GitHub Environment `production` nếu cần quy tắc môi trường riêng.
5. Tắt automatic Git deployments cho project để tránh hai hệ thống cùng deploy. Có thể thêm `"git": { "deploymentEnabled": false }` vào `vercel.json` khi chọn cách này.
6. Đặt repository variable `DEPLOY_VERCEL=true`, push/merge một commit vào `main` và xem job deploy.

Job tải cấu hình production, build bằng Vercel CLI đã pin version, rồi deploy `--prebuilt`. Build CI không có secret và build Vercel có cấu hình production là hai lần build với mục đích khác nhau; Vercel không build lại artifact đã deploy. Không upload `.vercel` hoặc các file env thành GitHub artifact.

Sau deploy, [deployment-check.mjs](../scripts/deployment-check.mjs) kiểm tra bốn public routes qua HTTPS rồi ghi URL vào Actions summary. Nếu bật Deployment Protection, kiểm tra này có thể bị chặn; cấu hình public production theo nhu cầu trước khi bật CD. Chưa tự rollback nếu smoke test thất bại: mở Vercel và chọn deployment tốt trước đó để rollback.

Quy trình CLI dựa trên [hướng dẫn chính thức Vercel](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel). Token chỉ có trong job production; workflow không dùng `pull_request_target` để chạy code PR với secret.

## 5. Kiểm chứng để đánh dấu ngày 4 hoàn thành

- Có run GitHub Actions xanh trên commit thực tế và URL deployment tương ứng.
- Trong cửa sổ ẩn danh: public đọc được, draft trả 404, bài khóa chỉ có form trước xác minh.
- Flag đúng mở đúng bài, cửa sổ khác vẫn khóa; thử flag sai và kiểm tra cookie Secure/HttpOnly.
- Tools hoạt động trên điện thoại; ảnh bài mới không bị 404.
- Ghi URL thật và commit vào README/CV sau khi kiểm tra. Không ghi URL mẫu như deployment đã tồn tại.
