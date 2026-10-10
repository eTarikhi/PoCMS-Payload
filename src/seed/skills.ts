import type { Skill } from '@/payload-types'

export const skillsData = (): (Omit<Skill, 'id' | 'createdAt' | 'updatedAt'> & { order?: number })[] => [
  {
    label: 'HTML, CSS, Bootstrap',
    group: 'frontend',
    value: 95,
    color: 'success',
    order: 0,
  },
  {
    label: 'React, Next.js, Vue.js',
    group: 'frontend',
    value: 75,
    color: 'info',
    order: 1,
  },
  {
    label: 'PHP, MySQL, OOP',
    group: 'frontend',
    value: 90,
    color: 'primary',
    order: 2,
  },
  {
    label: 'JavaScript, TypeScript',
    group: 'backend',
    value: 80,
    color: 'warning',
    order: 0,
  },
  {
    label: 'NodeJS, Express',
    group: 'backend',
    value: 65,
    color: 'danger',
    order: 1,
  },
  {
    label: 'Laravel, Symfony',
    group: 'backend',
    value: 65,
    color: 'info',
    order: 2,
  },
]
