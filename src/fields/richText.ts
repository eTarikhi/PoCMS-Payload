import {
  BlocksFeature,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  HeadingFeature,
  lexicalEditor,
  LinkFeature,
} from '@payloadcms/richtext-lexical'

import { resolveInternalLinkDocHref } from '@/app/(frontend)/lib/lexical'
import { CalloutBlock } from '@/blocks/Callout'
import { CodeBlock } from '@/blocks/Code'
import { CodeTabsBlock } from '@/blocks/CodeTabs'
import { DiagramBlock } from '@/blocks/Diagram'
import { MediaBlock } from '@/blocks/MediaBlock'
import { MetricsBlock } from '@/blocks/Metrics'

export { resolveInternalLinkDocHref }

/**
 * Rich-text Lexical editor shared by `Articles` and `Projects`:
 * - H2, H3, and H4 headings (drives the Table of Contents; H1 stays reserved for the page title),
 * - Internal relationship links (`articles` & `projects`) tracked by document ID with `maxDepth: 2`,
 * - Fixed + inline formatting toolbars, lists, checklists, blockquotes, rules, and tables,
 * - Engineering case-study blocks: `Code` (Shiki), `CodeTabs` (multi-file & diff), `Callout`,
 *   `Media`, `Metrics` (KPI impact cards), and `Diagram` (Mermaid SVG & Blueprint).
 */
export const contentLexicalEditor = lexicalEditor({
  features: ({ defaultFeatures }) => [
    ...defaultFeatures.filter(
      (feature) => feature.key !== 'heading' && feature.key !== 'link',
    ),
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
    LinkFeature({
      enabledCollections: ['articles', 'projects'],
      maxDepth: 2,
      internalDocToHref: ({ linkNode }) =>
        resolveInternalLinkDocHref(
          linkNode.fields?.doc as { relationTo?: string; value?: unknown } | undefined,
        ),
    }),
    FixedToolbarFeature(),
    EXPERIMENTAL_TableFeature(),
    BlocksFeature({
      blocks: [
        CodeBlock,
        CodeTabsBlock,
        CalloutBlock,
        MediaBlock,
        MetricsBlock,
        DiagramBlock,
      ],
    }),
  ],
})
