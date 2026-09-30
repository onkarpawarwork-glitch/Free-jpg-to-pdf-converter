import type { PdfImageInput } from './types';

export interface JpegMetadata {
	width: number;
	height: number;
	orientation: number;
}

export interface EncodedJpeg {
	bytes: Uint8Array;
	width: number;
	height: number;
}

const MAX_BASE_EDGE = 4_200;
const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function readExifOrientation(view: DataView, start: number, end: number): number {
	if (end - start < 14 ||
		view.getUint8(start) !== 0x45 || view.getUint8(start + 1) !== 0x78 ||
		view.getUint8(start + 2) !== 0x69 || view.getUint8(start + 3) !== 0x66 ||
		view.getUint8(start + 4) !== 0 || view.getUint8(start + 5) !== 0) return 1;
	const tiff = start + 6;
	const byteOrder = view.getUint16(tiff, false);
	const littleEndian = byteOrder === 0x4949;
	if ((!littleEndian && byteOrder !== 0x4d4d) || view.getUint16(tiff + 2, littleEndian) !== 42) return 1;
	const ifdOffset = view.getUint32(tiff + 4, littleEndian);
	const ifd = tiff + ifdOffset;
	if (ifd + 2 > end) return 1;
	const count = view.getUint16(ifd, littleEndian);
	for (let index = 0; index < count; index += 1) {
		const entry = ifd + 2 + index * 12;
		if (entry + 12 > end) break;
		if (view.getUint16(entry, littleEndian) === 0x0112) {
			const value = view.getUint16(entry + 8, littleEndian);
			return value >= 1 && value <= 8 ? value : 1;
		}
	}
	return 1;
}

export async function readJpegMetadata(input: PdfImageInput): Promise<JpegMetadata> {
	if (!/\.jpe?g$/i.test(input.fileName)) throw new TypeError(`${input.fileName} is not a JPG or JPEG file.`);
	if (input.data.type && input.data.type.toLowerCase() !== 'image/jpeg') {
		throw new TypeError(`${input.fileName} is not a JPEG image.`);
	}
	const buffer = await input.data.arrayBuffer();
	const view = new DataView(buffer);
	if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) throw new TypeError(`${input.fileName} is not a readable JPEG image.`);
	let offset = 2;
	let width = 0;
	let height = 0;
	let orientation = 1;
	while (offset + 4 <= view.byteLength) {
		if (view.getUint8(offset) !== 0xff) {
			offset += 1;
			continue;
		}
		while (offset < view.byteLength && view.getUint8(offset) === 0xff) offset += 1;
		if (offset >= view.byteLength) break;
		const marker = view.getUint8(offset++);
		if (marker === 0xd9 || marker === 0xda) break;
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
		if (offset + 2 > view.byteLength) break;
		const segmentLength = view.getUint16(offset, false);
		if (segmentLength < 2 || offset + segmentLength > view.byteLength) break;
		const segmentStart = offset + 2;
		const segmentEnd = offset + segmentLength;
		if (marker === 0xe1) orientation = readExifOrientation(view, segmentStart, segmentEnd);
		if (JPEG_SOF_MARKERS.has(marker) && segmentLength >= 7) {
			height = view.getUint16(segmentStart + 1, false);
			width = view.getUint16(segmentStart + 3, false);
		}
		offset = segmentEnd;
	}
	if (!width || !height) throw new TypeError(`${input.fileName} does not contain valid JPEG dimensions.`);
	return orientation >= 5 && orientation <= 8
		? { width: height, height: width, orientation }
		: { width, height, orientation };
}

async function createOrientedBitmap(input: PdfImageInput, width: number, height: number, resizeEdge: number): Promise<ImageBitmap> {
	const resizeOptions: ImageBitmapOptions = width >= height
		? { imageOrientation: 'from-image', resizeWidth: resizeEdge, resizeQuality: 'high' }
		: { imageOrientation: 'from-image', resizeHeight: resizeEdge, resizeQuality: 'high' };
	try {
		return await createImageBitmap(input.data, resizeOptions);
	} catch {
		if (resizeEdge < Math.max(width, height)) {
			throw new Error(`Your browser cannot safely downsize ${input.fileName}. Try a smaller image.`);
		}
		try {
			return await createImageBitmap(input.data, { imageOrientation: 'from-image' });
		} catch {
			return createImageBitmap(input.data);
		}
	}
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) resolve(blob);
			else reject(new Error('The browser could not encode this image as JPEG.'));
		}, 'image/jpeg', quality);
	});
}

export async function encodeJpeg(
	input: PdfImageInput,
	scale: number,
	quality: number,
	knownMetadata?: JpegMetadata,
): Promise<EncodedJpeg> {
	if (!Number.isFinite(scale) || scale <= 0 || scale > 1) throw new RangeError('Image scale must be between 0 and 1.');
	if (!Number.isFinite(quality) || quality < 0 || quality > 1) throw new RangeError('JPEG quality must be between 0 and 1.');
	const metadata = knownMetadata ?? await readJpegMetadata(input);
	const boundedBaseEdge = Math.min(MAX_BASE_EDGE, Math.max(metadata.width, metadata.height));
	const resizeEdge = Math.max(1, Math.round(boundedBaseEdge * scale));
	const bitmap = await createOrientedBitmap(input, metadata.width, metadata.height, resizeEdge);
	const bitmapScale = Math.min(1, resizeEdge / Math.max(bitmap.width, bitmap.height));
	const scaledWidth = Math.max(1, Math.round(bitmap.width * bitmapScale));
	const scaledHeight = Math.max(1, Math.round(bitmap.height * bitmapScale));
	const rotation = input.rotationDegrees ?? 0;
	const swapsAxes = rotation === 90 || rotation === 270;
	const outputWidth = swapsAxes ? scaledHeight : scaledWidth;
	const outputHeight = swapsAxes ? scaledWidth : scaledHeight;
	let canvas: HTMLCanvasElement | OffscreenCanvas;
	if (typeof OffscreenCanvas !== 'undefined') {
		canvas = new OffscreenCanvas(outputWidth, outputHeight);
	} else if (typeof document !== 'undefined') {
		const element = document.createElement('canvas');
		element.width = outputWidth;
		element.height = outputHeight;
		canvas = element;
	} else {
		bitmap.close();
		throw new Error('Canvas encoding is not available in this browser.');
	}
	const context = canvas.getContext('2d');
	if (!context) {
		bitmap.close();
		throw new Error('A 2D Canvas context could not be created.');
	}
	let jpegBlob: Blob;
	try {
		if (rotation === 90) {
			context.translate(outputWidth, 0);
			context.rotate(Math.PI / 2);
		} else if (rotation === 180) {
			context.translate(outputWidth, outputHeight);
			context.rotate(Math.PI);
		} else if (rotation === 270) {
			context.translate(0, outputHeight);
			context.rotate(-Math.PI / 2);
		}
		context.drawImage(bitmap, 0, 0, scaledWidth, scaledHeight);
	} finally {
		bitmap.close();
	}
	try {
		if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
			jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
		} else {
			jpegBlob = await canvasToJpeg(canvas as HTMLCanvasElement, quality);
		}
	} finally {
		canvas.width = 0;
		canvas.height = 0;
	}
	return { bytes: new Uint8Array(await jpegBlob.arrayBuffer()), width: outputWidth, height: outputHeight };
}

