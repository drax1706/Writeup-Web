# WebSec Write-up Vault

Website đăng Web CTF write-up bằng Next.js App Router, TypeScript và Tailwind CSS. Thư viện tự nhận bài public hoặc bài có flag từ thư mục nội dung; thêm bài mới không cần sửa page, navigation hay API. Encoder và JWT Analyzer xử lý dữ liệu ngay trong trình duyệt.

![Giao diện WebSec Vault trên desktop](docs/screenshots/home-desktop.png)

[Giao diện mobile](docs/screenshots/home-mobile.png) · [Encoder / Decoder](docs/screenshots/encoder.png) · [Trang đọc write-up](docs/screenshots/writeup.png)

## Chạy local

Yêu cầu Node.js 22 hoặc 24 và npm.

```sh
npm ci
npm run dev
```

Mở <http://localhost:3000>. Bài public và tools không cần secret. Bài khóa cần hash flag riêng và một `SESSION_SECRET` dùng chung; CLI bên dưới tạo cấu hình local mà không ghi đè secret hiện có.

## Thêm một bài public

Đã có Markdown export từ HackMD? Dùng trực tiếp:

```powershell
npm run writeup:import -- --file "C:/Users/chanl/Downloads/notes.md" --slug my-notes
npm run content:check
```

Importer lấy title từ front matter hoặc heading `#`; có thể ghi đè bằng `--title "Tên bài"`. Nếu file có slug hợp lệ thì bỏ `--slug` được. Metadata còn thiếu dùng giá trị nháp để bạn sửa. Import luôn tạo `draft: true`, giữ file nguồn và từ chối ghi đè bài cũ. Sau khi sửa bài và đổi `draft: false`, chạy `npm run check`, commit branch rồi mở PR.

Ảnh tương đối PNG/JPG/GIF/WebP/AVIF nằm cạnh file export hoặc trong thư mục con được chép vào `public/images/<slug>/` và sửa link tự động, gồm cả reference images. Ảnh HTTP/HTTPS giữ nguyên URL, không tải về. SVG/HTML cần chuyển sang ảnh trước; ảnh nằm ngoài thư mục export hoặc ảnh bị thiếu sẽ báo lỗi. Ảnh được chép vào `public` có URL công khai ngay khi deploy, kể cả khi bài còn draft.

Để nhập bài khóa, thêm `--access locked` rồi dùng `writeup:flag`. Importer không tự chép ảnh local của bài khóa vào `public`; dùng ảnh minh họa công khai hoặc thiết kế private storage cho ảnh lời giải. Thân bài khóa không được dùng để tự sinh summary công khai.

Nếu viết bài mới từ đầu:

```sh
npm run writeup:new -- --slug my-first-writeup --title "Write-up đầu tiên"
```

Lệnh tạo `content/public/my-first-writeup.md` gồm front matter hợp lệ và dàn ý Markdown. Mặc định `draft: true` để bài chưa xuất hiện trên website. Sửa metadata và nội dung, sau đó đổi `draft: false` để xuất bản:

```yaml
---
title: "Write-up đầu tiên"
slug: "my-first-writeup"
platform: "Personal Lab"
difficulty: "Easy"
vulnerabilities: ["Access Control"]
publishedAt: "2026-09-09"
summary: "Mô tả ngắn về bài viết, có từ 20 đến 240 ký tự."
draft: false
---
## Tổng quan

Nội dung bài viết...
```

Lưu file và tải lại trang khi chạy `npm run dev`; khởi động lại dev server nếu thay đổi nội dung chưa được nhận. Với production, chạy build mới hoặc commit để tạo deployment mới. Không cần cập nhật danh sách bài bằng tay.

## Thêm một bài yêu cầu flag

```sh
npm run writeup:new -- --slug idor-notes --title "Phân tích IDOR" --access locked
npm run writeup:flag -- --slug idor-notes
```

Lệnh đầu tạo hai file:

```text
content/locked/idor-notes/
├── metadata.json   # Metadata công khai; tên biến môi trường chứa hash
└── writeup.md      # Thân bài; không cần front matter
```

