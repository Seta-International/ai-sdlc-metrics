import { redirect } from 'next/navigation'

// Placeholder landing for /personal/today until Plan 3.4 ships the My Day views.
export default function MyDayPlaceholderPage() {
  redirect('/personal/plans')
}
