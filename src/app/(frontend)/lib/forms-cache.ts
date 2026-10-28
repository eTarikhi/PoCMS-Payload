import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import type { Form, FormsSelect } from '@/payload-types'
import { FORMS_COLLECTION } from '@/plugins/formBuilder'

import { mapPublicForm, type PublicCmsForm } from './forms-types'
import { CACHE_TAGS, PORTFOLIO_CACHE_TAG } from './revalidate'

/**
 * Projection omitting `emails` so notification targets (`emailTo`, `cc`, `bcc`) are never read
 * into the frontend server cache or RSC payload.
 */
export const PUBLIC_FORM_SELECT = {
  title: true,
  slug: true,
  fields: true,
  submitButtonLabel: true,
  confirmationType: true,
  confirmationMessage: true,
  redirect: true,
} satisfies FormsSelect

export const fetchPublishedForms = async (): Promise<PublicCmsForm[]> => {
  try {
    const payload = await getPayload({ config: configPromise })
    const result = await payload.find({
      collection: FORMS_COLLECTION,
      pagination: false,
      depth: 1,
      sort: 'id',
      select: PUBLIC_FORM_SELECT,
    })

    return (result.docs as Partial<Form>[])
      .map((doc) => mapPublicForm(doc))
      .filter((form): form is PublicCmsForm => form !== null)
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        '[portfolio] Failed to fetch CMS forms:',
        error instanceof Error ? error.message : error,
      )
    }
    return []
  }
}

export const getCachedPublicForms = unstable_cache(
  () => fetchPublishedForms(),
  ['portfolio-public-forms-v1'],
  { tags: [PORTFOLIO_CACHE_TAG, CACHE_TAGS.forms] },
)
