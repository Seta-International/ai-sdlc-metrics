import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  // No basePath — subdomain routing (admin.seta-international.com)
}

export default config
