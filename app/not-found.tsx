import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container not-found">
      <p className="eyebrow">404</p>
      <h1>Không tìm thấy trang</h1>
      <p>Đường dẫn không tồn tại hoặc write-up chưa được xuất bản.</p>
      <Link className="button button-primary" href="/writeups">
        Xem write-ups
      </Link>
    </div>
  );
}
