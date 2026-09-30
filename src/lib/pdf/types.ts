export type PageSize = 'a4' | 'letter' | 'fit';
export type PageOrientation = 'auto' | 'portrait' | 'landscape';
export type PageMargin = 'none' | 'small' | 'big';
export type TargetSizePreset = '200kb' | '500kb' | '1mb' | '2mb' | 'custom' | 'none';

export interface PdfImageInput {
	fileName: string;
	data: Blob;
	rotationDegrees?: 0 | 90 | 180 | 270;
}

export interface PdfConversionOptions {
	pageSize: PageSize;
	orientation: PageOrientation;
	margin: PageMargin;
	mergeIntoOne: boolean;
	targetSize: TargetSizePreset;
	customTargetBytes?: number;
	outputName?: string;
}

export type OptimizationStatus = 'no-limit' | 'target-met' | 'impossible-target' | 'iteration-limit';

export interface PdfImageOptimization {
	fileName: string;
	pixelArea: number;
	targetBytes: number | null;
	quality: number;
	scale: number;
}

export interface PdfDocumentOutput {
	fileName: string;
	pdf: Blob;
	byteSize: number;
}

export interface PdfConversionResult {
	/** The merged PDF, or the first PDF when mergeIntoOne is false. */
	pdf: Blob;
	/** Contains one item for a merged result, or one PDF per input image. */
	documents: readonly PdfDocumentOutput[];
	finalByteSize: number;
	finalSizeKB: number;
	finalSizeMB: number;
	targetByteSize: number | null;
	targetMet: boolean;
	jpegQuality: number;
	imageScale: number;
	pageCount: number;
	optimizationStatus: OptimizationStatus;
	iterations: number;
	images: readonly PdfImageOptimization[];
}

export type ConversionPhase = 'reading' | 'optimizing' | 'complete';

export interface ConversionProgress {
	phase: ConversionPhase;
	iteration: number;
	maximumIterations: number;
	imageScale?: number;
	jpegQuality?: number;
	candidateByteSize?: number;
	targetByteSize?: number | null;
}

export type ConversionProgressCallback = (progress: ConversionProgress) => void;

export interface ConversionWorkerRequest {
	requestId: string;
	images: readonly PdfImageInput[];
	options: PdfConversionOptions;
}

export type ConversionWorkerResponse =
	| { requestId: string; type: 'progress'; progress: ConversionProgress }
	| { requestId: string; type: 'result'; result: PdfConversionResult }
	| { requestId: string; type: 'error'; message: string };
