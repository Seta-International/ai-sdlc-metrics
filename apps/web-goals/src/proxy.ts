import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE_NAME = '_future_session'
const SHELL_URL = process.env['NEXT_PUBLIC_SHELL_URL'] ?? 'http://localhost:3000'

export function proxy(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)
  if (!sessionCookie?.value) {
    const loginUrl = new URL(`${SHELL_URL}/auth/login`)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
}

export const config = {
  // Skip /api/auth/* so endpoints like /api/auth/me can return 401 JSON to
  // SessionUserMenu instead of being redirected to the login page.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
}
