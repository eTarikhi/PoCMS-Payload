/**
 * Server-owned persisted GraphQL query registry for public portfolio & CMS form reads.
 *
 * Every document here is a fixed, single-operation read query. Arbitrary client query text,
 * mutations, introspection, `CustomCode`, `Forms.emails`, `form-submissions`, and top-level
 * `Media` / `PayloadFolders` queries are intentionally absent.
 *
 * Note on `Media` relationship subselections:
 * Documents and images are NOT served or transferred via GraphQL. All image/file binary delivery
 * stays on Payload's existing REST/static file routes (`/api/media/file/<filename>` or static
 * public URLs). `filename` (alongside `url`, `alt`, `width`, `height`, `mimeType`, `blurDataURL`,
 * `sizes`, `focalX`, `focalY`) is selected strictly as relational metadata because Payload 3.90.2's
 * upload `url` `afterRead` hook (`getBaseFields.ts` -> `generateFilePathOrURL`) computes `url` and
 * `sizes.<variant>.url` (`'/api/media/file/' + encodeURIComponent(filename)`) from
 * `data.filename || originalDoc.filename`. Without selecting `filename` in the projection, Payload's
 * `afterRead` hook evaluates `url` to `null` for local uploads and breaks the existing REST URL
 * contract.
 */

export const PERSISTED_QUERY_IDS = [
  'public.site-settings.v1',
  'public.navigation.v1',
  'public.header.v1',
  'public.footer.v1',
  'public.projects-section.v1',
  'public.home-profile.v1',
  'public.article-cards.v1',
  'public.project-cards.v1',
  'public.article-detail.v1',
  'public.project-detail.v1',
  'public.article-slugs.v1',
  'public.project-slugs.v1',
  'public.article-feed.v1',
  'public.project-feed.v1',
  'public.forms.v1',
  'public.redirects.v1',
] as const

export type PersistedQueryId = (typeof PERSISTED_QUERY_IDS)[number]

export type PersistedQueryVariableSpec = 'none' | 'slug'

export type PersistedQueryEntry = {
  readonly id: PersistedQueryId
  readonly operationName: string
  readonly variableSpec: PersistedQueryVariableSpec
  readonly query: string
}

export const PERSISTED_COLLECTION_LIST_LIMIT = 100
export const MAX_PERSISTED_SLUG_LENGTH = 200

const MEDIA_SIZE_FIELDS = `
  url
  width
  height
  mimeType
  filename
`

const MEDIA_PUBLIC_FIELDS = `
  id
  url
  filename
  alt
  width
  height
  mimeType
  blurDataURL
  focalX
  focalY
  sizes {
    thumbnail { ${MEDIA_SIZE_FIELDS} }
    card { ${MEDIA_SIZE_FIELDS} }
    content { ${MEDIA_SIZE_FIELDS} }
    hero { ${MEDIA_SIZE_FIELDS} }
    og { ${MEDIA_SIZE_FIELDS} }
  }
`

const SKILL_LABEL_FIELDS = `
  id
  label
  deletedAt
`

const PUBLISHED_OR_LEGACY_GRAPHQL_WHERE = `{ OR: [{ _status: { equals: published } }, { _status: { exists: false } }] }`

