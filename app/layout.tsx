import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anti AI Games",
  description: "بازی‌هایی برای مغزی که هنوز خودش فکر می‌کند"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#080b17"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fa" dir="rtl"><head><script src="https://telegram.org/js/telegram-web-app.js" /></head><body>{children}</body></html>;
}
