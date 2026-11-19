/** Keep the requested depth when possible; otherwise fall back without selecting an invalid query. */
export function defaultSelectableDepth(
  selectableDepths: readonly number[],
  requestedDepth: number,
): number | undefined {
  if (selectableDepths.length === 0) return undefined

  let fallback: number | undefined
  for (const depth of selectableDepths) {
    if (depth > requestedDepth) break
    fallback = depth
  }

  return fallback ?? selectableDepths[0]
}
