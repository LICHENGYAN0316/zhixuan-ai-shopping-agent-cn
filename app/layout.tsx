import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: '智选 Agent｜日化智能选品',
  description: '用豆包解析中文需求，从离线日化历史数据中进行敏感肌、成分避雷与功效推荐。',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: '智选 Agent｜日化智能选品',
    description: '从需求解析、离线检索到官方证据约束的中文 AI 产品作品集。',
    locale: 'zh_CN',
    type: 'website',
    images: [{ url: '/social-card.png', width: 1440, height: 900, alt: '智选 Agent：离线日化历史数据与核实属性推荐' }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
