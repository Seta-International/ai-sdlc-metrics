export type ResolveNextUrlInput = {
  returnTo?: string | null
  lastApp?: string | null
}

const KNOWN_APPS = new Set(['studio', 'finance', 'pmo', 'timesheet'])

export function resolveNextUrl(input: ResolveNextUrlInput): string {
  const { returnTo, lastApp } = input
  if (returnTo?.startsWith('/') && !returnTo.startsWith('//')) {
    return returnTo
  }
  if (lastApp && KNOWN_APPS.has(lastApp)) {
    return `/${lastApp}/`
  }
  return '/console/'
}
