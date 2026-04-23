import { Sun } from '@future/ui/icons'

export function MyDayEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Sun className="size-10 text-muted-foreground" aria-hidden />
      <h3 className="text-lg font-medium">Nothing scheduled for today</h3>
      <p className="max-w-md text-sm text-muted-foreground">
        Click <span className="font-medium">Focus today</span> on any task to add it here.
      </p>
    </div>
  )
}
