import type {
	ConversionProgressCallback,
	ConversionWorkerRequest,
	ConversionWorkerResponse,
	PdfConversionOptions,
	PdfConversionResult,
	PdfImageInput,
} from './types';

async function runOnMainThread(
	images: readonly PdfImageInput[],
	options: PdfConversionOptions,
	progress?: ConversionProgressCallback,
): Promise<PdfConversionResult> {
	const engine = await import('./index');
	return engine.runConversion(images, options, progress);
}

export function convertImages(
	images: readonly PdfImageInput[],
	options: PdfConversionOptions,
	progress?: ConversionProgressCallback,
): Promise<PdfConversionResult> {
	if (!images.length) return Promise.reject(new RangeError('Choose at least one JPG or JPEG image.'));
	if (typeof OffscreenCanvas === 'undefined') return runOnMainThread(images, options, progress);

	let worker: Worker;
	try {
		worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'jpg-to-pdf-converter' });
	} catch {
		return runOnMainThread(images, options, progress);
	}
	const requestId = crypto.randomUUID();
	const request: ConversionWorkerRequest = { requestId, images, options };
	return new Promise((resolve, reject) => {
		const finish = () => worker.terminate();
		worker.addEventListener('message', (event: MessageEvent<ConversionWorkerResponse>) => {
			const response = event.data;
			if (response.requestId !== requestId) return;
			if (response.type === 'progress') {
				progress?.(response.progress);
				return;
			}
			finish();
			if (response.type === 'result') resolve(response.result);
			else reject(new Error(response.message));
		});
		worker.addEventListener('error', (event) => {
			finish();
			if (event.message) reject(new Error(event.message));
			else void runOnMainThread(images, options, progress).then(resolve, reject);
		}, { once: true });
		worker.postMessage(request);
	});
}
