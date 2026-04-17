import { handleAuthMe } from '@future/auth'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  return handleAuthMe(request)
}
