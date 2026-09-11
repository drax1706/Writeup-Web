import { parseArgs } from "node:util";
import { createWriteup } from "./writeup-cli.mjs";

try {
  const { values } = parseArgs({
    options: {
      slug: { type: "string" },
      title: { type: "string" },
      access: { type: "string", default: "public" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      'npm run writeup:new -- --slug my-writeup --title "Tên bài" [--access public|locked]',
    );
  } else {
    const result = await createWriteup(values);
    console.log(`Đã tạo bản nháp: ${result.filePath}`);
    console.log(
      "Chỉnh nội dung/metadata, sau đó đổi draft thành false để xuất bản.",
    );
    if (result.access === "locked")
      console.log(`Cấp flag: npm run writeup:flag -- --slug ${result.slug}`);
  }
} catch (error) {
  console.error(`Không tạo được bài: ${error.message}`);
  process.exitCode = 1;
}
