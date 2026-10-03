import type { CollectionConfig } from 'payload'

export const About: CollectionConfig = {
    slug: 'about',
    labels: {
        singular: 'About',
        plural: 'About',
    },
    admin: {
        useAsTitle: 'title',
        defaultColumns: ['id', 'title', 'experience.years', 'updatedAt'],
    },
    access: {
        read: () => true,
    },
    fields: [
        { name: 'title', type: 'text', required: true },
        {
            name: 'experience',
            type: 'group',
            fields: [
                { name: 'years', type: 'number', required: true, min: 0 },
                { name: 'title', type: 'text', required: true },
                { name: 'description', type: 'textarea', required: true },
            ],
        },
        {
            name: 'workPermit',
            type: 'group',
            fields: [
                { name: 'title', type: 'text', required: true },
                { name: 'description', type: 'textarea', required: true },
            ],
        },
        {
            name: 'uploadImages',
            type: 'upload',
            relationTo: 'media',
            hasMany: true,
        },
        {
            name: 'images',
            label: 'Images URLs',
            type: 'array',
            fields: [
                { name: 'imageUrl', type: 'text', required: true },
            ],
        },
        {
            name: 'interests',
            type: 'group',
            fields: [
                { name: 'title', type: 'text', required: true },
                { name: 'description', type: 'textarea', required: true },
                {
                    name: 'areas',
                    type: 'text',
                    hasMany: true,
                },
            ],
        },
    ],
}