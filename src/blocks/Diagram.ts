import type { Block } from 'payload'

export const DiagramBlock: Block = {
  slug: 'diagram',
  interfaceName: 'DiagramBlockFields',
  labels: {
    singular: 'Architecture / Mermaid Diagram',
    plural: 'Architecture / Mermaid Diagrams',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'title',
          type: 'text',
          label: 'Diagram Title (optional)',
          admin: {
            width: '65%',
            placeholder: 'Request & Cache Revalidation Topology',
          },
        },
        {
          name: 'engine',
          type: 'select',
          required: true,
          defaultValue: 'mermaid',
          options: [
            { label: 'Mermaid Flowchart / Sequence (SVG)', value: 'mermaid' },
            { label: 'Monospace Architecture Blueprint', value: 'ascii' },
          ],
          admin: { width: '35%' },
        },
      ],
    },
    {
      name: 'code',
      type: 'code',
      required: true,
      admin: {
        language: 'markdown',
        description:
          'Supports Mermaid flowchart (`flowchart LR` / `graph TD`, `A[Client] -->|HTTPS| B(Edge)`) and `sequenceDiagram` (`Client->>API: POST /webhook`), or ASCII blueprints.',
      },
    },
    {
      name: 'caption',
      type: 'text',
      label: 'Caption (optional)',
    },
  ],
}
