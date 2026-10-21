import type { Skill } from '@/payload-types'

// Array order is the order on the site: Skills is orderable, so Payload appends each document and
// the seed creates them in this sequence (see `src/seed/index.ts`).
export const skillsData = (): Omit<Skill, 'id' | 'createdAt' | 'updatedAt' | '_order'>[] => [
  {
    label: 'HTML, CSS, Bootstrap',
    group: 'frontend',
    value: 95,
    color: 'success',
  },
  {
    label: 'React, Next.js, Vue.js',
    group: 'frontend',
    value: 75,
    color: 'info',
  },
  {
    label: 'PHP, MySQL, OOP',
    group: 'frontend',
    value: 90,
    color: 'primary',
  },
  {
    label: 'JavaScript, TypeScript',
    group: 'backend',
    value: 80,
    color: 'warning',
  },
  {
    label: 'NodeJS, Express',
    group: 'backend',
    value: 65,
    color: 'danger',
  },
  {
    label: 'Laravel, Symfony',
    group: 'backend',
    value: 65,
    color: 'info',
  },
]
