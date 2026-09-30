import { describe, expect, it } from 'vitest';
import { allocateImageBudgets, JPEG_QUALITY_MAX, optimizePdf } from './optimizer';

interface TestImage {
	pixelArea: number;
	id: string;
}

interface TestPdf {
	qualities: readonly number[];
	scale: number;
	budgets: readonly number[] | null;
}

const oneImage: TestImage[] = [{ pixelArea: 1_000, id: 'one.jpg' }];

function builder(sizeFor: (request: { qualities: readonly number[]; scale: number }) => number) {
	return async ({ qualities, scale, perImageTargetBytes }: {
		qualities: readonly number[];
		scale: number;
		perImageTargetBytes: readonly number[] | null;
	}): Promise<{ value: TestPdf; byteSize: number }> => ({
		value: { qualities, scale, budgets: perImageTargetBytes },
		byteSize: sizeFor({ qualities, scale }),
	});
}

describe('optimizePdf', () => {
	it('keeps maximum quality when the first candidate already meets the target', async () => {
		const result = await optimizePdf({
			images: oneImage,
			targetByteSize: 20_000,
			buildCandidate: builder(() => 5_000),
		});

		expect(result.targetMet).toBe(true);
		expect(result.status).toBe('target-met');
		expect(result.quality).toBe(JPEG_QUALITY_MAX);
		expect(result.scale).toBe(1);
		expect(result.iterations).toBe(1);
		expect(result.byteSize).toBe(5_000);
	});

	it('uses binary search to find the highest measured quality under the target', async () => {
		const result = await optimizePdf({
			images: oneImage,
			targetByteSize: 2_300,
			buildCandidate: builder(({ qualities }) => Math.round(1_000 + 2_000 * qualities[0])),
		});

		expect(result.targetMet).toBe(true);
		expect(result.quality).toBeGreaterThan(0.6);
		expect(result.quality).toBeLessThan(0.7);
		expect(result.byteSize).toBeLessThanOrEqual(2_300);
		expect(result.iterations).toBeGreaterThan(2);
	});

	it('reduces image scale when minimum quality at full scale is still too large', async () => {
		const result = await optimizePdf({
			images: oneImage,
			targetByteSize: 2_100,
			buildCandidate: builder(({ qualities, scale }) => Math.round(1_000 + 4_000 * scale * qualities[0])),
		});

		expect(result.targetMet).toBe(true);
		expect(result.scale).toBe(0.85);
		expect(result.byteSize).toBeLessThanOrEqual(2_100);
	});

	it('allocates the byte budget by image pixel area', () => {
		const budgets = allocateImageBudgets(10_000, [1, 3]);

		expect(budgets.reduce((sum, budget) => sum + budget, 0)).toBeCloseTo(10_000);
		expect(budgets[1]).toBeGreaterThan(budgets[0]);
		expect(budgets[1] / budgets[0]).toBeCloseTo(6988 / 3012, 1);
	});

	it('returns the smallest measured candidate and reports an impossible target', async () => {
		const result = await optimizePdf({
			images: oneImage,
			targetByteSize: 100,
			buildCandidate: builder(({ qualities, scale }) => Math.round(10_000 * qualities[0] * scale)),
		});

		expect(result.status).toBe('impossible-target');
		expect(result.targetMet).toBe(false);
		expect(result.scale).toBe(0.55);
		expect(result.quality).toBe(0.3);
		expect(result.byteSize).toBe(1_650);
	});

	it('builds a maximum-quality PDF once in no-limit mode', async () => {
		const qualities: number[] = [];
		const result = await optimizePdf({
			images: oneImage,
			targetByteSize: null,
			buildCandidate: async ({ qualities: candidateQualities, scale, perImageTargetBytes }) => {
				qualities.push(...candidateQualities);
				return { value: { qualities: candidateQualities, scale, budgets: perImageTargetBytes }, byteSize: 12_000 };
			},
		});

		expect(result.status).toBe('no-limit');
		expect(result.targetMet).toBe(true);
		expect(result.targetByteSize).toBeNull();
		expect(qualities).toEqual([JPEG_QUALITY_MAX]);
		expect(result.iterations).toBe(1);
	});

	it('honors the iteration limit and reports the best candidate measured so far', async () => {
		const result = await optimizePdf({
			images: oneImage,
			targetByteSize: 1,
			maxIterations: 2,
			buildCandidate: builder(() => 10_000),
		});

		expect(result.status).toBe('iteration-limit');
		expect(result.targetMet).toBe(false);
		expect(result.iterations).toBe(2);
		expect(result.byteSize).toBe(10_000);
	});

	it('returns optimization metadata for the chosen candidate', async () => {
		const result = await optimizePdf({
			images: [{ pixelArea: 2_500, id: 'metadata.jpg' }],
			targetByteSize: 5_000,
			buildCandidate: builder(() => 4_000),
		});

		expect(result).toMatchObject({
			byteSize: 4_000,
			targetByteSize: 5_000,
			targetMet: true,
			quality: JPEG_QUALITY_MAX,
			scale: 1,
			status: 'target-met',
			iterations: 1,
		});
		expect(result.perImageTargetBytes).toHaveLength(1);
	});
});
