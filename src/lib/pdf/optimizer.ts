import type { OptimizationStatus } from './types';

export const JPEG_QUALITY_MIN = 0.3;
export const JPEG_QUALITY_MAX = 0.95;
export const SCALE_LEVELS = [1, 0.85, 0.7, 0.55] as const;
export const DEFAULT_MAX_ITERATIONS = 32;
const PDF_OVERHEAD_RESERVE_BYTES = 1_024;
const QUALITY_SEARCH_STEPS = 7;

export interface OptimizationInput {
	pixelArea: number;
}

export interface CandidateRequest<TImage extends OptimizationInput> {
	images: readonly TImage[];
	qualities: readonly number[];
	scale: number;
	perImageTargetBytes: readonly number[] | null;
}

export interface CandidateOutput<TValue> {
	value: TValue;
	byteSize: number;
}

export type CandidateBuilder<TImage extends OptimizationInput, TValue> = (
	request: CandidateRequest<TImage>,
) => Promise<CandidateOutput<TValue>>;

export interface OptimizePdfOptions<TImage extends OptimizationInput, TValue = unknown> {
	images: readonly TImage[];
	targetByteSize: number | null;
	maxIterations?: number;
	buildCandidate: CandidateBuilder<TImage, TValue>;
	onCandidate?: (candidate: {
		iteration: number;
		maximumIterations: number;
		quality: number;
		scale: number;
		byteSize: number;
	}) => void;
}

export interface OptimizePdfResult<TValue> {
	value: TValue;
	byteSize: number;
	quality: number;
	scale: number;
	qualities: readonly number[];
	perImageTargetBytes: readonly number[] | null;
	targetByteSize: number | null;
	targetMet: boolean;
	status: OptimizationStatus;
	iterations: number;
}

interface MeasuredCandidate<TValue> {
	value: TValue;
	byteSize: number;
	quality: number;
	scale: number;
	qualities: readonly number[];
	perImageTargetBytes: readonly number[] | null;
}

