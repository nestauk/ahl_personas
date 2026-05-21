import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Food Policy Impact Tool",
  description:
    "AI-powered tool for stress-testing food environment policies against the experiences of underrepresented population sub-groups",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
