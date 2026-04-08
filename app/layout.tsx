import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/AuthProvider";
import AppFrame from "@/components/AppFrame";
import { Geist, Geist_Mono } from "next/font/google";
import { MermasStoreProvider } from "@/components/MermasStoreProvider";
import PwaRegister from "@/components/PwaRegister";
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
  metadataBase: new URL("http://localhost:3000"),
  title: "Xampa One",
  description: "Gestión operativa para restaurantes",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo-xampa-one.svg",
    apple: "/logo-xampa-one.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Xampa One",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "Xampa One",
    description: "Gestión operativa para restaurantes",
    images: ["/logo-xampa-one.svg"],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
        <PwaRegister />
        <AuthProvider>
          <MermasStoreProvider>
            <AppFrame>{children}</AppFrame>
          </MermasStoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
