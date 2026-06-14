import type { Metadata, Viewport } from "next";
import { Inter, Outfit, Noto_Sans_Tamil, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// App-shell fonts, self-hosted via next/font (preloaded, non-render-blocking).
// Replaces the old render-blocking Google Fonts @import. Exposed as CSS variables
// that tailwind.config.ts + globals.css reference.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], display: "swap", variable: "--font-outfit" });
const notoTamil = Noto_Sans_Tamil({ subsets: ["tamil", "latin"], display: "swap", variable: "--font-noto-tamil" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Saalai Kural — Gamified Road Damage Reporting",
  description: "Tamil Nadu State and District portal for gamified civilian road reporting, work allocation, AI classification, and rewards.",
  manifest: "/manifest.json",
};

// Mobile-first viewport: scale to the device width so phones don't render the
// desktop layout zoomed out. (themeColor belongs here in Next 14, not metadata.)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0F6A3D",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`light ${inter.variable} ${outfit.variable} ${notoTamil.variable} ${jetbrains.variable}`}>
      <body className="bg-bg-light dark:bg-bg-dark text-slate-800 dark:text-slate-100 min-h-screen transition-colors duration-200">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(reg) {
                      console.log('Service Worker registered successfully:', reg.scope);
                    },
                    function(err) {
                      console.log('Service Worker registration failed:', err);
                    }
                  );
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
