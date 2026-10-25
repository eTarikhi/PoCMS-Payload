import {
  BlocksFeature,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  HeadingFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { CalloutBlock } from '@/blocks/Callout'
import { CodeBlock } from '@/blocks/Code'
import { MediaBlock } from '@/blocks/MediaBlock'

/**
 * Rich-text Lexical editor shared by `Articles` and `Projects`:
 * - H2, H3, and H4 headings (drives the Table of Contents; H1 stays reserved for the page title),
 * - fixed + inline formatting toolbars, lists, checklists, blockquotes, links, rules, and tables,
 * - custom `Code`, `Callout`, and `Media` blocks.
 */
export const contentLexicalEditor = lexicalEditor({
  features: ({ defaultFeatures }) => [
    ...defaultFeatures.filter((feature) => feature.key !== 'heading'),
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
    FixedToolbarFeature(),
    EXPERIMENTAL_TableFeature(),
    BlocksFeature({
      blocks: [CodeBlock, CalloutBlock, MediaBlock],
    }),
  ],
})
