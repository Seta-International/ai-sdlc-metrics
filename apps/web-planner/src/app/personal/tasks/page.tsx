import { redirect } from 'next/navigation'

// Placeholder landing for /personal/tasks until Plan 3.3 ships the
// board/grid/schedule/charts routes. The sidebar link targets
// /personal/tasks/board; users reaching /personal/tasks fall through here.
export default function MyTasksPlaceholderPage() {
  redirect('/personal/plans')
}
