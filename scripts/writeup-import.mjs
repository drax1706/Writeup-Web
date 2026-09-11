import { parseArgs } from "node:util";
import { importWriteup } from "./import-writeup.mjs";

try {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      slug: { type: "string" },
      title: { type: "string" },
      access: { type: "string", default: "public" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      'npm run writeup:import -- --file "C:/path/export.md" --slug my-writeup [--title "Tên bài"] [--access public|locked]',
    );
    console.log(
      "Nhập Markdown và ảnh local thành bản nháp. Không ghi đè bài cũ, không tải ảnh mạng.",
    );
  } else {
    const result = await importWriteup(values);
    console.log(`Đã nhập bản nháp: ${result.filePath}`);
    console.log(
      `Đã chép ${result.imagesCopied} ảnh. Sửa metadata, đổi draft thành false và chạy npm run content:check.`,
    );
    if (result.access === "locked")
      console.log(`Cấp flag: npm run writeup:flag -- --slug ${result.slug}`);
  }
} catch (error) {
  console.error(`Không import được bài: ${error.message}`);
  process.exitCode = 1;
}
