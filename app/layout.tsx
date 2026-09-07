import type { Metadata } from "next";
import "./globals.css";

import { Nav } from "@/components/nav";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "UCL Edge VN — trợ lý dữ liệu cho UEFA Champions League Fantasy",
  description:
    "Điểm kỳ vọng, số phút kỳ vọng, phân phối điểm và bộ tối ưu đội hình cho UEFA Champions League Fantasy. Sản phẩm độc lập của người hâm mộ.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <Providers>
          <Nav />
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-xs text-muted-foreground">
            <p>
              Sản phẩm độc lập của người hâm mộ, không liên kết với UEFA hay UEFA
              Champions League Fantasy. Dữ liệu lấy từ feed công khai của
              gaming.uefa.com. Mọi con số là <strong>dự báo có sai số</strong>, không
              phải lời khẳng định.
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
