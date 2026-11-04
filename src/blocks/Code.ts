import type { Block } from 'payload'

export const CODE_LANGUAGE_OPTIONS = [
  { label: 'TypeScript', value: 'typescript' },
  { label: 'TSX', value: 'tsx' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'JSX', value: 'jsx' },
  { label: 'PHP', value: 'php' },
  { label: 'SQL', value: 'sql' },
  { label: 'Bash / Shell', value: 'bash' },
  { label: 'JSON', value: 'json' },
  { label: 'YAML', value: 'yaml' },
  { label: 'HTML', value: 'markup' },
  { label: 'CSS', value: 'css' },
  { label: 'Python', value: 'python' },
  { label: 'Go', value: 'go' },
  { label: 'Rust', value: 'rust' },
  { label: 'Dockerfile', value: 'docker' },
  { label: 'Unified Diff', value: 'diff' },
  { label: 'Plain Text', value: 'plain' },
] as const

export const CodeBlock: Block = {
  slug: 'code',
  interfaceName: 'CodeBlockFields',
  labels: {
    singular: 'Code',
    plural: 'Code Blocks',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'language',
          type: 'select',
          required: true,
          defaultValue: 'typescript',
          options: [...CODE_LANGUAGE_OPTIONS],
          admin: { width: '34%' },
        },
        {
          name: 'filename',
          type: 'text',
          label: 'Filename (optional)',
          admin: {
            width: '38%',
            placeholder: 'src/payload.config.ts',
          },
        },
        {
          name: 'highlightLines',
          type: 'text',
          label: 'Highlight Lines (optional)',
          admin: {
            width: '28%',
            placeholder: '1, 4-6',
          },
        },
      ],
    },
    {
      name: 'code',
      type: 'code',
      required: true,
      admin: {
        language: 'typescript',
      },
    },
  ],
}
