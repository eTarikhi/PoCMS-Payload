import type { NumberField } from 'payload'

// Manual sort position. Lower numbers come first.
export const orderField: NumberField = {
  name: 'order',
  type: 'number',
  defaultValue: 0,
  index: true,
  admin: {
    description: 'Lower numbers appear first.',
  },
}
