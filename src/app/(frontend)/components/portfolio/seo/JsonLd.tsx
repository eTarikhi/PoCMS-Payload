// Ported from the ld+json script in vTarikhi/components/head.jsx. The data comes from buildPersonJsonLd().

export type JsonLdProps = {
  data: Record<string, unknown>
}

export function JsonLd({ data }: JsonLdProps) {
  // "<" is escaped, so no value can close the script element early.
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
