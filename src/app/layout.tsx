import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MonitoringProvider } from "@/components/monitoring-provider";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
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
  title: "AI脑暴 - 引导式AI创意讨论",
  description:
    "通过AI主持人引导、多位虚拟专家参与的结构化对话，帮助用户高效进行创意讨论，并自动整理为会议纪要和专业文档。",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale === "en" ? "en" : "zh-CN"}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-gray-50">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <MonitoringProvider>{children}</MonitoringProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
