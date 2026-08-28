import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: '智选 Agent｜3C 数码电商智能导购',
  description: '把预算、用途与取舍变成有依据的中文 3C 推荐决策；公开版使用合成数据。',
  openGraph: {
    title: '智选 Agent｜3C 数码电商智能导购',
    description: '从需求澄清、候选检索到可解释对比的中文 AI 产品作品集；公开版使用合成数据。',
    locale: 'zh_CN',
    type: 'website',
    images: [{ url: '/social-card.png', width: 1440, height: 900, alt: '智选 Agent：把复杂参数变成适合你的选择' }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
