import { parseArgs } from "node:util";
import {
  configureWriteupFlag,
  readFlagFromStdin,
  readHiddenFlag,
} from "./writeup-cli.mjs";
import { isSafeWriteupSlug } from "../lib/writeup-policy.mjs";

try {
  const { values } = parseArgs({
    options: {
      slug: { type: "string" },
      generate: { type: "boolean" },
      stdin: { type: "boolean" },
      replace: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "npm run writeup:flag -- --slug my-writeup [--generate | --stdin] [--replace]",
    );
    console.log(
      "Mặc định nhập flag ẩn trong terminal. --replace dành cho việc chủ động đổi flag đã cấu hình.",
    );
  } else {
    if (!isSafeWriteupSlug(values.slug))
      throw new Error("Cần --slug hợp lệ trước khi nhập flag.");
    if (values.generate && values.stdin)
      throw new Error("Chỉ chọn --generate hoặc --stdin.");
    const flag = values.generate
      ? undefined
      : values.stdin
        ? await readFlagFromStdin()
        : await readHiddenFlag();
    const result = await configureWriteupFlag({
      slug: values.slug,
      flag,
      generate: values.generate,
      replace: values.replace,
    });
    console.log(
      `Đã lưu bcrypt hash vào ${result.flagHashEnv} trong .env.local.`,
    );
    if (result.generatedFlag)
      console.log(
        `Flag ngẫu nhiên (chỉ hiện lần này): ${result.generatedFlag}`,
      );
    console.log(
      "Khởi động lại Next.js để nhận cấu hình; SESSION_SECRET hiện có được giữ nguyên.",
    );
  }
} catch (error) {
  console.error(`Không cấu hình được flag: ${error.message}`);
  process.exitCode = 1;
}
