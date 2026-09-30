import { PDFDocument } from 'pdf-lib';
import type { PageMargin, PageOrientation, PageSize, PdfConversionOptions, PdfDocumentOutput } from './types';
import type { EncodedJpeg } from './image';

export interface EncodedImage {
	fileName: string;
	image: EncodedJpeg;
}

const POINTS_PER_MM = 72 / 25.4;
const A4 = { width: 210 * POINTS_PER_MM, height: 297 * POINTS_PER_MM };
const LETTER = { width: 612, height: 792 };
const MAX_PAGE_EDGE_POINTS = 14_400;

function marginInPoints(margin: PageMargin): number {
	if (margin === 'small') return 5 * POINTS_PER_MM;
	if (margin === 'big') return 10 * POINTS_PER_MM;
	return 0;
}

function pageDimensions(
	pageSize: PageSize,
	orientation: PageOrientation,
	imageWidth: number,
	imageHeight: number,
): { width: number; height: number } {
	if (pageSize === 'fit') {
		const scale = Math.min(0.75, MAX_PAGE_EDGE_POINTS / Math.max(imageWidth, imageHeight));
		return { width: imageWidth * scale, height: imageHeight * scale };
	}
	const base = pageSize === 'a4' ? A4 : LETTER;
	const shouldLandscape = orientation === 'landscape' || (orientation === 'auto' && imageWidth > imageHeight);
	const isLandscape = base.width > base.height;
	return shouldLandscape === isLandscape
		? { ...base }
		: { width: base.height, height: base.width };
}

async function createDocument(images: readonly EncodedImage[], options: PdfConversionOptions): Promise<Blob> {
	const document = await PDFDocument.create();
	for (const { image } of images) {
		const jpeg = await document.embedJpg(image.bytes);
		const page = pageDimensions(options.pageSize, options.orientation, image.width, image.height);
		const pdfPage = document.addPage([page.width, page.height]);
		const margin = marginInPoints(options.margin);
		const contentWidth = Math.max(1, page.width - margin * 2);
		const contentHeight = Math.max(1, page.height - margin * 2);
		const imageScale = Math.min(contentWidth / jpeg.width, contentHeight / jpeg.height);
		const width = jpeg.width * imageScale;
		const height = jpeg.height * imageScale;
		pdfPage.drawImage(jpeg, {
			x: (page.width - width) / 2,
			y: (page.height - height) / 2,
			width,
			height,
		});
	}
	const bytes = Uint8Array.from(await document.save({ useObjectStreams: true, addDefaultPage: false }));
	return new Blob([bytes.buffer], { type: 'application/pdf' });
}

function pdfFileName(name: string): string {
	const baseName = name.replace(/\.pdf$/i, '').trim() || 'images';
	return `${baseName}.pdf`;
}

function imagePdfName(fileName: string): string {
	const baseName = fileName.replace(/\.jpe?g$/i, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'image';
	return `${baseName}.pdf`;
}

export async function buildPdfDocuments(
	images: readonly EncodedImage[],
	options: PdfConversionOptions,
): Promise<readonly PdfDocumentOutput[]> {
	if (!images.length) throw new RangeError('At least one image is required to create a PDF.');
	if (options.mergeIntoOne) {
		const pdf = await createDocument(images, options);
		return [{ fileName: pdfFileName(options.outputName ?? 'jpg-images.pdf'), pdf, byteSize: pdf.size }];
	}
	const documents: PdfDocumentOutput[] = [];
	for (const image of images) {
		const pdf = await createDocument([image], options);
		documents.push({ fileName: imagePdfName(image.fileName), pdf, byteSize: pdf.size });
	}
	return documents;
}

export function sumPdfBytes(documents: readonly PdfDocumentOutput[]): number {
	return documents.reduce((sum, document) => sum + document.byteSize, 0);
}
