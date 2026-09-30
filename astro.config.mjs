// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	site: 'https://jpgtopdfonline.in',
	integrations: [preact(), sitemap({ filter: (page) => !page.endsWith('/404/') })],
	vite: {
		plugins: [tailwindcss()],
	},
});