const SITE_SETTINGS_FIELDS = `
  siteName
  ownerName
  locale
  themeColor
  siteTitle
  metaDescription
  keywords
  ogTitle
  ogDescription
  ogImage { ${MEDIA_PUBLIC_FIELDS} }
  ogImageUrl
  allowIndexing
  twitterSite
  twitterCreator
  verification {
    googleSiteVerification
    bingVerification
    yandexVerification
  }
  articlesHubSeo {
    metaTitle
    keywords
    metaDescription
    ogImage { ${MEDIA_PUBLIC_FIELDS} }
    noIndex
  }
  projectsHubSeo {
    metaTitle
    keywords
    metaDescription
    ogImage { ${MEDIA_PUBLIC_FIELDS} }
    noIndex
  }
  jobTitle
  knowsAboutSkills { ${SKILL_LABEL_FIELDS} }
  knowsAbout
  worksFor {
    name
    url
  }
  alumniOf {
    id
    name
    url
  }
  address {
    streetAddress
    addressLocality
    addressRegion
    postalCode
  }
  hero {
    greeting
    requestCvLabel
  }
  servicesSection {
    heading
  }
  skillsSection {
    heading
    skillsSubheading
    intro
    experienceTabLabel
    educationTabLabel
  }
  certificatesSection {
    heading
    viewCertificateLabel
    ctaLabel
    ctaUrl
  }
  projectsSection {
    heading
    allFilterLabel
    archiveDescription
    searchPlaceholder
    caseStudyLabel
    backToProjectsLabel
    liveProjectLabel
    notFoundTitle
    notFoundDescription
  }
  articlesSection {
    heading
    readOnSiteLabel
    featuredBadgeLabel
    ctaLabel
    ctaUrl
    archiveDescription
    searchPlaceholder
    backToArticlesLabel
    externalPublicationLabel
    notFoundTitle
    notFoundDescription
  }
  footerLabels {
    socialPrompt
    profilesHeading
    contactHeading
  }
`

const ARTICLE_CARD_FIELDS = `
  id
  title
  slug
  excerpt
  description
  content(depth: 0)
  featured
  category
  publishedAt
  readTime
  primaryMedia {
    mode
    source
    media { ${MEDIA_PUBLIC_FIELDS} }
    imageUrl
    alt
    urlMeta
  }
  mediaMode
  mediaSource
  image { ${MEDIA_PUBLIC_FIELDS} }
  imageUrl
  imageAlt
  imageUrlMeta
  link
`

const PROJECT_CARD_FIELDS = `
  id
  title
  slug
  excerpt
  role
  year
  relatedSkills { ${SKILL_LABEL_FIELDS} }
  techStack
  content(depth: 0)
  primaryMedia {
    mode
    source
    media { ${MEDIA_PUBLIC_FIELDS} }
    imageUrl
    alt
    urlMeta
    thumbnailUrl
  }
  mediaMode
  mediaSource
  image { ${MEDIA_PUBLIC_FIELDS} }
  src
  imageAlt
  srcMeta
  placeHolder
  url
  categories
  readTime
`

