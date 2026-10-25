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
          admin: { width: '50%' },
        },
        {
          name: 'filename',
          type: 'text',
          label: 'Filename (optional)',
          admin: {
            width: '50%',
            placeholder: 'src/payload.config.ts',
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
