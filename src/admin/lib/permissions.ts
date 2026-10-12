import type { SanitizedPermissions } from 'payload'

/** Whether the given user may read a collection (admin visibility checks). */
export function canReadCollection(
  permissions: SanitizedPermissions | undefined,
  collection: string,
): boolean {
  return Boolean(permissions?.collections?.[collection]?.read)
}

/** Whether the given user may read a global. */
export function canReadGlobal(permissions: SanitizedPermissions | undefined, global_: string): boolean {
  return Boolean(permissions?.globals?.[global_]?.read)
}
