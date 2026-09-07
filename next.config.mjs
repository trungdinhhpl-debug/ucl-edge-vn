/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cả 8 trang đều render phía trình duyệt và chỉ đọc JSON tĩnh trong public/data —
  // không có API route, middleware hay server action nào. Xuất bản tĩnh hoàn toàn nên
  // không sinh serverless function, nhờ đó build được cả trên Windows (bước tạo
  // function cần symlink, mà Windows chặn nếu không bật Developer Mode).
  output: "export",
  images: { unoptimized: true },
};
export default nextConfig;
