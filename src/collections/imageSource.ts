/**
 * The custom Field entry for an upload field that shares its picture with a sibling URL field
 * (`components/admin/fields/ImageSource`). Kept here so all three collections describe the control
 * the same way and the `urlField` name cannot drift from the actual field.
 */
export const imageSourceField = (options: {
  /** Sibling text field that holds an external image URL. */
  urlField: string
  urlLabel?: string
  urlDescription?: string
}) => ({
  Field: {
    path: '/components/admin/fields/ImageSource#ImageSourceField',
    clientProps: options,
  },
})
