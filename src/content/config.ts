import { defineCollection, z } from 'astro:content';

const blogCollection = defineCollection({
	type: 'content',
	schema: z.object({
		title: z.string(),
		description: z.string(),
		date: z.coerce.date(),
		images: z
			.array(
				z.object({
					path: z.string(),
					alt: z.string(),
				}),
			)
			.optional(),
	}),
});

export const collections = {
	blog: blogCollection,
};
