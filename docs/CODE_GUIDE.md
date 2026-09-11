# Đọc code và thực hành với WebSec Vault

Đọc theo một luồng dữ liệu, rồi chạy test chứng minh hành vi của luồng đó. Xem [README](../README.md) để viết bài/cấu hình, [CI/CD](CI_CD.md) để đưa website lên hosting và [THREAT_MODEL](../THREAT_MODEL.md) để hiểu giới hạn bảo vệ nội dung.

## Bản đồ đầu vào → xử lý → đầu ra

| Phần                | Đầu vào và đầu ra                                                             | Đọc code                                                                                                                                              | Test kiểm chứng                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Markdown / XSS      | Markdown → HTML bài viết, code block, mục lục                                 | [MarkdownRenderer](../components/MarkdownRenderer.tsx), [extractHeadings](../lib/markdown.ts)                                                         | [markdown.test](../tests/markdown.test.tsx)                                                                      |
| Catalog             | File nội dung + metadata → danh sách hoặc một bài theo slug                   | [writeup-catalog.server](../lib/writeup-catalog.server.ts), [writeup-sources](../lib/writeup-sources.mjs), [writeup-schema](../lib/writeup-schema.ts) | [writeup-catalog.test](../tests/writeup-catalog.test.ts), [writeup-schema.test](../tests/writeup-schema.test.ts) |
| Tạo bài / cấp flag  | Tham số CLI + nội dung người viết → bản nháp và cấu hình local                | [writeup-cli](../scripts/writeup-cli.mjs), [writeup-policy](../lib/writeup-policy.mjs)                                                                | [writeup-cli.test](../tests/writeup-cli.test.ts)                                                                 |
| Nhập bài / kiểm tra | Markdown có sẵn + ảnh → bản nháp; nội dung repository → báo lỗi hoặc thống kê | [import-writeup](../scripts/import-writeup.mjs), [check-content](../scripts/check-content.mjs)                                                        | [writeup-import.test](../tests/writeup-import.test.ts)                                                           |
| Tìm kiếm            | Metadata + bộ lọc URL → các thẻ bài phù hợp                                   | [WriteupExplorer](../components/WriteupExplorer.tsx), [filter-writeups](../lib/filter-writeups.ts)                                                    | [filter-writeups.test](../tests/filter-writeups.test.ts)                                                         |
| Encoding            | Văn bản + định dạng → chuỗi chuyển đổi hoặc lỗi                               | [encoding](../lib/encoding.ts), [EncoderTool](../components/EncoderTool.tsx)                                                                          | [encoding.test](../tests/encoding.test.ts)                                                                       |
| JWT                 | Token ba phần → JSON, thời gian, chữ ký và cảnh báo                           | [jwt](../lib/jwt.ts), [JwtAnalyzer](../components/JwtAnalyzer.tsx)                                                                                    | [jwt.test](../tests/jwt.test.ts)                                                                                 |
| Flag API            | POST JSON `{ flag }` + slug → lỗi hoặc cookie mở bài                          | [unlock route](../app/api/writeups/%5Bslug%5D/unlock/route.ts), [flag-verification.server](../lib/flag-verification.server.ts)                        | [unlock-api.test](../tests/unlock-api.test.ts), [flag-verification.test](../tests/flag-verification.test.ts)     |
| Session             | Cookie + slug + thời gian → cho phép hoặc từ chối đọc Markdown                | [unlock-session.server](../lib/unlock-session.server.ts), [locked-content.server](../lib/locked-content.server.ts)                                    | [unlock-session.test](../tests/unlock-session.test.ts), [writeup-catalog.test](../tests/writeup-catalog.test.ts) |
| CI / trình duyệt    | Commit + dependencies → kết quả kiểm tra và báo cáo                           | [workflow CI](../.github/workflows/ci.yml), [Playwright config](../playwright.config.ts)                                                              | [vault.spec](../tests/e2e/vault.spec.ts), [HTTP smoke](../tests/smoke.mjs)                                       |

