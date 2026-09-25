import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '求职工作台 · Career Desk', description:'个人岗位研究与简历定制工作台' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="zh-CN"><body>{children}</body></html> }
