import type { Metadata } from "next";
import "./globals.css";

import ThemeToggle from "@/components/ui/ThemeToggle";

export const metadata: Metadata = {
  title: "InlineExplainer",
  description: "Understand any codebase, inline.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}