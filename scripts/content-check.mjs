import { checkContent } from "./check-content.mjs";

try {
  const result = await checkContent();
  console.log(
    `Nội dung hợp lệ: ${result.published} bài xuất bản (${result.locked} bài khóa), ${result.drafts} bản nháp. Metadata và ảnh local đã kiểm tra.`,
  );
} catch (error) {
  console.error(`Kiểm tra nội dung thất bại:\n${error.message}`);
  process.exitCode = 1;
}
