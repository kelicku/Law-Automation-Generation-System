import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Noto_Sans_JP, Noto_Serif_JP } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const sans = Noto_Sans_JP({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-sans", display: "swap", preload: false });
const serif = Noto_Serif_JP({ weight: ["600"], subsets: ["latin"], variable: "--font-serif", display: "swap", preload: false });
const num = Inter({ subsets: ["latin"], variable: "--font-num", display: "swap" });
const mono = IBM_Plex_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "AI Incident Intelligence", template: "%s | AI Incident Intelligence" },
  description: "散在する公開情報をAIが整理し、法律事務所の情報発信を、より確かに、より効率的に。事件情報の発見から、公開の判断まで。",
  applicationName: "AI Incident Intelligence",
};

export const viewport: Viewport = { themeColor: "#101C30", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${sans.variable} ${serif.variable} ${num.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans">
        {children}
        <Toaster position="bottom-left" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
      </body>
    </html>
  );
}