## 1. Ranh giới server và trình duyệt

[Trang thư viện](../app/writeups/page.tsx) lấy `WriteupSummary[]` từ server rồi truyền sang bộ lọc phía trình duyệt. [Kiểu WriteupSummary](../types/writeup.ts) chỉ gồm metadata được công khai và `access`; `contentPath`, `flagHashEnv`, hash và secret không thuộc dữ liệu trả cho bộ lọc.

[Trang chi tiết](../app/writeups/%5Bslug%5D/page.tsx) tìm entry theo slug, chỉ đọc cookie nếu bài có `access: "locked"`. File có `server-only` giữ phần đọc nội dung và xác thực khỏi bundle client. `"use client"` đánh dấu phần cần sự kiện hoặc API trình duyệt; nó không phải cơ chế phân quyền.

**Bài tập:** lần theo một lần bấm thẻ bài từ [WriteupCard](../components/WriteupCard.tsx) đến trang chi tiết. Giải thích vì sao ẩn nút hoặc ẩn Markdown bằng CSS vẫn không bảo vệ được nội dung đã gửi xuống browser.

## 2. Viết Markdown và hiểu lớp chống XSS

Luồng hiển thị: đọc file → `MarkdownRenderer` → `react-markdown` → plugin GFM, slug heading và highlight code. `skipHtml` bỏ HTML thô; renderer giữ bộ lọc URL mặc định của thư viện và không thực thi MDX. Code trong fenced code block được hiển thị như văn bản.

Ảnh dùng đường dẫn trong Markdown và CSS responsive chung; renderer không gắn kích thước cứng với một ảnh của bài mẫu.

`extractHeadings()` lấy heading cấp 2/3 cho mục lục. Bộ đếm slug vẫn đi qua các cấp heading khác để link không lệch khi tiêu đề trùng nhau.

**Bài tập:** trong bản nháp local, thêm hai heading `## Phân tích` và một code block có chuỗi `<script>alert(1)</script>`. Kiểm tra hai mục lục dẫn đúng vị trí, đoạn code chỉ hiển thị chữ. Đọc test về HTML thô và URL `javascript:` để phân biệt render Markdown với cho phép HTML tùy ý.

Không đưa flag hoặc lời giải riêng tư vào title, summary hay metadata: các trường của bài đã xuất bản xuất hiện công khai. `public/` được phục vụ trực tiếp; file trong repository công khai cũng đọc được dù trang web yêu cầu flag.

## 3. Catalog và quy trình đưa bài vào thư viện

Catalog tự quét `content/public/<slug>.md` và `content/locked/<slug>/metadata.json`. Bài public chứa front matter và nội dung trong một file; bài locked tách metadata khỏi `writeup.md`. Danh sách chỉ đọc metadata bài khóa, còn phần đọc nội dung khóa nằm sau kiểm tra session.

Schema kiểm tra title, summary, platform, độ khó, ngày thực và slug. Slug phải trùng tên file/thư mục và không trùng bài khác, kể cả bản nháp. Mỗi bài khóa dùng tên biến `flagHashEnv` riêng; catalog không chứa hash hoặc flag gốc. `draft: true` ẩn bài khỏi danh sách, URL chi tiết và API mở khóa, nhưng metadata vẫn phải hợp lệ.

Tạo bản nháp bằng [writeup-new](../scripts/writeup-new.mjs), sửa nội dung/metadata rồi đổi `draft` thành `false` khi sẵn sàng:

```sh
npm run writeup:new -- --slug hoc-markdown --title "Ghi chép Markdown"
npm run writeup:new -- --slug hoc-session --title "Ghi chép session" --access locked
npm run writeup:flag -- --slug hoc-session
npm run writeup:import -- --file "./notes.md" --slug nhap-ghi-chep
npm run content:check
```

