import type { About } from '@/payload-types'

export const aboutData = (): Omit<About, 'id' | 'createdAt' | 'updatedAt'> => {
  return {
    title: 'About Me',
    experience: {
      years: 12,
      title: 'of working experience as Web Designer & Developer',
      description:
        'For approximately 12 years, I have continuously improved myself, embracing innovation and achieving success in areas such as content management systems, survey analysis systems, online e-commerce management panels, and integration systems. Additionally, I have gained experience in positions like software training. Despite the experiences and skills I have acquired during this period, I still feel a strong desire for learning within myself. This is because I am on a journey that continues to surprise me, and I feel like I am only halfway through the path. I believe it is time to delve into new technologies, frameworks, and libraries.',
    },
    workPermit: {
      title: 'Sponsorship and Work Permit:',
      description:
        "I don't have currently a work permit in EU or USA, but if the employer sponsors me, I am eligible to work wherever the employer wants and also i'm open to immigration.",
    },
    images: [
      { imageUrl: '/images/about/about-1.jpg' },
      { imageUrl: '/images/about/about-2.jpg' },
    ],
    interests: {
      title: 'Interests',
      description:
        'In my professional career, I have always remained open to learning. However, due to my intense interest in certain areas, my curiosity turns into a passion, and working in those fields is always my front-end choice, as reaching an expertise level is relatively easy. I would like to list some of these areas:',
      areas: ['Robotics', 'Machine Learning', 'Artificial Intelligence', 'Big Data and Data Analysis'],
    },
  }
}
