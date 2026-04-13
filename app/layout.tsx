import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/AuthProvider";
import AppFrame from "@/components/AppFrame";
import { Geist_Mono, Lora } from "next/font/google";
import { MermasStoreProvider } from "@/components/MermasStoreProvider";
import { PedidosOrdersProvider } from "@/components/PedidosOrdersProvider";
import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

const appSerif = Lora({
  variable: "--font-app-serif",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** OG / enlaces absolutos: en Vercel pon `NEXT_PUBLIC_SITE_URL=https://chef-one.com` (Producción). */
function metadataBaseUrl(): URL {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    try {
      return new URL(site);
    } catch {
      /* ignore */
    }
  }
  if (process.env.VERCEL_URL) {
    return new URL(`https://${process.env.VERCEL_URL}`);
  }
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: metadataBaseUrl(),
  title: "Chef-One",
  description: "Gestión operativa para restaurantes",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo-chef-one.svg",
    apple: "/logo-chef-one.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Chef-One",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "Chef-One",
    description: "Gestión operativa para restaurantes",
    images: ["/logo-chef-one.svg"],
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
      className={`${appSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        <AuthProvider>
          <MermasStoreProvider>
            <PedidosOrdersProvider>
              <AppFrame>{children}</AppFrame>
            </PedidosOrdersProvider>
          </MermasStoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