[writeup-flag](../scripts/writeup-flag.mjs) nhận flag qua ô nhập ẩn, tạo bcrypt hash trong `.env.local`, tạo `SESSION_SECRET` khi thiếu và giữ secret hợp lệ đã có. Không truyền flag thật trên argv hoặc chép nó vào tài liệu. Khởi động lại Next.js sau khi đổi cấu hình môi trường.

[writeup-import](../scripts/writeup-import.mjs) lấy metadata có sẵn hoặc heading `#` làm title, giữ file nguồn và luôn tạo bản nháp. Có thể thêm `--title` và `--access locked`. Với bài public, ảnh local được chép vào `public/images/<slug>/` và link Markdown được sửa tương ứng; ảnh mạng không được tải về. Import bài khóa từ chối chép ảnh local vào public để tránh lộ ảnh lời giải.

[content-check](../scripts/content-check.mjs) dùng chung phần đọc/xác thực nguồn với catalog, kiểm tra cả draft, thân bài không rỗng và ảnh local tồn tại. Lệnh này không xác minh flag thật hoặc thay cho kiểm tra giao diện. **Thực hành thêm:** import một file có ảnh tương đối, kiểm tra file nguồn không đổi; xóa ảnh ở bản sao luyện tập để thấy `content:check` báo slug và dòng cần sửa.

**Bài tập:** tạo hai bài khóa local với hai flag luyện tập riêng, giữ `draft: true` để xác nhận chúng chưa hiện. Xuất bản cả hai, mở một bài bằng flag của chính bài đó, rồi kiểm tra cookie của bài này không mở bài còn lại. Các test catalog/CLI dùng thư mục tạm, không cần secret thật.

## 4. Encoding: Unicode, byte và định dạng

`encodeText()` / `decodeText()` chọn URL, Base64, Base64URL hoặc Hex. Base64/Hex chuyển giữa văn bản và byte UTF-8; Base64URL đổi bảng ký tự và bỏ padding khi encode. URL dùng percent encoding cho một thành phần URL, không phải hàm chuẩn hóa cả URL.

Decoder kiểm tra bảng ký tự, độ dài, padding và UTF-8 để báo lỗi thay vì trả về chữ hỏng. Encoding có thể đảo ngược và không giữ bí mật dữ liệu. [EncoderTool](../components/EncoderTool.tsx) chạy tại browser, xóa kết quả cũ khi đầu vào/chế độ thay đổi và không gửi nội dung đến API.

**Bài tập:** round-trip `Xin chào 🔐` qua cả bốn định dạng; thử Hex `zz` và chuỗi có số ký tự lẻ. Nêu khác biệt giữa số ký tự JavaScript và số byte UTF-8 bằng một ký tự có dấu.

## 5. JWT: đọc được chưa có nghĩa là xác thực được

`analyzeJwt()` tách đúng ba phần, kiểm tra Base64URL, parse header/payload thành JSON object rồi so sánh `exp` và `nbf` với thời gian phân tích. UI hiển thị thêm `iat` và nguyên dạng signature; thời gian NumericDate dùng giây kể từ Unix epoch.

Công cụ không nhận khóa xác minh và không kiểm tra chữ ký. `alg`, role hay user ID trong payload là dữ liệu bên tạo token khai báo; đổi payload rồi encode lại không tạo ra chứng cứ đăng nhập. Cảnh báo `alg=none`, token hết hạn hoặc thiếu chữ ký không thay thế một bộ xác thực JWT đầy đủ.

**Bài tập:** dùng nút JWT mẫu, quan sát cảnh báo chưa xác minh và hết hạn. Trong test, thay `nowInSeconds` để kiểm tra đúng ranh giới `now === exp` và `now < nbf`, không cần chờ đồng hồ thật.

## 6. Flag API, cookie và quyền đọc bài

Luồng mở khóa: [UnlockForm](../components/UnlockForm.tsx) gửi POST cùng origin → catalog chọn bài khóa và tên biến hash → kiểm tra origin, content type, cấu hình, giới hạn lượt thử và body → bcrypt compare → trả `{ ok: true }` cùng cookie. API không trả Markdown hoặc flag trong JSON.

