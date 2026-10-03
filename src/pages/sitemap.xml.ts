import type { APIRoute } from 'astro';

const pages = [
	'/',
	'/about/',
	'/contact/',
	'/privacy/',
	'/terms/',
	'/jpg-to-pdf-high-quality/',
	'/merge-jpg-to-pdf/',
	'/image-to-pdf-online/',
	'/jpg-to-pdf-custom-size/',
	'/jpg-to-pdf-under-200kb/',
	'/jpg-to-pdf-under-500kb/',
	'/jpg-to-pdf-under-1mb/',
	'/jpg-to-pdf-under-2mb/',
];

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
