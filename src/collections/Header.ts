import type { CollectionConfig, Field } from 'payload'
import { chromeAfterChange, chromeAfterDelete } from '../app/(frontend)/lib/hooks'
import { contentAccess, hiddenWithout } from '../access/roles'
import { createWhileEmpty } from '../access/singleton'

const ARCHIVE_BACKGROUND_OPTIONS = [
  { label: 'Editorial Aurora Mesh + Tactile Grain', value: 'aurora-grain' },
  { label: 'Blueprint Grid + Interactive Spotlight', value: 'blueprint-spotlight' },
  { label: 'Constellation Telemetry Canvas', value: 'constellation-canvas' },
  { label: 'Obsidian Specular Minimal', value: 'obsidian-minimal' },
]

const DETAIL_BACKGROUND_OPTIONS = [
  { label: 'Chromatic Cover-Art Wash (Auto from Cover)', value: 'chromatic-cover' },
  { label: 'Editorial Aurora Mesh + Tactile Grain', value: 'aurora-grain' },
  { label: 'Blueprint Grid + Interactive Spotlight', value: 'blueprint-spotlight' },
  { label: 'Constellation Telemetry Canvas', value: 'constellation-canvas' },
  { label: 'Obsidian Specular Minimal', value: 'obsidian-minimal' },
]

const ACCENT_TONE_OPTIONS = [
  { label: 'Burnished Gold & Copper (Warm)', value: 'gold-copper' },
  { label: 'Amber & Architectural Slate (Balanced)', value: 'amber-slate' },
  { label: 'Slate Cyan & Gold (Technical)', value: 'cyan-gold' },
]

const articlesArchiveGroup: Field = {
  name: 'articlesHeader',
  label: 'Articles Hub Header (/articles)',
  type: 'group',
  admin: {
    description:
      'Controls the Type 2 Header stage, interactive search/filter dock, background technology, and default content layout on /articles.',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'eyebrow',
          label: 'Eyebrow Badge',
          type: 'text',
          defaultValue: 'Engineering Journal & Notes',
          admin: { width: '50%' },
        },
        {
          name: 'headingOverride',
          label: 'Heading Override (optional)',
          type: 'text',
          admin: {
            width: '50%',
            description: 'Falls back to Site Settings → Articles heading when left blank.',
          },
        },
      ],
    },
    {
      name: 'subtitleOverride',
      label: 'Header Subtitle Override (optional)',
      type: 'textarea',
      admin: {
        description:
          'Editorial lead paragraph inside the header. Falls back to Site Settings → Archive description when blank.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'backgroundPreset',
          label: 'Background Technology',
          type: 'select',
          defaultValue: 'aurora-grain',
          options: ARCHIVE_BACKGROUND_OPTIONS,
          admin: { width: '34%' },
        },
        {
          name: 'accentTone',
          label: 'Extended Theme Palette',
          type: 'select',
          defaultValue: 'gold-copper',
          options: ACCENT_TONE_OPTIONS,
          admin: { width: '33%' },
        },
        {
          name: 'defaultLayout',
          label: 'Default Content View',
          type: 'select',
          defaultValue: 'magazine',
          options: [
            { label: 'Magazine (Featured Hero + List + Rail)', value: 'magazine' },
            { label: 'Editorial List (Clean Chronological Stream)', value: 'list' },
            { label: 'Card Grid (3-Column Cards)', value: 'grid' },
          ],
          admin: { width: '33%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'showSearch',
          label: 'Show Search Bar in Header',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'showFilters',
          label: 'Show Category Filters in Header',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'showStatsBar',
          label: 'Show Live Article Telemetry',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'showRssLink',
          label: 'Show RSS Feed Badge (/feed.xml)',
          type: 'checkbox',
          defaultValue: true,
        },
      ],
    },
  ],
}

const projectsArchiveGroup: Field = {
  name: 'projectsHeader',
  label: 'Projects Hub Header (/projects)',
  type: 'group',
  admin: {
    description:
      'Controls the Type 2 Header stage, search/category/tech-stack filter dock, background technology, and default layout on /projects.',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'eyebrow',
          label: 'Eyebrow Badge',
          type: 'text',
          defaultValue: 'Selected Architecture & Builds',
          admin: { width: '50%' },
        },
        {
          name: 'headingOverride',
          label: 'Heading Override (optional)',
          type: 'text',
          admin: {
            width: '50%',
            description: 'Falls back to Site Settings → Projects heading when left blank.',
          },
        },
      ],
    },
    {
      name: 'subtitleOverride',
      label: 'Header Subtitle Override (optional)',
      type: 'textarea',
      admin: {
        description:
          'Falls back to Site Settings → Projects archive description when blank.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'backgroundPreset',
          label: 'Background Technology',
          type: 'select',
          defaultValue: 'blueprint-spotlight',
          options: ARCHIVE_BACKGROUND_OPTIONS,
          admin: { width: '34%' },
        },
        {
          name: 'accentTone',
          label: 'Extended Theme Palette',
          type: 'select',
          defaultValue: 'amber-slate',
          options: ACCENT_TONE_OPTIONS,
          admin: { width: '33%' },
        },
        {
          name: 'defaultLayout',
          label: 'Default Content View',
          type: 'select',
          defaultValue: 'showcase',
          options: [
            { label: 'Showcase (Case Studies Spotlight + Grid)', value: 'showcase' },
            { label: 'Architectural Index (Compact Table List)', value: 'list' },
            { label: 'Card Grid (Uniform 3-Column Cards)', value: 'grid' },
          ],
          admin: { width: '33%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'showSearch',
          label: 'Show Search Bar in Header',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'showCategoryFilters',
          label: 'Show Category Filters',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'showTechFilters',
          label: 'Show Tech-Stack Chips',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'showStatsBar',
          label: 'Show Live Project Telemetry',
          type: 'checkbox',
          defaultValue: true,
        },
      ],
    },
  ],
}

