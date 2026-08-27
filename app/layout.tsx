import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: '智选 Agent｜3C 数码电商智能导购',
  description: '基于合成电商数据、RAG 与推荐排序的中文智能导购作品集。',
  openGraph: {
    title: '智选 Agent｜3C 数码电商智能导购',
    description: '可运行、可复现的中文 AI 产品作品集：合成数据、RAG、推荐排序与离线实验。',
    locale: 'zh_CN',
    type: 'website',
    images: [{ url: '/social-card.png', width: 1536, height: 1024, alt: '智选 Agent 项目封面' }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
