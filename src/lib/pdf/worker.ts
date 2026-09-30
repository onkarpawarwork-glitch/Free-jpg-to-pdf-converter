import { runConversion } from './index';
import type { ConversionWorkerRequest, ConversionWorkerResponse } from './types';

const scope = globalThis as unknown as {
	addEventListener(type: 'message', listener: (event: MessageEvent<ConversionWorkerRequest>) => void): void;
	postMessage(message: ConversionWorkerResponse): void;
};

scope.addEventListener('message', (event) => {
	const request = event.data;
	void runConversion(request.images, request.options, (progress) => {
		scope.postMessage({ requestId: request.requestId, type: 'progress', progress });
	}).then((result) => {
		scope.postMessage({ requestId: request.requestId, type: 'result', result });
	}).catch((error: unknown) => {
		const message = error instanceof Error ? error.message : 'The PDF could not be created.';
		scope.postMessage({ requestId: request.requestId, type: 'error', message });
	});
});
