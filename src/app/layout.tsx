import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Essay Structurer",
  description: "3-minute voice brief → outline-only guidance",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning={true}>{children}</body>
    </html>
  );
}
