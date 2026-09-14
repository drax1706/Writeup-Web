---
title: "Building Blocks Market"
slug: "umassctf-2026-building-blocks-market"
platform: "UMassCTF 2026"
difficulty: "Medium"
vulnerabilities: ["Web Cache Poisoning"]
publishedAt: "2026-09-14"
summary: "Ghi chú ban đầu về quy trình gửi listing và duyệt sản phẩm trong Building Blocks Market."
draft: false
sortOrder: 11
---
tạo listring rồi submit url cho bot admin
=> leak csrf admin qua cache poisoning
=>từ cái csrf này thì approve submmision của mình
=>approval làm product thành public rồi lấy flag
flag: **UMASS{d0nt_m3ss_w1th_nG1nx_4nd_chr0m1uM}**