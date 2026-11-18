import { withPayloadAdminPanelAuthorization } from '@/auth/requireAdminPanelAuthorization'

import config from '@payload-config'
import '@payloadcms/next/css'
import { GRAPHQL_PLAYGROUND_GET } from '@payloadcms/next/routes'

export const GET = withPayloadAdminPanelAuthorization(config, GRAPHQL_PLAYGROUND_GET(config))
