import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  // No basePath — subdomain routing (goals.seta-international.com)
}

export default config
