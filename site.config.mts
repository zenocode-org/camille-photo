import type { AstroInstance } from 'astro';
import { Github, Instagram } from 'lucide-astro';

export interface SocialLink {
	name: string;
	url: string;
	icon: AstroInstance;
}

export default {
	title: 'Camille Rubio',
	favicon: 'favicon.ico',
	owner: 'Camille Rubio',
	profileImage: 'profile.webp',
	socialLinks: [
		{
			name: 'Instagram',
			url: 'https://www.instagram.com/_camcam.jpg/',
			icon: Instagram,
		} as SocialLink,
	],
};