Lệnh thứ hai yêu cầu nhập flag ẩn trong terminal, lưu bcrypt hash vào `.env.local` và tạo `SESSION_SECRET` ngẫu nhiên nếu chưa có hoặc đang để trống. Secret hợp lệ đã có và các biến môi trường khác được giữ nguyên. Flag bạn nhập không được in lại hay lưu plaintext. Khởi động lại Next.js sau khi cập nhật môi trường.

`metadata.json` do CLI tạo có dạng:

```json
{
  "title": "Phân tích IDOR",
  "slug": "idor-notes",
  "platform": "Personal Lab",
  "difficulty": "Easy",
  "vulnerabilities": ["Access Control"],
  "publishedAt": "2026-09-09",
  "summary": "Mô tả ngắn về bài khóa, không chứa lời giải hoặc flag.",
  "draft": true,
  "flagHashEnv": "WRITEUP_FLAG_HASH_IDOR_NOTES"
}
```

Sửa metadata, viết lời giải trong `writeup.md`, cấu hình flag và đổi `draft` thành `false`. Bài xuất hiện ở `/writeups/idor-notes` và trong thư viện. Trước xác minh, người đọc chỉ nhận metadata và form; server đọc `writeup.md` sau khi kiểm tra session hợp lệ. Mỗi bài khóa có `flagHashEnv` riêng; flag của bài này không tự mở bài khác.

Nếu muốn tạo flag ngẫu nhiên:

```sh
npm run writeup:flag -- --slug idor-notes --generate
```

Flag ngẫu nhiên chỉ được hiển thị sau khi ghi cấu hình thành công; tự lưu ở nơi riêng để sử dụng. Với automation, thêm `--stdin` và truyền một dòng UTF-8 qua standard input. Không truyền flag bằng đối số dòng lệnh: CLI không có tùy chọn `--flag` và tránh để flag trong shell history.

Để chủ động đổi flag đã cấu hình:

```sh
npm run writeup:flag -- --slug idor-notes --replace
```

Không có `--replace`, CLI từ chối thay hash đang tồn tại. Đổi flag giữ nguyên `SESSION_SECRET`: những session đã cấp vẫn còn hiệu lực đến khi hết hạn 30 phút. Đổi `SESSION_SECRET` khi cần vô hiệu hóa **tất cả** session. Chưa có chức năng thu hồi riêng session của một bài.

## Quy tắc nội dung

- Slug gồm chữ thường, số và dấu gạch ngang, tối đa 100 ký tự. Slug phải trùng tên file public hoặc tên thư mục locked và không trùng bất kỳ bài nào, kể cả draft.
- Title dài 1–120 ký tự; platform 1–80; summary 20–240; ngày theo `YYYY-MM-DD` và phải là ngày thực.
- Độ khó nhận `Easy`, `Medium`, `Hard`, `Insane`. `vulnerabilities` là mảng ít nhất một chuỗi không rỗng.
- `draft: true` ẩn cả khỏi danh sách lẫn truy cập URL trực tiếp/API. Bỏ trường draft tương đương `false` để giữ tương thích bài cũ. Draft vẫn phải có metadata hợp lệ.
- `flagHashEnv` là tên biến server viết hoa thuộc nhóm `FLAG_HASH` (ví dụ `WRITEUP_FLAG_HASH_IDOR_NOTES` hoặc `MY_LAB_FLAG_HASH`), không bắt đầu bằng `NEXT_PUBLIC_`; mỗi bài khóa dùng một tên khác nhau. Không dùng biến runtime như `SESSION_SECRET`. CLI mặc định sinh `WRITEUP_FLAG_HASH_<SLUG_IN_HOA_VÀ_GẠCH_DƯỚI>`.
- Dùng heading cấp 2/3 để tạo mục lục, fenced code block để highlight/copy code. Ảnh public đặt trong `public/images/` và dùng đường dẫn `/images/ten-anh.png`.

CLI từ chối ghi đè bài hoặc thư mục đã tồn tại. Muốn đổi slug, đổi cả tên file/thư mục và trường `slug`, kiểm tra không trùng bài khác rồi cập nhật các link cũ. URL cũ không tự redirect; session gắn với slug cũ không mở slug mới. Có thể giữ nguyên `flagHashEnv` khi đổi slug nếu đó vẫn là cùng một bài và tên biến không trùng bài khác.

