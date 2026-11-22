import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1c1917',
};

export const metadata: Metadata = {
  title: 'Hard R Cycles: Flat Rate Panic',
  description:
    '2.5D cel-shaded arcade motorcycle workshop game. Race the flat-rate clock, survive cross-threaded bolts, mystery wiring harnesses, runaway 10mm sockets, and chatty shop buddies.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
