import type { MetadataRoute } from 'next'

import { buildRobotsRules } from '@/app/(frontend)/lib/feeds'

export default function robots(): MetadataRoute.Robots {
  return buildRobotsRules()
}
