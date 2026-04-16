import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  transpilePackages: [
    '@future/ui',
    '@future/auth',
    '@future/api-client',
    '@future/agent',
    '@future/app-layout',
  ],
  // No basePath — subdomain routing (projects.seta-international.com)
}

export default config
