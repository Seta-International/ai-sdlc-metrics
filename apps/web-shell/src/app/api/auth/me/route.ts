import { NextResponse, type NextRequest } from 'next/server'
import { parseToken } from '@future/auth'
import { SESSION_COOKIE_NAME } from '../../../../lib/auth-config'

/**
 * GET /api/auth/me — returns session claims from the JWT cookie.
 *
 * The JWT is signed by the API server. This endpoint decodes the payload
 * for the frontend to render user context. The API server re-verifies
 * the signature on every tRPC call via authMiddleware.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value

  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const claims = parseToken(token)
  if (!claims) {
    return NextResponse.json({ error: 'Invalid session token' }, { status: 401 })
  }

  return NextResponse.json({
    actorId: claims.actorId,
    tenantId: claims.tenantId,
    roles: claims.roles,
    displayName: claims.displayName,
    email: claims.email ?? '',
    provider: claims.provider,
  })
}
