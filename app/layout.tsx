import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'My Hand History',
  description:
    'Upload a poker hand history, replay it visually, and see where hero deviated from GTO.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
