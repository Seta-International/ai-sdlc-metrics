export default function SharedProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-canvas text-fg-primary">{children}</body>
    </html>
  )
}
