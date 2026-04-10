import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@future/ui', '@future/auth', '@future/api-client'],
  // No basePath — subdomain routing (agents.seta-international.com)
}

export default config
