import type { RequiredDataFromCollectionSlug } from 'payload'

import {
  buildLexicalDocument,
  lexicalParagraphNode,
  lexicalTextNode,
} from '@/app/(frontend)/lib/lexical'
import type { Form } from '@/payload-types'
import {
  DEFAULT_CONTACT_FORM_SLUG,
  DEFAULT_REQUEST_CV_FORM_SLUG,
} from '@/plugins/formBuilder'

export type SeedFormInput = RequiredDataFromCollectionSlug<'forms'>
type FormLexicalState = NonNullable<Form['confirmationMessage']>

const asFormLexical = (doc: ReturnType<typeof buildLexicalDocument>): FormLexicalState =>
  doc as unknown as FormLexicalState

export const formsData = (): SeedFormInput[] => {
  const notificationTarget = process.env.CONTACT_NOTIFICATION_EMAIL || 'dev@vtarikhi.com'

  return [
    {
      title: 'Contact Inquiry',
      slug: DEFAULT_CONTACT_FORM_SLUG,
      submitButtonLabel: 'Send Inquiry',
      confirmationType: 'message',
      confirmationMessage: asFormLexical(
        buildLexicalDocument([
          lexicalParagraphNode([
            lexicalTextNode(
              'Thank you for getting in touch — your inquiry has been logged securely and I will respond shortly.',
            ),
          ]),
        ]),
      ),
      fields: [
        {
          blockType: 'text',
          name: 'name',
          label: 'Your Name',
          width: 50,
          required: true,
        },
        {
          blockType: 'email',
          name: 'email',
          label: 'Email Address',
          width: 50,
          required: true,
        },
        {
          blockType: 'select',
          name: 'subject',
          label: 'Topic',
          width: 100,
          required: true,
          defaultValue: 'project',
          options: [
            { label: 'Project Architecture & Engineering', value: 'project' },
            { label: 'Full-Stack Consulting & Advisory', value: 'consulting' },
            { label: 'Speaking / Technical Writing', value: 'speaking' },
            { label: 'General Inquiry', value: 'general' },
          ],
        },
        {
          blockType: 'textarea',
          name: 'message',
          label: 'How can I help?',
          width: 100,
          required: true,
        },
      ],
      emails: [
        {
          emailTo: notificationTarget,
          emailFrom: 'PoCMS <dev@vtarikhi.com>',
          replyTo: '{{email}}',
          subject: '[PoCMS Contact] {{name}} — {{subject}}',
          message: asFormLexical(
            buildLexicalDocument([
              lexicalParagraphNode([
                lexicalTextNode('New Contact Inquiry submitted via PoCMS:'),
              ]),
              lexicalParagraphNode([
                lexicalTextNode('Sender: {{name}} ({{email}}) | Topic: {{subject}}'),
              ]),
              lexicalParagraphNode([
                lexicalTextNode('Message: {{message}}'),
              ]),
            ]),
          ),
        },
      ],
    },
    {
      title: 'Request CV',
      slug: DEFAULT_REQUEST_CV_FORM_SLUG,
      submitButtonLabel: 'Request CV Copy',
      confirmationType: 'message',
      confirmationMessage: asFormLexical(
        buildLexicalDocument([
          lexicalParagraphNode([
            lexicalTextNode(
              'Thank you — your CV request has been received. A current PDF copy will be shared to your email address shortly.',
            ),
          ]),
        ]),
      ),
      fields: [
        {
          blockType: 'text',
          name: 'name',
          label: 'Full Name',
          width: 50,
          required: true,
        },
        {
          blockType: 'email',
          name: 'email',
          label: 'Work Email',
          width: 50,
          required: true,
        },
        {
          blockType: 'text',
          name: 'organization',
          label: 'Company / Role',
          width: 100,
          required: true,
        },
        {
          blockType: 'textarea',
          name: 'notes',
          label: 'Context or Role Details (Optional)',
          width: 100,
          required: false,
        },
      ],
      emails: [
        {
          emailTo: notificationTarget,
          emailFrom: 'PoCMS <dev@vtarikhi.com>',
          replyTo: '{{email}}',
          subject: '[PoCMS CV Request] {{name}} ({{organization}})',
          message: asFormLexical(
            buildLexicalDocument([
              lexicalParagraphNode([
                lexicalTextNode('New Request-CV submission via PoCMS:'),
              ]),
              lexicalParagraphNode([
                lexicalTextNode('Requester: {{name}} ({{email}}) — {{organization}}'),
              ]),
              lexicalParagraphNode([
                lexicalTextNode('Notes: {{notes}}'),
              ]),
            ]),
          ),
        },
      ],
    },
  ]
}
