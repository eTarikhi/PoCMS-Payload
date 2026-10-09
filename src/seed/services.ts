import type { Service } from '@/payload-types'

export const servicesData = (): (Omit<Service, 'id' | 'createdAt' | 'updatedAt'> & { order?: number })[] => [
  {
    category: 'Back-End Development',
    iconFont: 'faCode',
    descriptions: [
      'PHP, OOP, MVC, MySQL, PDO',
      'RESTful API, SOAP, GraphQL',
      'Ajax, JavaScript, TypeScript,',
      'Frameworks ( Laravel, Symfony, .. )',
      'CMS & CRM ( WordPress, Joomla, .. )',
      'Shopify, WooCommerce, OpenCart, Presta',
    ],
    order: 0,
  },
  {
    category: 'Front-End Development',
    iconFont: 'faCropAlt',
    descriptions: [
      'HTML5, CSS3, Bootstrap 5',
      'JavaScript, TypeScript, ES6',
      'React, Next.js, Vue.js',
      'Vite, WebPack, JQuery',
      'Elementor & UI Kits',
      'Responsive Design',
    ],
    order: 1,
  },
  {
    category: 'Data Analysis and SEO',
    iconFont: 'faLaptopCode',
    descriptions: [
      'Bing & Yandex Webmaster Tools',
      'Facebook Meta Webmaster Tools',
      'Google Analytics and Webmaster Tools',
      'Search Engine Optimization',
      'Google PageSpeed Optimization',
      'Database and Server Cache Optimization',
    ],
    order: 2,
  },
  {
    category: 'Network, Server and WHM',
    iconFont: 'faCodeBranch',
    descriptions: [
      'Linux Web Server Configuration (CP, DA, PL)',
      'WHM (Cpanel, Direct Admin, Plesk) Management',
      'WHMCS, CloudFlare & DNS Server Management',
      'Web Server Security and Data Protection',
      'CloudFlare Load Balancing & Cloud Configuration',
    ],
    order: 3,
  },
]
