import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const jakarta = localFont({
  src: "./fonts/PlusJakartaSans.woff2",
  weight: "200 800",
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NoTaxLost CRM",
  description: "CRM de venta de entradas con QR por establecimiento",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <div className="fixed inset-x-0 top-0 z-[999] h-[3px] bg-gradient-to-r from-brand-blue to-brand-green" />
        {children}
      </body>
    </html>
  );
}
