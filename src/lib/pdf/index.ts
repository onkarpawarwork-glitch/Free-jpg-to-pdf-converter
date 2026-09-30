import { encodeJpeg, readJpegMetadata, type JpegMetadata } from './image';
import { buildPdfDocuments, sumPdfBytes, type EncodedImage } from './pdf';
import { DEFAULT_MAX_ITERATIONS, JPEG_QUALITY_MAX, optimizePdf } from './optimizer';
import type {
	ConversionProgressCallback,
	PdfConversionOptions,
	PdfConversionResult,
	PdfImageOptimization,
	PdfImageInput,
} from './types';

export type * from './types';
export { allocateImageBudgets, DEFAULT_MAX_ITERATIONS, JPEG_QUALITY_MAX, JPEG_QUALITY_MIN, SCALE_LEVELS, optimizePdf } from './optimizer';
export { readJpegMetadata, encodeJpeg } from './image';
export { buildPdfDocuments, sumPdfBytes } from './pdf';

const TARGET_PRESETS: Record<Exclude<PdfConversionOptions['targetSize'], 'custom' | 'none'>, number> = {
	'200kb': 200 * 1024,
	'500kb': 500 * 1024,
	'1mb': 1024 * 1024,
	'2mb': 2 * 1024 * 1024,
};

export function resolveTargetByteSize(options: PdfConversionOptions): number | null {
	if (options.targetSize === 'none') return null;
	if (options.targetSize === 'custom') {
		if (!Number.isFinite(options.customTargetBytes) || !options.customTargetBytes || options.customTargetBytes <= 0) {
			throw new RangeError('A positive custom target byte size is required.');
		}
		return options.customTargetBytes;
	}
	return TARGET_PRESETS[options.targetSize];
}

function validateOptions(options: PdfConversionOptions): void {
	if (!['a4', 'letter', 'fit'].includes(options.pageSize)) throw new TypeError('Unsupported page size.');
	if (!['auto', 'portrait', 'landscape'].includes(options.orientation)) throw new TypeError('Unsupported page orientation.');
	if (!['none', 'small', 'big'].includes(options.margin)) throw new TypeError('Unsupported page margin.');
	if (typeof options.mergeIntoOne !== 'boolean') throw new TypeError('mergeIntoOne must be a boolean.');
	resolveTargetByteSize(options);
}

export async function runConversion(
	images: readonly PdfImageInput[],
	options: PdfConversionOptions,
	progress?: ConversionProgressCallback,
): Promise<PdfConversionResult> {
	if (!images.length) throw new RangeError('Choose at least one JPG or JPEG image.');
	validateOptions(options);
	const targetByteSize = resolveTargetByteSize(options);
	const imageMetadata: JpegMetadata[] = [];
	for (let index = 0; index < images.length; index += 1) {
		progress?.({ phase: 'reading', iteration: index + 1, maximumIterations: images.length });
		imageMetadata.push(await readJpegMetadata(images[index]));
	}
	const optimizationImages = images.map((image, index) => ({
		input: image,
		metadata: imageMetadata[index],
		pixelArea: imageMetadata[index].width * imageMetadata[index].height,
	}));

	const optimized = await optimizePdf({
		images: optimizationImages,
		targetByteSize,
		maxIterations: DEFAULT_MAX_ITERATIONS,
		buildCandidate: async ({ images: candidates, qualities, scale }) => {
			const encoded: EncodedImage[] = [];
			for (let index = 0; index < candidates.length; index += 1) {
				encoded.push({
					fileName: candidates[index].input.fileName,
					image: await encodeJpeg(candidates[index].input, scale, qualities[index], candidates[index].metadata),
				});
			}
			const documents = await buildPdfDocuments(encoded, options);
			return { value: documents, byteSize: sumPdfBytes(documents) };
		},
		onCandidate: ({ iteration, maximumIterations, quality, scale, byteSize }) => {
			progress?.({
				phase: 'optimizing',
				iteration,
				maximumIterations,
				jpegQuality: quality,
				imageScale: scale,
				candidateByteSize: byteSize,
				targetByteSize,
			});
		},
	});

	const documents = optimized.value;
	const finalByteSize = sumPdfBytes(documents);
	const imagesResult: PdfImageOptimization[] = optimizationImages.map(({ input, pixelArea }, index) => ({
		fileName: input.fileName,
		pixelArea,
		targetBytes: optimized.perImageTargetBytes?.[index] ?? null,
		quality: optimized.qualities[index],
		scale: optimized.scale,
	}));
	const result: PdfConversionResult = {
		pdf: documents[0].pdf,
		documents,
		finalByteSize,
		finalSizeKB: finalByteSize / 1024,
		finalSizeMB: finalByteSize / (1024 * 1024),
		targetByteSize,
		targetMet: optimized.targetMet,
		jpegQuality: optimized.quality,
		imageScale: optimized.scale,
		pageCount: images.length,
		optimizationStatus: optimized.status,
		iterations: optimized.iterations,
		images: imagesResult,
	};
	progress?.({ phase: 'complete', iteration: optimized.iterations, maximumIterations: DEFAULT_MAX_ITERATIONS, candidateByteSize: finalByteSize, targetByteSize });
	return result;
}

