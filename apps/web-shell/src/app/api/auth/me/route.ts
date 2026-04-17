import { NextResponse, type NextRequest } from 'next/server'
import { parseToken } from '@future/auth'
import { SESSION_COOKIE_NAME } from '../../../../lib/auth-config'

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const claims = parseToken(token)
  if (!claims) return NextResponse.json({ error: 'Invalid session token' }, { status: 401 })
  return NextResponse.json({
    actorId: claims.actorId,
    tenantId: claims.tenantId,
    tenantName: claims.tenantName,
    roles: claims.roles,
    displayName: claims.displayName,
    email: claims.email ?? '',
    provider: claims.provider,
  })
}
