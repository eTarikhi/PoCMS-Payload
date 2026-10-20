// Any setup scripts you might need go here

// Load .env files
import 'dotenv/config'
import { TextDecoder, TextEncoder } from 'node:util'

// jsdom installs its own TextEncoder, whose Uint8Array comes from another realm: `value instanceof
// Uint8Array` is false for it, and jose (Payload's JWT signer) rejects the secret when a test calls
// payload.login(). Node's implementation returns the same Uint8Array the rest of the process sees.
globalThis.TextEncoder = TextEncoder as unknown as typeof globalThis.TextEncoder
globalThis.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder
