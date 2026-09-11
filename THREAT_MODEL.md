# Threat model — WebSec Write-up Vault

## Phạm vi và tài sản

Ứng dụng đăng nhiều write-up từ filesystem, gồm public, draft và bài yêu cầu flag. Cần bảo vệ hash/khóa ký, ngăn thực thi nội dung Markdown, tránh đưa thân bài khóa tới người chưa có session hợp lệ và cách ly quyền giữa các bài.

Chủ repository quản lý nội dung; không có tài khoản, upload, database hoặc editor web. Kiểm soát truy cập bảo vệ đường đọc qua ứng dụng. Người có quyền đọc repository hoặc deployment artifacts vẫn đọc được các file đã lưu, kể cả draft và bài khóa. Nội dung cần bí mật thật phải nằm trong private storage với quyền truy cập phù hợp.

## Ranh giới tin cậy

| Vùng                | Giả định                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Browser/request     | Không tin body, slug, cookie, Origin, Host hoặc forwarding headers do request cung cấp.                  |
| Public Markdown     | Front matter phải đúng schema; body có thể chứa HTML/URL không an toàn.                                  |
| Locked metadata     | `metadata.json` chỉ chứa metadata có schema và tên biến hash; không chứa body, flag hoặc hash.           |
| Locked body         | `writeup.md` chỉ được đọc sau kiểm tra session của đúng slug. Không đọc body khi lập danh sách.          |
| Runtime environment | Secret chỉ ở server; người có quyền thay code/môi trường có thể vượt cơ chế này.                         |
| Authoring CLI       | Chạy local với quyền chủ project; chỉ tạo đường dẫn từ slug hợp lệ và sửa hash được metadata tham chiếu. |

## Stored XSS qua Markdown

Renderer dùng `react-markdown` với `skipHtml`, giữ bộ lọc URL mặc định và không bật MDX/`rehype-raw`. React escape text; link ngoài có `noopener noreferrer`. Không coi Markdown hoặc nhãn metadata là HTML được phép thực thi.

`tests/markdown.test.tsx` kiểm tra script/event handler, URL nguy hiểm và liên kết mục lục. Response headers có `nosniff` và `X-Frame-Options: DENY`; chưa có CSP nonce. Header không thay thế việc lọc nội dung. Ảnh/link ngoài có thể gửi thông tin request tới host đích, nên tác giả cần quản lý nguồn ảnh.

## Catalog, draft và path traversal

Catalog quét `content/public/*.md` cùng `content/locked/*/metadata.json`; bài mới không cần đăng ký slug trong code. Metadata được kiểm tra kiểu, trường hợp lệ, độ dài, ngày thực, tên file/thư mục khớp slug. Slug chỉ gồm chữ thường/số/gạch ngang, tối đa 100 ký tự. Slug trùng giữa public/locked hoặc giữa draft/published làm validation thất bại thay vì chọn bài theo thứ tự đọc.

`draft: true` loại bài khỏi danh sách, trang chi tiết và API unlock. Metadata draft vẫn được kiểm tra khi build. Metadata public không được chứa trường bảo mật; metadata locked chỉ thêm tham chiếu `flagHashEnv`. Tên biến hash phải là tên server thuộc nhóm `FLAG_HASH`, không dùng `NEXT_PUBLIC_*` hay các biến runtime như `SESSION_SECRET`; catalog không cho nhiều bài dùng cùng tham chiếu.

Tên biến hash không phải secret, nên không dựa vào việc giấu tên này để bảo vệ flag. Giữ summary/title/tags không chứa lời giải. Không đặt ảnh nhạy cảm trong `public/`, vì ảnh ở đó được truy cập trực tiếp.

## Bỏ qua kiểm soát truy cập hoặc mở nhầm bài

Luồng đọc bài khóa xác thực cookie trước khi đọc body. Cookie chứa version, slug, thời điểm cấp/hết hạn và nonce; được ký HMAC-SHA256. Server kiểm tra cấu trúc, chữ ký constant-time, thời hạn và đúng slug. Cookie của bài A không cho đọc bài B; cookie bị sửa, quá hạn hoặc thiếu secret đều thất bại.

Unlock API tra metadata của bài locked đã xuất bản, lấy bcrypt hash từ đúng `flagHashEnv` và cấp session cho slug tương ứng. Nó không có giá trị mặc định mở được bài khi thiếu hash/secret và không nhận tên biến môi trường từ body request. Flag của bài A chỉ mở bài A, trừ khi chủ project chủ động đặt cùng giá trị flag cho các bài khác nhau.

Cookie tồn tại 1.800 giây, `HttpOnly`, `SameSite=Strict`, path `/writeups`, không có Domain và `Secure` ở production với tiền tố `__Secure-`. Trang đọc render động theo cookie; API phản hồi `private, no-store` để tránh chia sẻ kết quả mở khóa qua cache HTML/RSC.

Session là bearer credential: cookie bị sao chép có thể replay cho cùng slug đến khi hết hạn. Đổi hash flag không thu hồi các session đã cấp, vì cookie không gắn với phiên bản hash. Đổi `SESSION_SECRET` vô hiệu hóa toàn bộ session. Đổi slug làm URL thay đổi và cookie của slug cũ không mở slug mới. Chưa có thu hồi riêng từng session hoặc redirect slug cũ.

