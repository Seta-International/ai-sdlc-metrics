import { NextResponse } from 'next/server'

// TODO: validate MSAL session cookie and return actor context
export async function GET() {
  return NextResponse.json(
    { error: 'Not implemented — MSAL session not yet wired' },
    { status: 501 },
  )
}
