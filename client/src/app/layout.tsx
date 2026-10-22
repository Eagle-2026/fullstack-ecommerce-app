import type { Metadata } from "next";
import type { ReactNode } from "react";

import Providers from "./providers";
import StoreHeader from "@/components/StoreHeader";

import "./globals.css";

export const metadata: Metadata = {
  title: "E-Commerce Store",
  description: "Browse our products and discover great deals.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <Providers>
          <StoreHeader />

          {children}
        </Providers>
      </body>
    </html>
  );
}