const articleDetailGroup: Field = {
  name: 'articleDetailHeader',
  label: 'Article Reading Header (/articles/[slug])',
  type: 'group',
  admin: {
    description:
      'Controls the Type 3 Editorial Header, topic-jump dock, sticky scroll-spy sidebar, and continuation cards on /articles/[slug].',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'eyebrow',
          label: 'Default Eyebrow Label',
          type: 'text',
          defaultValue: 'Engineering Article',
          admin: { width: '34%' },
        },
        {
          name: 'backgroundPreset',
          label: 'Background Technology',
          type: 'select',
          defaultValue: 'chromatic-cover',
          options: DETAIL_BACKGROUND_OPTIONS,
          admin: { width: '33%' },
        },
        {
          name: 'accentTone',
          label: 'Extended Theme Palette',
          type: 'select',
          defaultValue: 'gold-copper',
          options: ACCENT_TONE_OPTIONS,
          admin: { width: '33%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'showBreadcrumbs',
          label: 'Show Breadcrumb Trail',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'showShareActions',
          label: 'Show Copy-Link & External Actions',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'showSectionJumpDock',
          label: 'Show H2 Section-Jump Chips in Header',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'showStickyToc',
          label: 'Show Sticky Scroll-Spy Sidebar',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'showRelatedArticles',
          label: 'Show "Continue Reading" Cards',
          type: 'checkbox',
          defaultValue: true,
        },
      ],
    },
  ],
}

const projectDetailGroup: Field = {
  name: 'projectDetailHeader',
  label: 'Project Case-Study Header (/projects/[slug])',
  type: 'group',
  admin: {
    description:
      'Controls the Type 3 Case-Study Header, spec dock, deep-linked tech chips, sticky sidebar, and related builds on /projects/[slug].',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'eyebrow',
          label: 'Default Eyebrow Label',
          type: 'text',
          defaultValue: 'Engineering Case Study',
          admin: { width: '34%' },
        },
        {
          name: 'backgroundPreset',
          label: 'Background Technology',
          type: 'select',
          defaultValue: 'chromatic-cover',
          options: DETAIL_BACKGROUND_OPTIONS,
          admin: { width: '33%' },
        },
        {
          name: 'accentTone',
          label: 'Extended Theme Palette',
          type: 'select',
          defaultValue: 'amber-slate',
          options: ACCENT_TONE_OPTIONS,
          admin: { width: '33%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'showBreadcrumbs',
          label: 'Show Breadcrumb Trail',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'showSpecDock',
          label: 'Show Role/Client/Year Spec Dock',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'showTechLinks',
          label: 'Link Tech Chips to /projects?tech=…',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'showStickySidebar',
          label: 'Show Sticky TOC & Quick-Links Rail',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'showRelatedProjects',
          label: 'Show "More Selected Projects" Cards',
          type: 'checkbox',
          defaultValue: true,
        },
      ],
    },
  ],
}

export const Header: CollectionConfig = {
  slug: 'header',
  hooks: {
    afterChange: [chromeAfterChange],
    afterDelete: [chromeAfterDelete],
  },
  labels: {
    singular: 'Header Management',
    plural: 'Header Management',
  },
  admin: {
    hidden: hiddenWithout('header'),
    group: 'Site settings',
    description:
      'Unified Header Management Studio: configure (1) Home Hero, (2) /articles & /projects Archive Headers, and (3) /articles/[slug] & /projects/[slug] Detail Headers.',
    useAsTitle: 'sureName',
    defaultColumns: ['id', 'sureName', 'professionTexts', 'updatedAt'],
    components: {
      views: { list: { Component: '/components/admin/views/SingletonList#SingletonListView' } },
    },
  },
  access: {
    ...contentAccess('header'),
    create: createWhileEmpty('header'),
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: '1. Home Hero (/)',
          description:
            'The Home page hero section (/): name, portrait, typing titles, and Request CV CTA. Home page layout remains preserved as originally designed.',
          fields: [
            { name: 'sureName', type: 'text', required: true },
            { name: 'profileImage', type: 'upload', relationTo: 'media' },
            { name: 'imageUrl', type: 'text' },
            {
              name: 'requestCV',
              type: 'text',
              admin: { description: 'Link behind the "Request CV" button.' },
            },
            {
              name: 'professionTexts',
              type: 'text',
              hasMany: true,
              required: true,
              admin: { description: 'Job titles shown in the hero section.' },
            },
          ],
        },
        {
          label: '2. Archive Headers (/articles & /projects)',
          description:
            'Type 2 Header configuration for the /articles and /projects hub pages: background technology, theme palette, interactive search/filter dock, and default main layout.',
          fields: [articlesArchiveGroup, projectsArchiveGroup],
        },
        {
          label: '3. Detail Headers (/articles/[slug] & /projects/[slug])',
          description:
            'Type 3 Header configuration for individual article reading pages and project case studies: atmospheric backgrounds, contextual spec/topic docks, and sticky reading rails.',
          fields: [articleDetailGroup, projectDetailGroup],
        },
      ],
    },
  ],
}
