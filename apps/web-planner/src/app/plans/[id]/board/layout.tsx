interface Props {
  children: React.ReactNode
  panel: React.ReactNode
}

export default function BoardLayout({ children, panel }: Props) {
  return (
    <div className="relative flex h-full w-full">
      {children}
      {panel && (
        <div className="fixed inset-y-0 right-0 w-120 z-30 shadow-2xl bg-surface">{panel}</div>
      )}
    </div>
  )
}