Body tối đa 512 byte; flag tối đa 72 byte UTF-8 để tránh hành vi cắt đầu vào của bcrypt. [Rate limiter](../lib/unlock-rate-limit.server.ts) giới hạn lượt thử và trả `429` cùng `Retry-After`; [test limiter](../tests/unlock-rate-limit.test.ts) mô phỏng thời gian để kiểm tra cửa sổ giới hạn. Bộ đếm hiện nằm trong từng process, chưa đồng bộ giữa nhiều instance.

Session là `payload.signature` ký HMAC-SHA256, khác với JWT ba phần ở công cụ. Payload chứa slug, thời điểm cấp/hết hạn và nonce; chữ ký bảo vệ tính toàn vẹn, không mã hóa payload. Server kiểm tra chữ ký, slug và hạn trước khi đọc Markdown khóa.

Cookie có `HttpOnly`, `SameSite=Strict`, path `/writeups` và `Secure` ở production. Thời hạn lấy từ `UNLOCK_SESSION_TTL_SECONDS`. Đổi flag không thu hồi cookie đã cấp; đổi `SESSION_SECRET` vô hiệu hóa toàn bộ session cũ. Chưa có thu hồi riêng từng session.

**Bài tập:** đọc test sửa payload/chữ ký, sai slug và thời điểm hết hạn; giải thích tại sao cookie của bài A không mở bài B. Khi xem cookie local bằng DevTools, không sao chép giá trị vào issue, ảnh chụp hoặc log.

## 7. CI kiểm tra gì, CD triển khai gì?

**CI** chạy kiểm tra cho thay đổi trong repository: cài dependency theo lockfile, `content:check`, lint, typecheck, test, build và Playwright. Xem bước thực tế trong [ci.yml](../.github/workflows/ci.yml). Test unit kiểm tra một hàm/luồng; test API kiểm tra quyết định xác thực; E2E kiểm tra hành vi người dùng trên desktop và mobile. `npm run check` chạy chuỗi kiểm tra local đến build; E2E chạy riêng.

**CD** đưa bản build lên môi trường thật. Job `deploy` có `needs: quality`, chỉ chạy khi CI đạt, sự kiện là push vào `main` và repository variable `DEPLOY_VERCEL` bằng `true`. Mặc định job này bị tắt. Vercel Git integration vẫn là lựa chọn riêng; chọn một luồng triển khai để tránh deploy hai lần và cấu hình required checks theo [CI/CD](CI_CD.md).

Preview và Production cần cấu hình môi trường riêng. Biến có `NEXT_PUBLIC_` được dành cho client; hash/secret chỉ ở server. `.env.local` không tự trở thành cấu hình của hosting. Secrets triển khai chỉ được cấp cho job production; job quality không cần secret thật. Theo [hướng dẫn triển khai](CI_CD.md) để đặt biến, redeploy và kiểm tra URL thật; có workflow trong repo chưa chứng minh đã deploy thành công.

**Bài tập:** chạy nhóm test dưới đây, tạo một lỗi schema trong bản nháp luyện tập để quan sát test/build báo lỗi, rồi sửa lại. Sau deployment, dùng cửa sổ ẩn danh kiểm tra bài công khai, bài khóa và một flag luyện tập; chỉ đánh dấu CD hoàn tất khi đã kiểm tra URL được triển khai.

```sh
npm test -- tests/markdown.test.tsx tests/encoding.test.ts tests/jwt.test.ts
npm test -- tests/writeup-catalog.test.ts tests/unlock-api.test.ts tests/unlock-session.test.ts
npm test -- tests/writeup-import.test.ts
npm run check
npm run test:e2e
```

Trên PowerShell chặn `npm.ps1`, thay `npm` bằng `npm.cmd`. E2E cần Chromium của Playwright và production build mới; xem [README](../README.md#kiểm-tra) để cài browser và đọc báo cáo lỗi.