Catalog xác thực toàn bộ metadata khi build, bao gồm draft, và phát hiện slug/tên biến hash trùng. Không lưu flag, lời giải hoặc trường riêng tư trong metadata vì metadata bài đã xuất bản hiển thị công khai. Draft và bài khóa **không bảo vệ source trong repository**: file đã commit vẫn đọc được nếu repository public. Nội dung thật cần bảo mật phải chuyển sang private storage và không đặt ảnh nhạy cảm trong `public/`.

## Biến môi trường

| Biến                  | Cách dùng                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`      | Khóa ký session, ít nhất 32 byte UTF-8. CLI tạo giá trị ngẫu nhiên khi thiếu/trống, giữ nguyên giá trị hợp lệ đã có. |
| `WRITEUP_FLAG_HASH_*` | Mỗi biến chứa bcrypt hash của một flag; tên chính xác lấy từ `metadata.json`. CLI dùng cost 12.                      |
| `PROFILE_GITHUB_URL`  | URL HTTPS GitHub công khai; bỏ trống để ẩn link.                                                                     |
| `PROFILE_CV_URL`      | URL HTTPS CV công khai; bỏ trống để ẩn link.                                                                         |

`.env.local` được Git bỏ qua. CLI sửa riêng hash cần cập nhật, giữ comment/biến khác, dùng file tạm rồi đổi tên để tránh file cấu hình bị ghi dở. Một file lock ngăn hai CLI cập nhật cùng lúc. Nếu tiến trình bị dừng đột ngột, chỉ xóa `.env.local.lock` sau khi chắc chắn không còn CLI nào đang ghi.

Next.js nội suy `$VARIABLE` trong dotenv, nên bcrypt `$` được ghi thành `\$` trong `.env.local`. Khi nhập hash vào dashboard Vercel, đổi từng `\$` thành `$`, không thêm dấu nháy bao ngoài. CLI chỉ chỉnh `.env.local`; nếu cùng tên biến đã có trong `process.env` hoặc `.env.production.local`/`.env.development.local`, giá trị đó được Next.js ưu tiên hơn. Xem [quy tắc biến môi trường Next.js](https://nextjs.org/docs/app/guides/environment-variables).

Bài mẫu có sẵn giữ tên `DEMO_FLAG_HASH` trong metadata để dùng tiếp `.env.local` cũ. Đây chỉ là cấu hình của bài đó; ứng dụng/CLI không phụ thuộc vào slug hoặc tên biến demo. Không cần chạy `setup:demo` nữa.

## Kiểm tra

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run check` chạy cả bốn bước trên cùng `content:check`. Lệnh `content:check` dùng chung schema/discovery với ứng dụng, kiểm tra metadata, trùng slug/env hash, thân bài rỗng và ảnh local bị thiếu trước khi build. Nó đọc file nội dung trong môi trường authoring/CI; việc đọc nội dung khóa khi phục vụ HTTP vẫn yêu cầu session.

Unit/security tests gồm Markdown XSS, Encoder Unicode/input lỗi, JWT, metadata/catalog, tách quyền giữa các bài, flag/session/API và authoring CLI. CLI tests dùng thư mục tạm; không sửa nội dung hoặc `.env.local` thật. Build phát hiện lỗi nội dung trước khi deploy.

Smoke test trình duyệt chạy trên desktop 1440×1000 và mobile 390×844:

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

Playwright khởi động production server ở `http://127.0.0.1:3000`, hoặc dùng server local đã có. Build lại trước khi chạy nếu code/nội dung thay đổi. Trên Linux dùng `npx playwright install --with-deps chromium`. Xem lỗi bằng `npx playwright show-report`; report/trace được Git bỏ qua. Screenshot nằm trong `docs/screenshots/`.