export function allocateImageBudgets(targetByteSize: number, pixelAreas: readonly number[]): number[] {
	if (!pixelAreas.length) return [];
	if (!Number.isFinite(targetByteSize) || targetByteSize < 0) {
		throw new RangeError('The target byte size must be a non-negative finite number.');
	}
	const areas = pixelAreas.map((area) => {
		if (!Number.isFinite(area) || area <= 0) throw new RangeError('Every image must have a positive pixel area.');
		return area;
	});
	const totalArea = areas.reduce((sum, area) => sum + area, 0);
	const overhead = Math.min(PDF_OVERHEAD_RESERVE_BYTES, targetByteSize / areas.length);
	const distributableBytes = Math.max(0, targetByteSize - overhead * areas.length);
	return areas.map((area) => overhead + distributableBytes * (area / totalArea));
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function qualitiesForBudget<TImage extends OptimizationInput>(
	images: readonly TImage[],
	baseQuality: number,
	budgets: readonly number[] | null,
): number[] {
	if (!budgets) return images.map(() => baseQuality);
	const usableBudget = budgets.map((budget) => Math.max(1, budget - PDF_OVERHEAD_RESERVE_BYTES));
	const totalUsableBudget = usableBudget.reduce((sum, budget) => sum + budget, 0);
	const totalArea = images.reduce((sum, image) => sum + image.pixelArea, 0);
	const averageBytesPerPixel = totalUsableBudget / totalArea;
	return images.map((image, index) => {
		const allocatedBytesPerPixel = usableBudget[index] / image.pixelArea;
		const adjustment = Math.sqrt(allocatedBytesPerPixel / averageBytesPerPixel);
		return clamp(baseQuality * adjustment, JPEG_QUALITY_MIN, JPEG_QUALITY_MAX);
	});
}

export async function optimizePdf<TImage extends OptimizationInput, TValue>(
	options: OptimizePdfOptions<TImage, TValue>,
): Promise<OptimizePdfResult<TValue>> {
	const { images, buildCandidate, targetByteSize } = options;
	if (!images.length) throw new RangeError('At least one image is required.');
	for (const image of images) {
		if (!Number.isFinite(image.pixelArea) || image.pixelArea <= 0) {
			throw new RangeError('Every image must have a positive pixel area.');
		}
	}
	if (targetByteSize !== null && (!Number.isFinite(targetByteSize) || targetByteSize <= 0)) {
		throw new RangeError('The target byte size must be a positive finite number.');
	}

	const maximumIterations = Math.max(1, Math.floor(options.maxIterations ?? DEFAULT_MAX_ITERATIONS));
	let iterations = 0;
	let bestMeasured: MeasuredCandidate<TValue> | undefined;
	let smallestCandidate: MeasuredCandidate<TValue> | undefined;
	let foundScaleThatFits = false;
	let completedMinimumScaleChecks = true;
	let exhaustedIterationLimit = false;
	const perImageTargetBytes = targetByteSize === null
		? null
		: allocateImageBudgets(targetByteSize, images.map((image) => image.pixelArea));

	const measure = async (scale: number, quality: number): Promise<MeasuredCandidate<TValue> | undefined> => {
		if (iterations >= maximumIterations) return undefined;
		const qualities = qualitiesForBudget(images, quality, perImageTargetBytes);
		const output = await buildCandidate({ images, qualities, scale, perImageTargetBytes });
		iterations += 1;
		const candidate: MeasuredCandidate<TValue> = {
			value: output.value,
			byteSize: output.byteSize,
			quality: Math.min(...qualities),
			scale,
			qualities,
			perImageTargetBytes,
		};
		options.onCandidate?.({
			iteration: iterations,
			maximumIterations,
			quality: candidate.quality,
			scale,
			byteSize: candidate.byteSize,
		});
		if (!Number.isFinite(candidate.byteSize) || candidate.byteSize < 0) {
			throw new RangeError('The PDF builder returned an invalid byte size.');
		}
		if (!smallestCandidate || candidate.byteSize < smallestCandidate.byteSize) smallestCandidate = candidate;
		if (targetByteSize === null || candidate.byteSize <= targetByteSize) {
			if (!bestMeasured || candidate.scale > bestMeasured.scale ||
				(candidate.scale === bestMeasured.scale && candidate.quality > bestMeasured.quality)) {
				bestMeasured = candidate;
			}
		}
		return candidate;
	};

	if (targetByteSize === null) {
		const candidate = await measure(SCALE_LEVELS[0], JPEG_QUALITY_MAX);
		if (!candidate) throw new Error('The PDF candidate could not be generated.');
		return toResult(candidate, null, 'no-limit', iterations);
	}

	for (let scaleIndex = 0; scaleIndex < SCALE_LEVELS.length; scaleIndex += 1) {
		const scale = SCALE_LEVELS[scaleIndex];
		const highQuality = await measure(scale, JPEG_QUALITY_MAX);
		if (!highQuality) {
			completedMinimumScaleChecks = false;
			break;
		}
		if (highQuality.byteSize <= targetByteSize) {
			foundScaleThatFits = true;
			break;
		}

		const lowQuality = await measure(scale, JPEG_QUALITY_MIN);
		if (!lowQuality) {
			completedMinimumScaleChecks = false;
			break;
		}
		if (lowQuality.byteSize <= targetByteSize) {
			foundScaleThatFits = true;
			let low = JPEG_QUALITY_MIN;
			let high = JPEG_QUALITY_MAX;
			let qualitySteps = 0;
			for (; qualitySteps < QUALITY_SEARCH_STEPS && iterations < maximumIterations; qualitySteps += 1) {
				const midpoint = (low + high) / 2;
				const candidate = await measure(scale, midpoint);
				if (!candidate) break;
				if (candidate.byteSize <= targetByteSize) low = midpoint;
				else high = midpoint;
			}
			if (iterations >= maximumIterations && qualitySteps < QUALITY_SEARCH_STEPS) exhaustedIterationLimit = true;
			break;
		}
		if (scaleIndex === SCALE_LEVELS.length - 1) completedMinimumScaleChecks = true;
	}

	if (iterations >= maximumIterations && !foundScaleThatFits) {
		completedMinimumScaleChecks = false;
		exhaustedIterationLimit = true;
	}

	const winner = bestMeasured ?? smallestCandidate;
	if (!winner) throw new Error('The PDF candidate could not be generated.');
	const targetMet = winner.byteSize <= targetByteSize;
	const status: OptimizationStatus = targetMet
		? (exhaustedIterationLimit ? 'iteration-limit' : 'target-met')
		: (completedMinimumScaleChecks ? 'impossible-target' : 'iteration-limit');
	return toResult(winner, targetByteSize, status, iterations);
}

function toResult<TValue>(
	candidate: MeasuredCandidate<TValue>,
	targetByteSize: number | null,
	status: OptimizationStatus,
	iterations: number,
): OptimizePdfResult<TValue> {
	return {
		value: candidate.value,
		byteSize: candidate.byteSize,
		quality: candidate.quality,
		scale: candidate.scale,
		qualities: candidate.qualities,
		perImageTargetBytes: candidate.perImageTargetBytes,
		targetByteSize,
		targetMet: targetByteSize === null || candidate.byteSize <= targetByteSize,
		status,
		iterations,
	};
}
