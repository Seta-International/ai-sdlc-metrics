export default function SharedProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-[#08090a] text-[#f7f8f8]">{children}</body>
    </html>
  )
}