`npm run test:smoke` kiểm tra HTTP với production server đang chạy. Cấp `SMOKE_SLUG` là slug bài khóa đã xuất bản, `SMOKE_FLAG` qua môi trường và `SMOKE_BASE_URL` nếu cần đổi URL. Có thể đặt `SMOKE_PROTECTED_MARKER` là đoạn riêng biệt trong thân bài để kiểm tra nội dung khóa. Script kiểm tra flag đúng/sai, cookie và HTML/RSC; không in flag/cookie/marker. Nó tự chuyển tiếp cookie để kiểm tra HTTP, không thay cho việc xác nhận browser lưu cookie Secure qua HTTPS. Lệnh dùng lượt thử trong rate limit nên tránh chạy liên tục.

Workflow GitHub Actions chạy npm ci, content:check, lint, typecheck, unit/security tests, build và Playwright. Job CD tùy chọn dùng `needs: quality`, chỉ deploy khi push vào main và repository variable `DEPLOY_VERCEL=true`. Khi chưa bật biến này, dùng Vercel Git integration theo plan. Xem [hướng dẫn CI/CD và đăng bài](docs/CI_CD.md), [các file logic cần hiểu](docs/CODE_GUIDE.md) và [tiến độ theo plan](docs/PROJECT_STATUS.md). Chỉ coi CI/deploy hoàn thành sau khi kiểm chứng kết quả tại repository/deployment thật; các hạng mục tùy chọn như ký JWT, CVE Watch và database chưa thuộc bản này.

## Kiến trúc và bảo mật

```text
content/public/*.md                    → metadata + nội dung public
content/locked/*/metadata.json         → metadata bài khóa
content/locked/*/writeup.md            → chỉ đọc sau session hợp lệ

Danh sách → quét catalog, bỏ draft, trả metadata
Trang bài khóa → kiểm tra cookie HMAC + slug + expiry → đọc Markdown
Form flag → POST /api/writeups/[slug]/unlock
          → catalog chọn flagHashEnv → bcrypt.compare
          → cấp cookie có slug và thời hạn
```

Cookie sống 30 phút, có `HttpOnly`, `SameSite=Strict`, path `/writeups`, `Secure` trong production. API kiểm tra cùng Origin, schema, body tối đa 512 byte và flag tối đa 72 byte UTF-8; không log flag/body. Module nội dung và bảo mật có `server-only`. Markdown bỏ HTML thô, dùng lọc URL mặc định, không chạy MDX. JWT luôn cảnh báo **decoded ≠ verified**; input của hai tools không được gửi tới API hay lưu lịch sử.

Rate limit là 5 lần/15 phút/IP dùng chung giữa mọi bài và 30 lần/phút cho mỗi process. Bộ nhớ từng process không đồng bộ giữa serverless instances và reset khi restart. Ngoài Vercel dùng bucket ẩn danh chung để không tin IP do client tự khai báo. Session là bearer cookie: bị sao chép có thể replay cho cùng bài đến khi hết hạn. Xem [THREAT_MODEL.md](THREAT_MODEL.md) để hiểu giới hạn.

## Triển khai GitHub + Vercel

1. Push project và `package-lock.json` lên GitHub; bỏ qua secret, `.env.local`, `node_modules`, `.next`.
2. Chạy CI; cấu hình branch protection nếu muốn chặn merge khi checks chưa đạt.
3. Import repository trong Vercel, chọn Next.js, Node.js 22 hoặc 24 và root chứa `package.json`. Build command `npm run build`, output mặc định.
4. Thêm `SESSION_SECRET` và hash được tham chiếu bởi **từng bài khóa** vào Environment Variables. Dùng cấu hình riêng cho Preview/Production.
5. Deploy và thử URL thật trong cửa sổ ẩn danh: draft không truy cập được, public đọc được, đúng flag chỉ mở bài tương ứng, cửa sổ khác vẫn khóa và tools hoạt động trên mobile.
6. Mỗi lần đổi nội dung hoặc biến môi trường, tạo deployment mới. URL production chỉ ghi lại sau khi xác minh.

File tracing trong `next.config.ts` đưa file Markdown/JSON cần thiết vào server bundle. Vercel Git integration có thể deploy khi push độc lập với CI; nếu chọn job CD trong workflow, tắt Git auto-deployment để tránh deploy hai lần. Cấu hình chi tiết trong [CI_CD.md](docs/CI_CD.md). Xem [Next.js trên Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [Output File Tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) và [GitHub Actions Node.js](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs).
