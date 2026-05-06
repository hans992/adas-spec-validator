import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ADAS Spec Validator",
  description: "Deterministic validation for CAD/BIM model requirements"
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
