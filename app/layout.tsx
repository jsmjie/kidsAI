import type { Metadata } from "next";
import "streamdown/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kids AI",
  description: "A child-safe thinking chatbot with guardrails and guided reasoning."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
