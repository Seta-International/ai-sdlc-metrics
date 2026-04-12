import { type NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '../../../lib/auth-config'

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/auth/login', request.url))
  response.cookies.delete(SESSION_COOKIE_NAME)
  return response
}

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(SESSION_COOKIE_NAME)
  return response
}
