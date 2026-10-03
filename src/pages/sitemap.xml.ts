import type { APIRoute } from 'astro';

const pages = ['/', '/about/', '/contact/', '/privacy/', '/terms/'];

export const GET: APIRoute = ({ site }) => {
	const urls = pages
		.map((page) => `\t<url><loc>${new URL(page, site).href}</loc></url>`)
		.join('\n');

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
		{
			headers: {
				'Content-Type': 'application/xml; charset=utf-8',
			},
		},
	);
};
