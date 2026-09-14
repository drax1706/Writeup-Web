---
title: "Bad Apple"
slug: "tamuctf-2026-bad-apple"
platform: "TAMUCTF 2026"
difficulty: "Medium"
vulnerabilities: ["Access Control"]
publishedAt: "2026-09-14"
summary: "Phân tích quyền truy cập file và chức năng chuyển GIF thành frame trong Bad Apple."
draft: false
sortOrder: 15
---
## Overview 
It's an web app Flask that receive upload file from user and use ffmpeg to convert GIF to frame PNG and **/browse** folder to show file uploaded in web
## Vulnerability and Exploiting
After reviewing source code, and **/browse** we have some information.
![image](https://hackmd.io/_uploads/H1r6SNHsZe.png)
![image](https://hackmd.io/_uploads/ByBCBErsWl.png)
we can easily get access to **/browse/admin** to see flag name but we can't see this because of Basic Authentication.
So now, instead of try to login, we find in source code where app use this file in server.
![image](https://hackmd.io/_uploads/r13IcVHjbx.png)

we can find a remarkable point in **/convert**. App use direct user_id and filename from query string to path
 => /uploads/user_id/filename
and this path can help us to access flag file because app don't check rights. Forexmaple, in **/upload**
![image](https://hackmd.io/_uploads/HJRquNSs-g.png)
it's use cookie and user can't set user_id
With flag name:**e017b6321bda6812ec80e9fac368709e-flag.gif**
We can create **/convert?user_id=admin&filename=e017b6321bda6812ec80e9fac368709e-flag.gif** (from **/convert** code we see b4)
![image](https://hackmd.io/_uploads/Hy2bGBSjZe.png)
we are redirect (302) so we are succesful in convert! ![image](https://hackmd.io/_uploads/HJBGfBSsZx.png)
![image](https://hackmd.io/_uploads/ryG17HBoZx.png)
So after we convert how to see the gif because we can see that if we play we can't see anything.
Let's move to route / 
![image](https://hackmd.io/_uploads/rymrVSBs-g.png)
-> view = gif converted and view_user_id = user has this frames
so https://bad-apple.tamuctf.com/?view=e017b6321bda6812ec80e9fac368709e-flag&user_id=admin after redirect is false we need to change to https://bad-apple.tamuctf.com/?view=e017b6321bda6812ec80e9fac368709e-flag&view_user_id=admin
![image](https://hackmd.io/_uploads/S1_nNrBsZg.png)
we cann see gif run and has final flag : **gigem{3z_t0h0u_fl4g_r1t3}**