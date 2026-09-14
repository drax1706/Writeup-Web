---
title: "NextPath"
slug: "htb-nextpath"
platform: "Hack The Box"
difficulty: "Medium"
vulnerabilities: ["Path Traversal","Type Confusion"]
publishedAt: "2026-09-14"
summary: "Phân tích quá trình vượt các lớp kiểm tra đầu vào và truy cập file trong challenge NextPath."
draft: false
sortOrder: 14
---
## Overview
It's an basic app with only route **/**.User can see home page like this with some description and introduction to their team
![image](https://hackmd.io/_uploads/rk3H2EYiWx.png)
## Vulnerability and Exploiting
Using Burp Proxy, we can see some request
![image](https://hackmd.io/_uploads/HkXbaEYiWx.png)
So, Beside request to **/** we can see end point **/api/team** to loading image. We back to source code to see how this app handle this because it's only way rightnow.
![image](https://hackmd.io/_uploads/S1E_bBYjZg.png)
We can easily see in that code, **id** is input of user because of it take directly from request HTTP. And if query not have **id** app will respone 400.
So let move to how app handle input from user.
![Screenshot 2026-03-31 195736](https://hackmd.io/_uploads/r18jSrYoZe.png)
Base on this code we can see that **id** only allow number characters **(0-9)** and has at least one character. NOTICE, it has flag m => multiline. 
Go to part 2 it's check **id** validate this format.
Mà Regex is only need match one line so we can bypass.
![image](https://hackmd.io/_uploads/Sy482rFoWg.png)
From this respone, we can confirm that we can go through check because string "a" appeared.
Now, some people think that encode "/" to path traversal but framework will decode be4 app test. ( I also take many test on this)
So we need another way to bypass prevent path traversal in part 3 i noted.
#### in part 2, code app use
```python=
if (!ID_REGEX.test(query.id))
```
RegExp.test() neeed string to test so it's engine will automatic cast input to string.
#### And we know that, Query Parameter not always string. it can be string, array, object....
#### And esspecially,in part 3, code app use
```python=
if (query.id.includes("/") || query.id.includes(".."))
```
if we can input an array, JS handle like that array.include("/") so it don't check substring anymore.
Combine with three points, We can make a hypothesis
send two **id**
![image](https://hackmd.io/_uploads/B10KmLtoZe.png)
Perfectly it works, explain for this first **id** bypass check regex(code 2) secode **id** bypass check include "/" because now query.id is array.
But u cann see in respone it want to read .png .Because 
i noted in part 4 
```python=
    const filepath = path.join("team", query.id + ".png");
    const content = fs.readFileSync(filepath.slice(0, 100));
```
but it slide to 100 character so we can think that make payload to longer to it auto slice .png for us.
So we need make longer path but we need it point to right /flag.txt . flag.txt is 8 characters so if we take many time ../ ( 3 characters) it cannot be 100 (because 92 not devisible by 3). 
After searching, prompting; i found some loop in path of Linux like /proc/self/root, but it has 15 characters (devisible by 3 ), /proc/1/root also 12 has the same problems.
Finaly i tested with /proc/10/root( 13 characters mod 3 1
(Beside that i found something can be use like proc/self/task/1/root/, proc/1/task/1/root/.  these more better i think that)
![a](https://hackmd.io/_uploads/ry3D1dKjbg.png)

FLAG: HTB{tr4v3r51ng_p45t_411_th3_ch3ck5...t4sk_w3ll_d0ne!}