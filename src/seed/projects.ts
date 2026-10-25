import {
  buildLexicalDocument,
  lexicalBlockNode,
  lexicalBulletListNode,
  lexicalHeadingNode,
  lexicalParagraphNode,
  lexicalTextNode,
} from '@/app/(frontend)/lib/lexical'

export const projectsData = () => [
  {
    title: 'SepiWhite',
    excerpt:
      'High-conversion multi-language e-commerce platform with custom inventory synchronization and sub-second edge caching.',
    role: 'Lead Full-Stack Developer',
    client: 'SepiWhite Cosmetics',
    year: '2024',
    techStack: ['PHP 8', 'MySQL', 'JavaScript', 'Bootstrap 5', 'Cloudflare'],
    src: '/images/projects/SepiWhite.webp',
    placeHolder: '/images/projects/thumb/SepiWhite.webp',
    url: 'https://www.linkedin.com/in/etarikhi/details/projects/',
    readMoreUrl: '',
    categories: ['front-end', 'back-end'],
    content: buildLexicalDocument([
      lexicalHeadingNode('h2', 'Project Overview'),
      lexicalParagraphNode([
        lexicalTextNode(
          'SepiWhite required a fast, mobile-first storefront paired with real-time order and stock synchronization across regional warehouses.',
        ),
      ]),
      lexicalBlockNode({
        blockType: 'callout',
        variant: 'info',
        title: 'Performance outcome',
        content:
          'Edge caching and responsive WebP media pipelines improved mobile Largest Contentful Paint by 48%.',
      }),
      lexicalHeadingNode('h2', 'Architecture & Implementation'),
      lexicalBulletListNode([
        'Modular server-rendered catalog with localized pricing and SEO structured data.',
        'Idempotent webhook consumers keeping payment gateways and fulfillment queues consistent.',
        'Cloudflare WAF and tiered asset caching.',
      ]),
      lexicalHeadingNode('h3', 'Cache Invalidation Hook'),
      lexicalBlockNode({
        blockType: 'code',
        language: 'typescript',
        filename: 'lib/revalidate-catalog.ts',
        code: `export async function purgeProductPaths(sku: string): Promise<void> {
  await revalidateTag(\`product:\${sku}\`, 'max')
  await revalidateTag('catalog-index', 'max')
}`,
      }),
    ]),
  },
  {
    title: 'Egzador',
    src: '/images/projects/Egzador.webp',
    placeHolder: '/images/projects/thumb/Egzador.webp',
    url: 'https://www.linkedin.com/in/etarikhi/details/projects/',
    readMoreUrl: '',
    categories: ['front-end', 'back-end'],
  },
  {
    title: 'DogalAsitane',
    src: '/images/projects/DogalAsitane.webp',
    placeHolder: '/images/projects/thumb/DogalAsitane.webp',
    url: 'https://www.linkedin.com/in/etarikhi/details/projects/',
    readMoreUrl: '',
    categories: ['front-end'],
  },
  {
    title: 'UrumSorgu',
    src: '/images/projects/UrumSorgu.webp',
    placeHolder: '/images/projects/thumb/UrumSorgu.webp',
    url: 'https://www.linkedin.com/in/etarikhi/details/projects/',
    readMoreUrl: '',
    categories: ['front-end', 'back-end'],
  },
  {
    title: 'IceTherapy',
    src: '/images/projects/IceTherapy.webp',
    placeHolder: '/images/projects/thumb/IceTherapy.webp',
    url: 'https://www.linkedin.com/in/etarikhi/details/projects/',
    readMoreUrl: '',
    categories: ['front-end', 'back-end'],
  },
  {
    title: 'ColdLipolysis',
    src: '/images/projects/ColdLipolysis.webp',
    placeHolder: '/images/projects/thumb/ColdLipolysis.webp',
    url: 'https://www.linkedin.com/in/etarikhi/details/projects/',
    readMoreUrl: '',
    categories: ['front-end', 'back-end'],
  },
  {
    title: 'AnemonTerapi',
    src: '/images/projects/AnemonTerapi.webp',
    placeHolder: '/images/projects/thumb/AnemonTerapi.webp',
    url: 'https://www.linkedin.com/in/etarikhi/details/projects/',
    readMoreUrl: '',
    categories: ['front-end', 'back-end'],
  },
  {
    title: 'AlyaPanel',
    excerpt:
      'Multi-tenant operations CRM and automation dashboard managing orders, call-center workflows, and courier integrations.',
    role: 'Principal Architect & Developer',
    client: 'Internal Enterprise Suite',
    year: '2024',
    techStack: ['PHP', 'Laravel', 'MySQL', 'REST API', 'Bootstrap'],
    src: '/images/projects/AlyaPanel.webp',
    placeHolder: '/images/projects/thumb/AlyaPanel.webp',
    url: 'https://www.linkedin.com/in/etarikhi/details/projects/',
    readMoreUrl: '',
    categories: ['front-end', 'back-end', 'cms-crm'],
    content: buildLexicalDocument([
      lexicalHeadingNode('h2', 'Challenge'),
      lexicalParagraphNode([
        lexicalTextNode(
          'Operations teams needed a unified CRM panel capable of routing thousands of daily orders across call-center agents and logistics providers with strict role-based permissions.',
        ),
      ]),
      lexicalHeadingNode('h2', 'Role-Based Access & Auditability'),
      lexicalParagraphNode([
        lexicalTextNode(
          'Every status transition records actor attribution and timestamps so supervisors can audit fulfillment SLAs in real time.',
        ),
      ]),
      lexicalBlockNode({
        blockType: 'callout',
        variant: 'warning',
        title: 'Idempotent courier sync',
        content:
          'External carrier webhooks retry at least once; shipment state transitions use optimistic locking to avoid duplicate dispatches.',
      }),
    ]),
  },
  {
    title: 'CaddePanel',
    src: '/images/projects/CaddePanel.webp',
    placeHolder: '/images/projects/thumb/CaddePanel.webp',
    url: 'https://www.linkedin.com/in/etarikhi/details/projects/',
    readMoreUrl: '',
    categories: ['front-end', 'back-end', 'cms-crm'],
  },
  {
    title: 'ProximaAkademi',
    src: '/images/projects/ProximaAkademi.webp',
    placeHolder: '/images/projects/thumb/ProximaAkademi.webp',
    url: 'https://www.linkedin.com/in/etarikhi/details/projects/',
    readMoreUrl: '',
    categories: ['front-end', 'back-end', 'cms-crm'],
  },
  {
    title: 'Evona-Kozmetik',
    src: '/images/projects/Evona-Kozmetik.webp',
    placeHolder: '/images/projects/thumb/Evona-Kozmetik.webp',
    url: 'https://www.linkedin.com/in/etarikhi/details/projects/',
    readMoreUrl: '',
    categories: ['front-end', 'back-end'],
  },
  {
    title: 'WinterHoney',
    src: '/images/projects/WinterHoney.webp',
    placeHolder: '/images/projects/thumb/WinterHoney.webp',
    url: 'https://www.linkedin.com/in/etarikhi/details/projects/',
    readMoreUrl: '',
    categories: ['front-end', 'back-end'],
  },
  {
    title: 'NatureGenome',
    src: '/images/projects/NatureGenome.webp',
    placeHolder: '/images/projects/thumb/NatureGenome.webp',
    url: 'https://www.linkedin.com/in/etarikhi/details/projects/',
    readMoreUrl: '',
    categories: ['front-end', 'back-end'],
  },
  {
    title: 'ARKBlog',
    src: '/images/projects/ARKBlog.webp',
    placeHolder: '/images/projects/thumb/ARKBlog.webp',
    url: 'https://www.linkedin.com/in/etarikhi/details/projects/',
    readMoreUrl: '',
    categories: ['front-end'],
  },
]