export const PERSISTED_QUERY_REGISTRY: Readonly<Record<PersistedQueryId, PersistedQueryEntry>> = {
  'public.site-settings.v1': {
    id: 'public.site-settings.v1',
    operationName: 'PublicSiteSettings',
    variableSpec: 'none',
    query: `query PublicSiteSettings {
      SiteSetting {
        ${SITE_SETTINGS_FIELDS}
      }
    }`,
  },
  'public.navigation.v1': {
    id: 'public.navigation.v1',
    operationName: 'PublicNavigation',
    variableSpec: 'none',
    query: `query PublicNavigation {
      Navigation {
        brand {
          text
          href
        }
        skipToContentLabel
        items {
          id
          label
          href
          position
          enabled
          openInNewTab
        }
      }
    }`,
  },
  'public.header.v1': {
    id: 'public.header.v1',
    operationName: 'PublicHeader',
    variableSpec: 'none',
    query: `query PublicHeader {
      Header {
        sureName
        profileImage { ${MEDIA_PUBLIC_FIELDS} }
        imageUrl
        requestCV
        professionTexts
        articlesHeader {
          eyebrow
          headingOverride
          subtitleOverride
          backgroundPreset
          accentTone
          defaultLayout
          showSearch
          showFilters
          showStatsBar
          showRssLink
        }
        projectsHeader {
          eyebrow
          headingOverride
          subtitleOverride
          backgroundPreset
          accentTone
          defaultLayout
          showSearch
          showCategoryFilters
          showTechFilters
          showStatsBar
        }
        articleDetailHeader {
          eyebrow
          backgroundPreset
          accentTone
          showBreadcrumbs
          showShareActions
          showSectionJumpDock
          showStickyToc
          showRelatedArticles
        }
        projectDetailHeader {
          eyebrow
          backgroundPreset
          accentTone
          showBreadcrumbs
          showSpecDock
          showTechLinks
          showStickySidebar
          showRelatedProjects
        }
      }
    }`,
  },
  'public.footer.v1': {
    id: 'public.footer.v1',
    operationName: 'PublicFooter',
    variableSpec: 'none',
    query: `query PublicFooter {
      Footer {
        socialLinks {
          id
          platform
          url
          iconName
          ariaLabel
        }
        roles {
          fullName
          footerRoles
        }
        profiles {
          id
          name
          url
        }
        contactInfo {
          id
          type
          iconName
          content
          isLink
          url
          className
        }
        hiringCta {
          label
          url
        }
        copyRight {
          year
          website
          url
        }
      }
    }`,
  },
  'public.projects-section.v1': {
    id: 'public.projects-section.v1',
    operationName: 'PublicProjectsSection',
    variableSpec: 'none',
    query: `query PublicProjectsSection {
      SiteSetting {
        projectsSection {
          heading
          allFilterLabel
          archiveDescription
          searchPlaceholder
          caseStudyLabel
          backToProjectsLabel
          liveProjectLabel
          notFoundTitle
          notFoundDescription
        }
      }
    }`,
  },
  'public.home-profile.v1': {
    id: 'public.home-profile.v1',
    operationName: 'PublicHomeProfile',
    variableSpec: 'none',
    query: `query PublicHomeProfile {
      Abouts(limit: 1) {
        totalDocs
        docs {
          id
          experience {
            years
            title
            description
          }
          workPermit {
            title
            description
          }
          uploadImages { ${MEDIA_PUBLIC_FIELDS} }
          images {
            id
            imageUrl
          }
          interests {
            title
            description
            areas
          }
        }
      }
      Skills(limit: ${PERSISTED_COLLECTION_LIST_LIMIT}, sort: "_order") {
        totalDocs
        docs {
          id
          label
          value
          color
          group
        }
      }
      Experiences(limit: ${PERSISTED_COLLECTION_LIST_LIMIT}, sort: "_order") {
        totalDocs
        docs {
          id
          title
          date
          company
        }
      }
      Educations(limit: ${PERSISTED_COLLECTION_LIST_LIMIT}, sort: "_order") {
        totalDocs
        docs {
          id
          title
          date
          institution
          location
        }
      }
      Certificates(limit: ${PERSISTED_COLLECTION_LIST_LIMIT}, sort: "issuedAt") {
        totalDocs
        docs {
          id
          title
          issuer
          issuedAt
          image { ${MEDIA_PUBLIC_FIELDS} }
          imageUrl
          link
        }
      }
      Services(limit: ${PERSISTED_COLLECTION_LIST_LIMIT}, sort: "_order") {
        totalDocs
        docs {
          id
          category
          iconFont
          descriptions
        }
      }
    }`,
  },
  'public.article-cards.v1': {
    id: 'public.article-cards.v1',
    operationName: 'PublicArticleCards',
    variableSpec: 'none',
    query: `query PublicArticleCards {
      Articles(
        limit: ${PERSISTED_COLLECTION_LIST_LIMIT}
        sort: "-publishedAt"
        where: ${PUBLISHED_OR_LEGACY_GRAPHQL_WHERE}
      ) {
        totalDocs
        docs {
          ${ARTICLE_CARD_FIELDS}
        }
      }
    }`,
  },
  'public.project-cards.v1': {
    id: 'public.project-cards.v1',
    operationName: 'PublicProjectCards',
    variableSpec: 'none',
    query: `query PublicProjectCards {
      Projects(
        limit: ${PERSISTED_COLLECTION_LIST_LIMIT}
        sort: "_order"
        where: ${PUBLISHED_OR_LEGACY_GRAPHQL_WHERE}
      ) {
        totalDocs
        docs {
          ${PROJECT_CARD_FIELDS}
        }
      }
    }`,
  },
  'public.article-detail.v1': {
    id: 'public.article-detail.v1',
    operationName: 'PublicArticleDetail',
    variableSpec: 'slug',
    query: `query PublicArticleDetail($slug: String!) {
      Articles(
        limit: 1
        where: {
          AND: [
            { slug: { equals: $slug } }
            ${PUBLISHED_OR_LEGACY_GRAPHQL_WHERE}
          ]
        }
      ) {
        totalDocs
        docs {
          id
          title
          slug
          excerpt
          description
          content(depth: 2)
          featured
          category
          publishedAt
          readTime
          primaryMedia {
            mode
            source
            media { ${MEDIA_PUBLIC_FIELDS} }
            imageUrl
            alt
            urlMeta
          }
          detailMedia {
            mode
            galleryLayout
            items {
              id
              source
              media { ${MEDIA_PUBLIC_FIELDS} }
              imageUrl
              caption
              alt
              urlMeta
            }
          }
          mediaMode
          mediaSource
          image { ${MEDIA_PUBLIC_FIELDS} }
          imageUrl
          imageAlt
          imageUrlMeta
          galleryLayout
          gallery {
            id
            source
            media { ${MEDIA_PUBLIC_FIELDS} }
            imageUrl
            caption
            alt
            urlMeta
          }
          link
          meta {
            title
            description
            image { ${MEDIA_PUBLIC_FIELDS} }
            canonicalUrl
            keywords
            ogTitle
            twitterCard
            ogDescription
            noIndex
            noFollow
          }
        }
      }
    }`,
  },
  'public.project-detail.v1': {
    id: 'public.project-detail.v1',
    operationName: 'PublicProjectDetail',
    variableSpec: 'slug',
    query: `query PublicProjectDetail($slug: String!) {
      Projects(
        limit: 1
        where: {
          AND: [
            { slug: { equals: $slug } }
            ${PUBLISHED_OR_LEGACY_GRAPHQL_WHERE}
          ]
        }
      ) {
        totalDocs
        docs {
          id
          title
          slug
          excerpt
          role
          client
          year
          relatedSkills { ${SKILL_LABEL_FIELDS} }
          techStack
          content(depth: 2)
          primaryMedia {
            mode
            source
            media { ${MEDIA_PUBLIC_FIELDS} }
            imageUrl
            alt
            urlMeta
            thumbnailUrl
          }
          detailMedia {
            mode
            galleryLayout
            items {
              id
              source
              media { ${MEDIA_PUBLIC_FIELDS} }
              imageUrl
              caption
              alt
              urlMeta
            }
          }
          mediaMode
          mediaSource
          image { ${MEDIA_PUBLIC_FIELDS} }
          src
          imageAlt
          srcMeta
          galleryLayout
          gallery {
            id
            source
            media { ${MEDIA_PUBLIC_FIELDS} }
            imageUrl
            caption
            alt
            urlMeta
          }
          placeHolder
          url
          readMoreUrl
          categories
          readTime
          meta {
            title
            description
            image { ${MEDIA_PUBLIC_FIELDS} }
            canonicalUrl
            keywords
            ogTitle
            twitterCard
            ogDescription
            noIndex
            noFollow
          }
        }
      }
    }`,
  },
  'public.article-slugs.v1': {
    id: 'public.article-slugs.v1',
    operationName: 'PublicArticleSlugs',
    variableSpec: 'none',
    query: `query PublicArticleSlugs {
      Articles(
        limit: ${PERSISTED_COLLECTION_LIST_LIMIT}
        sort: "-publishedAt"
        where: ${PUBLISHED_OR_LEGACY_GRAPHQL_WHERE}
      ) {
        totalDocs
        docs {
          id
          slug
          content(depth: 0)
          description
        }
      }
    }`,
  },
  'public.project-slugs.v1': {
    id: 'public.project-slugs.v1',
    operationName: 'PublicProjectSlugs',
    variableSpec: 'none',
    query: `query PublicProjectSlugs {
      Projects(
        limit: ${PERSISTED_COLLECTION_LIST_LIMIT}
        sort: "_order"
        where: ${PUBLISHED_OR_LEGACY_GRAPHQL_WHERE}
      ) {
        totalDocs
        docs {
          id
          slug
          content(depth: 0)
        }
      }
    }`,
  },
  'public.article-feed.v1': {
    id: 'public.article-feed.v1',
    operationName: 'PublicArticleFeed',
    variableSpec: 'none',
    query: `query PublicArticleFeed {
      Articles(
        limit: ${PERSISTED_COLLECTION_LIST_LIMIT}
        sort: "-publishedAt"
        where: ${PUBLISHED_OR_LEGACY_GRAPHQL_WHERE}
      ) {
        totalDocs
        docs {
          id
          title
          slug
          excerpt
          description
          content(depth: 0)
          category
          publishedAt
          link
          meta {
            title
            description
            image { ${MEDIA_PUBLIC_FIELDS} }
            canonicalUrl
            keywords
            ogTitle
            twitterCard
            ogDescription
            noIndex
            noFollow
          }
          createdAt
          updatedAt
          deletedAt
        }
      }
    }`,
  },
  'public.project-feed.v1': {
    id: 'public.project-feed.v1',
    operationName: 'PublicProjectFeed',
    variableSpec: 'none',
    query: `query PublicProjectFeed {
      Projects(
        limit: ${PERSISTED_COLLECTION_LIST_LIMIT}
        sort: "_order"
        where: ${PUBLISHED_OR_LEGACY_GRAPHQL_WHERE}
      ) {
        totalDocs
        docs {
          id
          title
          slug
          excerpt
          role
          relatedSkills { ${SKILL_LABEL_FIELDS} }
          techStack
          content(depth: 0)
          url
          categories
          meta {
            title
            description
            image { ${MEDIA_PUBLIC_FIELDS} }
            canonicalUrl
            keywords
            ogTitle
            twitterCard
            ogDescription
            noIndex
            noFollow
          }
          createdAt
          updatedAt
          deletedAt
        }
      }
    }`,
  },
  'public.forms.v1': {
    id: 'public.forms.v1',
    operationName: 'PublicForms',
    variableSpec: 'none',
    query: `query PublicForms {
      Forms(limit: ${PERSISTED_COLLECTION_LIST_LIMIT}, sort: "id") {
        totalDocs
        docs {
          id
          title
          slug
          submitButtonLabel
          confirmationType
          confirmationMessage(depth: 1)
          redirect {
            type
            url
            reference(draft: false) {
              relationTo
              value {
                __typename
                ... on Article {
                  Article_id: id
                  Article_slug: slug
                  Article_title: title
                }
                ... on Project {
                  Project_id: id
                  Project_slug: slug
                  Project_title: title
                }
              }
            }
          }
          fields {
            __typename
            ... on Checkbox {
              Checkbox_id: id
              Checkbox_name: name
              Checkbox_label: label
              Checkbox_width: width
              Checkbox_required: required
              Checkbox_defaultValue: defaultValue
            }
            ... on Email {
              Email_id: id
              Email_name: name
              Email_label: label
              Email_width: width
              Email_required: required
            }
            ... on Message {
              Message_id: id
              Message_message: message(depth: 1)
            }
            ... on Number {
              Number_id: id
              Number_name: name
              Number_label: label
              Number_width: width
              Number_required: required
              Number_defaultValue: defaultValue
            }
            ... on Select {
              Select_id: id
              Select_name: name
              Select_label: label
              Select_width: width
              Select_required: required
              Select_defaultValue: defaultValue
              Select_placeholder: placeholder
              Select_options: options {
                id
                label
                value
              }
            }
            ... on Text {
              Text_id: id
              Text_name: name
              Text_label: label
              Text_width: width
              Text_required: required
              Text_defaultValue: defaultValue
            }
            ... on Textarea {
              Textarea_id: id
              Textarea_name: name
              Textarea_label: label
              Textarea_width: width
              Textarea_required: required
              Textarea_defaultValue: defaultValue
            }
          }
        }
      }
    }`,
  },
  'public.redirects.v1': {
    id: 'public.redirects.v1',
    operationName: 'PublicRedirects',
    variableSpec: 'none',
    query: `query PublicRedirects {
      Redirects(limit: ${PERSISTED_COLLECTION_LIST_LIMIT}, sort: "id") {
        totalDocs
        docs {
          id
          from
          type
          to {
            type
            url
            reference(draft: false) {
              relationTo
              value {
                __typename
                ... on Article {
                  Article_id: id
                  Article_slug: slug
                }
                ... on Project {
                  Project_id: id
                  Project_slug: slug
                }
              }
            }
          }
        }
      }
    }`,
  },
}

