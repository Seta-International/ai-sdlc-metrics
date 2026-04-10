import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  // No basePath — subdomain routing (people.seta-international.com)
}

export default config
