import type { GlobalConfig } from 'payload'

import { globalAccess, hiddenWithout } from '../access/roles'
import { chromeAfterChange } from '../app/(frontend)/lib/hooks'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site settings',
  hooks: {
    afterChange: [chromeAfterChange],
  },
  admin: {
    hidden: hiddenWithout('site-settings'),
    group: 'Site settings',
    description:
      'Site-wide identity, SEO metadata, Open Graph, Schema.org Person structured data, and section headings & CTAs.',
  },
  access: globalAccess('site-settings'),
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'General',
          description: 'Site identity, owner name, locale and browser theme colour.',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'siteName',
                  type: 'text',
                  required: true,
                  defaultValue: 'Amir v.Tarikhi Live Resume',
                  admin: {
                    width: '50%',
                    description: 'Used as Open Graph site_name across the site and articles.',
                  },
                },
                {
                  name: 'ownerName',
                  type: 'text',
                  required: true,
                  defaultValue: 'Amir v.Tarikhi',
                  admin: {
                    width: '50%',
                    description:
                      'Portfolio owner name used in metadata, image alt fallbacks and structured data.',
                  },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'locale',
                  type: 'text',
                  defaultValue: 'en_US',
                  admin: {
                    width: '50%',
                    description:
                      'Open Graph locale (e.g. "en_US", "tr_TR"). Also sets the HTML lang attribute.',
                  },
                },
                {
                  name: 'themeColor',
                  type: 'text',
                  defaultValue: '#da9100',
                  admin: {
                    width: '50%',
                    description: 'Browser toolbar theme colour (hex, e.g. "#da9100").',
                  },
                },
              ],
            },
          ],
        },
        {
          label: 'SEO & Social',
          description: 'Default search-engine metadata and social sharing preview card.',
          fields: [
            {
              name: 'siteTitle',
              type: 'text',
              required: true,
              defaultValue: 'Amir v.Tarikhi Live Resume | Full-Stack Senior Web Developer',
              admin: {
                description: 'Default <title> of the home page.',
              },
            },
            {
              name: 'metaDescription',
              type: 'textarea',
              required: true,
              defaultValue:
                'Senior PHP, JavaScript & MySQL, Mid. React & Next.js, Jr. Node.js & Laravel, E-Commerce CMS, WordPress, WooCommerce & Shopify Developer ..',
              admin: {
                description: 'Default <meta name="description"> of the home page.',
              },
            },
            {
              name: 'keywords',
              type: 'textarea',
              defaultValue:
                'Senior Web Developer, Full-Stack Developer, PHP Developer, JavaScript Developer, Next.js Developer, React.js Developer, Shopify Developer, MySQL Developer, Full-Stack Senior PHP Developer, Automation Panel Developer, E-Commerce CMS Developer, SEO Manager and Consultant',
              admin: {
                description: 'Comma-separated meta keywords.',
              },
            },
            {
              name: 'ogTitle',
              label: 'Open Graph Title',
              type: 'text',
              admin: {
                description:
                  'Social sharing card title when sharing the home page. Falls back to Site Title when empty.',
              },
            },
            {
              name: 'ogDescription',
              type: 'textarea',
              defaultValue:
                'Full-Stack Senior PHP Developer, Automation Panel Developer, E-Commerce CMS Developer, SEO Manager and Consultant',
              admin: {
                description:
                  'Open Graph description when sharing the home page. Falls back to Meta Description when empty.',
              },
            },
            {
              name: 'ogImage',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description:
                  'Social preview image (and fallback cover for hub/detail pages without a dedicated image). Falls back to Fallback Image URL below when empty.',
              },
            },
            {
              name: 'ogImageUrl',
              label: 'Fallback Image URL',
              type: 'text',
              defaultValue: '/images/profile.webp',
              admin: {
                description:
                  'Path or URL used for Open Graph and Person JSON-LD when no OG Image upload is selected.',
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'allowIndexing',
                  label: 'Allow Search Engine Indexing',
                  type: 'checkbox',
                  defaultValue: true,
                  admin: {
                    width: '34%',
                    description:
                      'Master indexing switch. Uncheck on staging/preview domains to emit noindex, nofollow site-wide and disallow crawlers in robots.txt.',
                  },
                },
                {
                  name: 'twitterSite',
                  label: 'Twitter / X Site (@handle)',
                  type: 'text',
                  admin: {
                    width: '33%',
                    placeholder: '@etarikhi',
                    description: 'Optional twitter:site handle across all pages.',
                  },
                },
                {
                  name: 'twitterCreator',
                  label: 'Twitter / X Creator (@handle)',
                  type: 'text',
                  admin: {
                    width: '33%',
                    placeholder: '@etarikhi',
                    description: 'Optional twitter:creator attribution across all pages.',
                  },
                },
              ],
            },
            {
              name: 'verification',
              label: 'Search Engine Verification Codes',
              type: 'group',
              admin: {
                description:
                  'Paste verification token values only (not the full <meta> tag) for Google Search Console, Bing Webmaster Tools, or Yandex.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'googleSiteVerification',
                      label: 'Google Verification',
                      type: 'text',
                      admin: {
                        width: '34%',
                        description: 'Emits <meta name="google-site-verification" content="...">.',
                      },
                    },
                    {
                      name: 'bingVerification',
                      label: 'Bing Verification (msvalidate.01)',
                      type: 'text',
                      admin: {
                        width: '33%',
                        description: 'Emits <meta name="msvalidate.01" content="...">.',
                      },
                    },
                    {
                      name: 'yandexVerification',
                      label: 'Yandex Verification',
                      type: 'text',
                      admin: {
                        width: '33%',
                        description: 'Emits <meta name="yandex-verification" content="...">.',
                      },
                    },
                  ],
                },
              ],
            },
            {
              name: 'articlesHubSeo',
              label: 'Articles Hub Page SEO (/articles)',
              type: 'group',
              admin: {
                description:
                  'Dedicated search & social metadata for /articles without altering Home section headings.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'metaTitle',
                      label: 'Meta Title',
                      type: 'text',
                      admin: {
                        width: '50%',
                        description:
                          'Custom <title> & og:title for /articles. Falls back to "{Heading} | {Site Name}".',
                      },
                    },
                    {
                      name: 'keywords',
                      label: 'Keywords',
                      type: 'text',
                      admin: {
                        width: '50%',
                        description: 'Comma-separated <meta name="keywords"> for /articles.',
                      },
                    },
                  ],
                },
                {
                  name: 'metaDescription',
                  label: 'Meta Description',
                  type: 'textarea',
                  admin: {
                    description:
                      'Custom <meta name="description"> & og:description for /articles. Falls back to Archive Description.',
                  },
                },
                {
                  name: 'ogImage',
                  label: 'Open Graph Image (1200×630)',
                  type: 'upload',
                  relationTo: 'media',
                  admin: {
                    description:
                      'Dedicated social sharing banner for /articles. Falls back to default OG Image when empty.',
                  },
                },
                {
                  name: 'noIndex',
                  label: 'Exclude /articles from search engine indexing (noindex, nofollow)',
                  type: 'checkbox',
                  defaultValue: false,
                },
              ],
            },
            {
              name: 'projectsHubSeo',
              label: 'Projects Hub Page SEO (/projects)',
              type: 'group',
              admin: {
                description:
                  'Dedicated search & social metadata for /projects without altering Home section headings.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'metaTitle',
                      label: 'Meta Title',
                      type: 'text',
                      admin: {
                        width: '50%',
                        description:
                          'Custom <title> & og:title for /projects. Falls back to "{Heading} | {Site Name}".',
                      },
                    },
                    {
                      name: 'keywords',
                      label: 'Keywords',
                      type: 'text',
                      admin: {
                        width: '50%',
                        description: 'Comma-separated <meta name="keywords"> for /projects.',
                      },
                    },
                  ],
                },
                {
                  name: 'metaDescription',
                  label: 'Meta Description',
                  type: 'textarea',
                  admin: {
                    description:
                      'Custom <meta name="description"> & og:description for /projects. Falls back to Archive Description.',
                  },
                },
                {
                  name: 'ogImage',
                  label: 'Open Graph Image (1200×630)',
                  type: 'upload',
                  relationTo: 'media',
                  admin: {
                    description:
                      'Dedicated social sharing banner for /projects. Falls back to default OG Image when empty.',
                  },
                },
                {
                  name: 'noIndex',
                  label: 'Exclude /projects from search engine indexing (noindex, nofollow)',
                  type: 'checkbox',
                  defaultValue: false,
                },
              ],
            },
          ],
        },
        {
          label: 'Structured Data',
          description: 'Schema.org Person JSON-LD fields rendered on the home and article pages.',
          fields: [
            {
              name: 'jobTitle',
              type: 'text',
              defaultValue: 'Senior Full-Stack Web Developer',
              admin: {
                description: 'Schema.org Person jobTitle.',
              },
            },
            {
              name: 'knowsAbout',
              label: 'Core Specialties & Technologies (knowsAbout)',
              type: 'text',
              hasMany: true,
              admin: {
                description:
                  'Topics & technologies emitted in Schema.org Person.knowsAbout (e.g. PHP, TypeScript, Next.js, Payload CMS, PostgreSQL).',
              },
            },
            {
              name: 'worksFor',
              label: 'Current Organization (worksFor)',
              type: 'group',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'name',
                      label: 'Organization Name',
                      type: 'text',
                      admin: {
                        width: '50%',
                        placeholder: 'e.g. Independent Architecture Consultant',
                      },
                    },
                    {
                      name: 'url',
                      label: 'Organization URL',
                      type: 'text',
                      admin: {
                        width: '50%',
                        placeholder: 'https://...',
                      },
                    },
                  ],
                },
              ],
            },
            {
              name: 'alumniOf',
              label: 'Educational Organizations (alumniOf)',
              type: 'array',
              labels: {
                singular: 'Institution',
                plural: 'Institutions',
              },
              admin: {
                description: 'Universities or institutions emitted in Schema.org Person.alumniOf.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'name',
                      label: 'Institution Name',
                      type: 'text',
                      required: true,
                      admin: { width: '50%' },
                    },
                    {
                      name: 'url',
                      label: 'Institution URL',
                      type: 'text',
                      admin: { width: '50%', placeholder: 'https://...' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'address',
              type: 'group',
              label: 'Postal address',
              fields: [
                {
                  name: 'streetAddress',
                  type: 'text',
                  defaultValue: '34805, Beykoz, Istanbul, Turkey',
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'addressLocality',
                      type: 'text',
                      defaultValue: 'Istanbul, Turkey',
                      admin: { width: '40%' },
                    },
                    {
                      name: 'addressRegion',
                      type: 'text',
                      defaultValue: 'Beykoz',
                      admin: { width: '30%' },
                    },
                    {
                      name: 'postalCode',
                      type: 'text',
                      defaultValue: '34805',
                      admin: { width: '30%' },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Sections & Labels',
          description:
            'Headings, button labels and external archive links for each section of the public site.',
          fields: [
            {
              name: 'hero',
              type: 'group',
              label: 'Hero section',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'greeting',
                      type: 'text',
                      defaultValue: "I'm",
                      admin: {
                        width: '50%',
                        description: 'Short greeting line above the name (e.g. "I\'m").',
                      },
                    },
                    {
                      name: 'requestCvLabel',
                      type: 'text',
                      defaultValue: 'Request CV',
                      admin: {
                        width: '50%',
                        description: 'Label on the primary hero button.',
                      },
                    },
                  ],
                },
              ],
            },
            {
              name: 'servicesSection',
              type: 'group',
              label: 'Services section',
              fields: [
                {
                  name: 'heading',
                  type: 'text',
                  defaultValue: 'My Services',
                },
              ],
            },
            {
              name: 'skillsSection',
              type: 'group',
              label: 'Skills & résumé section',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'heading',
                      type: 'text',
                      defaultValue: 'Skills & Experience',
                      admin: { width: '50%' },
                    },
                    {
                      name: 'skillsSubheading',
                      type: 'text',
                      defaultValue: 'My Skills',
                      admin: { width: '50%' },
                    },
                  ],
                },
                {
                  name: 'intro',
                  type: 'textarea',
                  defaultValue: 'Some of my top skills listed as below.',
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'experienceTabLabel',
                      type: 'text',
                      defaultValue: 'Experience',
                      admin: { width: '50%' },
                    },
                    {
                      name: 'educationTabLabel',
                      type: 'text',
                      defaultValue: 'Education',
                      admin: { width: '50%' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'certificatesSection',
              type: 'group',
              label: 'Certificates section',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'heading',
                      type: 'text',
                      defaultValue: 'Recent Certificates',
                      admin: { width: '50%' },
                    },
                    {
                      name: 'viewCertificateLabel',
                      type: 'text',
                      defaultValue: 'View Certificate →',
                      admin: { width: '50%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'ctaLabel',
                      type: 'text',
                      defaultValue: 'All Certificates >',
                      admin: {
                        width: '40%',
                        description: 'Leave empty (or clear CTA URL) to hide the button.',
                      },
                    },
                    {
                      name: 'ctaUrl',
                      type: 'text',
                      defaultValue: 'https://www.linkedin.com/in/etarikhi/details/certifications/',
                      admin: {
                        width: '60%',
                        description: 'Target URL for the "All Certificates" button.',
                      },
                    },
                  ],
                },
              ],
            },
            {
              name: 'projectsSection',
              type: 'group',
              label: 'Projects section & case studies',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'heading',
                      type: 'text',
                      defaultValue: 'My Projects',
                      admin: { width: '50%' },
                    },
                    {
                      name: 'allFilterLabel',
                      type: 'text',
                      defaultValue: 'All Projects',
                      admin: {
                        width: '50%',
                        description: 'Label of the "show all" filter button.',
                      },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'archiveDescription',
                      type: 'text',
                      defaultValue:
                        'Selected projects, engineering case studies, and full-stack builds.',
                      admin: { width: '50%' },
                    },
                    {
                      name: 'searchPlaceholder',
                      type: 'text',
                      defaultValue: 'Search projects by title, tech stack, or role…',
                      admin: { width: '50%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'caseStudyLabel',
                      type: 'text',
                      defaultValue: 'Case study',
                      admin: { width: '34%' },
                    },
                    {
                      name: 'backToProjectsLabel',
                      type: 'text',
                      defaultValue: 'Back to projects',
                      admin: { width: '33%' },
                    },
                    {
                      name: 'liveProjectLabel',
                      type: 'text',
                      defaultValue: 'Visit live project',
                      admin: { width: '33%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'notFoundTitle',
                      type: 'text',
                      defaultValue: 'Project not found',
                      admin: { width: '40%' },
                    },
                    {
                      name: 'notFoundDescription',
                      type: 'text',
                      defaultValue:
                        'This project does not exist, or it has no case-study page on this site.',
                      admin: { width: '60%' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'articlesSection',
              type: 'group',
              label: 'Articles section & pages',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'heading',
                      type: 'text',
                      defaultValue: 'Latest Articles',
                      admin: { width: '34%' },
                    },
                    {
                      name: 'readOnSiteLabel',
                      type: 'text',
                      defaultValue: 'Read on this site',
                      admin: { width: '33%' },
                    },
                    {
                      name: 'featuredBadgeLabel',
                      type: 'text',
                      defaultValue: 'Featured',
                      admin: { width: '33%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'ctaLabel',
                      type: 'text',
                      defaultValue: 'All Articles >',
                      admin: {
                        width: '40%',
                        description: 'Leave empty (or clear CTA URL) to hide the button.',
                      },
                    },
                    {
                      name: 'ctaUrl',
                      type: 'text',
                      defaultValue: '/articles',
                      admin: {
                        width: '60%',
                        description: 'Target URL for the "All Articles" button (e.g. "/articles").',
                      },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'archiveDescription',
                      type: 'text',
                      defaultValue: 'Articles, engineering notes, and guides.',
                      admin: { width: '50%' },
                    },
                    {
                      name: 'searchPlaceholder',
                      type: 'text',
                      defaultValue: 'Search articles by title or topic…',
                      admin: { width: '50%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'backToArticlesLabel',
                      type: 'text',
                      defaultValue: 'Back to articles',
                      admin: { width: '50%' },
                    },
                    {
                      name: 'externalPublicationLabel',
                      type: 'text',
                      defaultValue: 'Originally published at',
                      admin: { width: '50%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'notFoundTitle',
                      type: 'text',
                      defaultValue: 'Article not found',
                      admin: { width: '40%' },
                    },
                    {
                      name: 'notFoundDescription',
                      type: 'text',
                      defaultValue:
                        'This article does not exist, or it has no page on this site.',
                      admin: { width: '60%' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'footerLabels',
              type: 'group',
              label: 'Footer headings',
              fields: [
                {
                  name: 'socialPrompt',
                  type: 'text',
                  defaultValue: 'Get connected with me on social networks:',
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'profilesHeading',
                      type: 'text',
                      defaultValue: 'My Profiles',
                      admin: { width: '50%' },
                    },
                    {
                      name: 'contactHeading',
                      type: 'text',
                      defaultValue: 'Contact',
                      admin: { width: '50%' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