export const isPersistedQueryId = (value: unknown): value is PersistedQueryId =>
  typeof value === 'string' && Object.hasOwn(PERSISTED_QUERY_REGISTRY, value)

export type ValidatedPersistedVariables = Record<string, string> | undefined

export type PersistedEnvelopeValidationResult =
  | {
      readonly ok: true
      readonly entry: PersistedQueryEntry
      readonly variables: ValidatedPersistedVariables
    }
  | {
      readonly ok: false
      readonly status: 400 | 404
      readonly error: string
    }

const hasControlCharacters = (value: string): boolean => {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export const validatePersistedSlug = (slug: unknown): string | null => {
  if (typeof slug !== 'string') return null
  if (slug.length < 1 || slug.length > MAX_PERSISTED_SLUG_LENGTH) return null
  if (slug.trim() !== slug) return null
  if (hasControlCharacters(slug)) return null
  return slug
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Validates a decoded JSON body from `POST /api/fgql` or an internal persisted-query caller.
 * Rejects batching arrays, arbitrary `query` strings, unknown keys, unknown operation IDs, and
 * malformed/unexpected `variables`.
 */
export const validatePersistedEnvelope = (body: unknown): PersistedEnvelopeValidationResult => {
  if (Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      error: 'Batched persisted GraphQL requests are not supported.',
    }
  }

  if (!isPlainObject(body)) {
    return {
      ok: false,
      status: 400,
      error: 'Persisted GraphQL request body must be a JSON object.',
    }
  }

  for (const key of Object.keys(body)) {
    if (key !== 'id' && key !== 'variables') {
      return {
        ok: false,
        status: 400,
        error: `Unsupported persisted GraphQL request field "${key}".`,
      }
    }
  }

  const rawId = body.id
  if (typeof rawId !== 'string' || rawId.length === 0) {
    return {
      ok: false,
      status: 400,
      error: 'Persisted GraphQL request must include a non-empty string "id".',
    }
  }

  if (!isPersistedQueryId(rawId)) {
    return {
      ok: false,
      status: 404,
      error: 'Unknown persisted GraphQL operation id.',
    }
  }

  const entry = PERSISTED_QUERY_REGISTRY[rawId]
  const rawVariables = body.variables

  if (entry.variableSpec === 'none') {
    if (rawVariables !== undefined && rawVariables !== null) {
      if (!isPlainObject(rawVariables) || Object.keys(rawVariables).length > 0) {
        return {
          ok: false,
          status: 400,
          error: `Operation "${entry.id}" does not accept variables.`,
        }
      }
    }
    return { ok: true, entry, variables: undefined }
  }

  if (!isPlainObject(rawVariables)) {
    return {
      ok: false,
      status: 400,
      error: `Operation "${entry.id}" requires a {"slug": string} variables object.`,
    }
  }

  const keys = Object.keys(rawVariables)
  if (keys.length !== 1 || keys[0] !== 'slug') {
    return {
      ok: false,
      status: 400,
      error: `Operation "${entry.id}" accepts only the "slug" variable.`,
    }
  }

  const validatedSlug = validatePersistedSlug(rawVariables.slug)
  if (!validatedSlug) {
    return {
      ok: false,
      status: 400,
      error: `Variable "slug" must be a trimmed string of 1-${MAX_PERSISTED_SLUG_LENGTH} printable characters.`,
    }
  }

  return {
    ok: true,
    entry,
    variables: { slug: validatedSlug },
  }
}