## Rò rỉ flag, ghi đè cấu hình và authoring CLI

`writeup:new` tạo draft, từ chối slug đã tồn tại trong cả public/locked và không có chế độ ghi đè bài. Bài khóa dùng sidecar JSON riêng, nên các màn hình danh sách không cần đọc body để lấy metadata. CLI không chấp nhận symlink trong đường dẫn nội dung hoặc file môi trường cần ghi.

`writeup:flag` nhận flag qua terminal ẩn hoặc `--stdin`; không có flag plaintext trong argv. `--generate` chỉ in flag mới sau khi ghi cấu hình thành công. Flag không được ghi vào metadata, Markdown hoặc `.env.local`; file môi trường chỉ nhận bcrypt hash cost 12 và signing secret. Các tests dùng flag giả và thư mục tạm, không sửa môi trường thật.

Hash đã có chỉ thay khi dùng `--replace`. Cập nhật giữ nguyên biến không liên quan, comment, giá trị multiline và `SESSION_SECRET` hợp lệ; khóa ký mới chỉ sinh nếu thiếu/trống. Secret đang có nhưng quá ngắn hoặc biến bị khai báo trùng gây lỗi để người quản lý sửa rõ ràng. Ghi file tạm, kiểm tra file gốc chưa thay đổi và đổi tên file giúp tránh ghi dở; exclusive lock ngăn hai CLI của ứng dụng ghi đồng thời.

Cơ chế lock không chống được người khác có quyền ghi filesystem cố tình sửa file, và tiến trình bị kill có thể để lại lock/tệp tạm. Chỉ dọn lock khi biết không còn tiến trình đang ghi. `.env.local` và các file `.env*` tạm bị Git bỏ qua; quyền file được yêu cầu là `0600` nơi hệ điều hành hỗ trợ.

Next.js tự nội suy `$VARIABLE`, nên CLI escape dấu `$` của bcrypt trong dotenv. Trên dashboard deployment cần nhập hash gốc, không chứa dấu escape của dotenv. Môi trường process và các file environment theo chế độ có thể ưu tiên hơn `.env.local`; CLI không sửa những nguồn cấu hình đó. Gitignore không xóa secret từng commit; khi bị lộ, cần rotate khóa và xử lý lịch sử repository riêng.

## Brute force, CSRF và cạn tài nguyên

API chỉ nhận POST JSON, kiểm tra cùng Origin dựa trên authority công khai của request và schema body. Origin không xác thực danh tính và client tự động có thể giả header; nó bảo vệ luồng browser cùng với `SameSite=Strict`, không thay thế flag verification.

Body được đọc theo stream với giới hạn 512 byte; flag tối đa 72 byte UTF-8 để tránh bcrypt cắt ngắn dữ liệu. Hash có cost cho phép từ 10–14; CLI tạo cost 12. Lỗi sai flag không cấp cookie và không tiết lộ flag/hash. Xem [giới hạn bcrypt.js](https://github.com/dcodeIO/bcrypt.js#security-considerations).

Rate limit là 5 lần/15 phút/IP trên toàn bộ các slug và 30 lần/phút cho mỗi process, dùng bộ nhớ với số bucket giới hạn. Việc đổi slug không cấp thêm lượt thử cho cùng IP. Chỉ tin địa chỉ IP trong `x-vercel-forwarded-for` khi runtime có `VERCEL=1`; ngoài Vercel dùng bucket ẩn danh chung thay vì tin header client tự khai báo. Xem [Vercel request headers](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for). Không tự đặt `VERCEL=1` trên self-host.

Bộ đếm không chia sẻ giữa serverless instance và reset khi restart; nó không chống botnet hoặc DoS ở cấp mạng. Cần rate limiter chia sẻ/edge firewall khi nâng quy mô. Người dùng chung IP hoặc bucket ẩn danh có thể ảnh hưởng lượt thử của nhau.

## Tool input và hiểu nhầm JWT

Encoder/JWT chỉ dùng state trong browser, không gửi input tới API hoặc ghi vào URL/localStorage. Clipboard chỉ được ghi khi người dùng bấm sao chép. JWT parser yêu cầu ba phần Base64URL, JSON object và kiểm tra NumericDate; luôn ghi rõ decoded chưa verified. JWT input không tham gia cấp quyền cho write-up.

Tests gồm Unicode/BOM/UTF-8 lỗi, token sai cấu trúc/padding, claims hết hạn và chữ ký trống. Browser extension độc hại hoặc thiết bị đã bị kiểm soát nằm ngoài phạm vi ứng dụng.

## Kiểm chứng

Chạy lint, typecheck, unit/security tests, production build và smoke tests trong README. Build kiểm tra cả metadata của draft; tests phải có nhiều bài, draft, slug/tên biến trùng và quyền chéo giữa các bài để tránh quay lại logic hardcode.

Kiểm tra thật trên deployment cần xác nhận HTTPS, cookie, cache, biến môi trường và nội dung khóa không xuất hiện trong HTML/RSC của người chưa được cấp quyền. Chưa ghi nhận một URL production đã xác minh trong repository; chủ deployment vẫn quản lý quyền GitHub/Vercel, secret rotation, dependency và log nền tảng.
