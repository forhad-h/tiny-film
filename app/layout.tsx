import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Micro-film Maker",
  description: "Generate films with AI",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
