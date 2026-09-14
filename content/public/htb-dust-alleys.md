---
title: "Dust Alleys"
slug: "htb-dust-alleys"
platform: "Hack The Box"
difficulty: "Medium"
vulnerabilities: ["Access Control","Nginx Configuration"]
publishedAt: "2026-09-14"
summary: "Ghi lại các lần thử HTTP Host và quá trình tìm hiểu định tuyến Nginx trong Dust Alleys."
draft: false
sortOrder: 17
---
## Overview
It's is an web app has two main routes **/think** **/guardian** with routes **/think** respone to request header and **/guardian** to take flag
## Vulnerability and Exploiting
![image](https://hackmd.io/_uploads/rJyTYdrobl.png)
in this code we can see that server fetch url of user but only hostname là localhost or end with localhost will have header flag.

![image](https://hackmd.io/_uploads/B1i0c_SsWl.png)
we test to go to **/think** and we have respone like this.
and **/guardian**
![image](https://hackmd.io/_uploads/BkCendSiWg.png)
we can explain this by default.conf

![image](https://hackmd.io/_uploads/rJG6sdHibx.png)
Our Host is Host: 154.57.164.72:31512 so it's not sastify alley./secret/ or guardian/secret/. Mà default_server not has **/guardian**  so it become 404.
But if we want to go **/guardian** we need $secret_alley
from conf file we can think that if we can go default_server with no host we can use route **/think** to see secret_alley
we take some test and find out that when we remove Host header or Host blank it's will fall 400 error. After searching, we know that **HTTP/1.0** can send request with no Host header. so we have nice result
![image](https://hackmd.io/_uploads/HyXUAOSoWx.png)
with that so now we can go to route **/guardian** with host header guardian.firstalleyontheleft.com 
![image](https://hackmd.io/_uploads/H1nNktHoWg.png)
and get flag header: HTB{DUsT_1n_my_3y3s_l33t}