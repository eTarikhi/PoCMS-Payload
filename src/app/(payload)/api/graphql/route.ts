import { withPayloadAdminPanelAuthorization } from '@/auth/requireAdminPanelAuthorization'

import config from '@payload-config'
import { GRAPHQL_POST, REST_OPTIONS } from '@payloadcms/next/routes'

export const POST = withPayloadAdminPanelAuthorization(config, GRAPHQL_POST(config))

// Keep Payload's CORS preflight behavior unchanged; it does not execute GraphQL operations.
export const OPTIONS = REST_OPTIONS(config)
