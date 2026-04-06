import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
import BottomNav from "@/components/BottomNav";
import { MermasStoreProvider } from "@/components/MermasStoreProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mermas App",
  description: "Gestión de mermas para hostelería",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MermasStoreProvider>
          <div className="flex-1 pb-24">
            <AppShell>{children}</AppShell>
          </div>
          <BottomNav />
        </MermasStoreProvider>
      </body>
    </html>
  );
}
