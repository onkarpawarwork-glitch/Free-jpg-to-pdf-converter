/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import { convertImages } from '../../lib/pdf/client';
import type { ConversionProgress, PdfConversionResult, PdfDocumentOutput } from '../../lib/pdf/types';
import { readJpegMetadata } from '../../lib/pdf/image';
import { ConversionResult } from './ConversionResult';
import { ConverterOptions, type SettingsValue } from './ConverterOptions';
import { ImageQueue, type ImageItem } from './ImageQueue';

const MAX_IMAGES = 20;
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
const MAX_CUSTOM_BYTES = 100 * 1024 * 1024;

const INITIAL_SETTINGS: SettingsValue = {
	pageSize: 'a4',
	orientation: 'auto',
	margin: 'small',
	mergeIntoOne: true,
	targetSize: '500kb',
};

function readableSize(bytes: number): string {
	if (bytes <= 0) return '0 KB';
	return bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function customSizeInBytes(value: string, unit: 'kb' | 'mb'): { bytes: number | null; error: string } {
	if (!value.trim()) return { bytes: null, error: 'Enter a custom target size.' };
	const numericValue = Number(value);
	if (!Number.isFinite(numericValue) || numericValue <= 0) return { bytes: null, error: 'Enter a number greater than zero.' };
	if (numericValue < 1) return { bytes: null, error: `Enter at least 1 ${unit.toUpperCase()}.` };
	const multiplier = unit === 'kb' ? 1024 : 1024 * 1024;
	const bytes = Math.round(numericValue * multiplier);
	if (!Number.isSafeInteger(bytes) || bytes > MAX_CUSTOM_BYTES) return { bytes: null, error: 'Custom targets can be up to 100 MB.' };
	if (bytes < 1024) return { bytes: null, error: 'Custom targets must be at least 1 KB.' };
	return { bytes, error: '' };
}

function friendlyError(error: unknown): string {
	const message = error instanceof Error ? error.message : '';
	if (/memory|allocation|too large|safely downsize|canvas/i.test(message)) {
		return 'This image is too large for the available memory. Try a smaller image or convert fewer images at once.';
	}
	if (/JPEG|JPG|image|decode|read/i.test(message)) {
		return 'One of these files could not be read as a JPG or JPEG. Try opening and saving it as a JPEG, then add it again.';
	}
	return 'We could not create the PDF this time. Try fewer or smaller images, or choose a higher target size.';
}

export function ConverterIsland() {
	const [images, setImages] = useState<ImageItem[]>([]);
	const [settings, setSettings] = useState<SettingsValue>(INITIAL_SETTINGS);
	const [customValue, setCustomValue] = useState('500');
	const [customUnit, setCustomUnit] = useState<'kb' | 'mb'>('kb');
	const [isInspecting, setIsInspecting] = useState(false);
	const [isConverting, setIsConverting] = useState(false);
	const [error, setError] = useState('');
	const [status, setStatus] = useState('');
	const [progress, setProgress] = useState<ConversionProgress | null>(null);
	const [result, setResult] = useState<PdfConversionResult | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const imagesRef = useRef<ImageItem[]>([]);
	const mounted = useRef(true);
	const downloadUrls = useRef<Set<string>>(new Set());
	const downloadTimers = useRef<Set<number>>(new Set());
	const custom = customSizeInBytes(customValue, customUnit);
	const totalBytes = images.reduce((sum, image) => sum + image.file.size, 0);
	const busy = isInspecting || isConverting;

	const replaceImages = (next: ImageItem[]) => {
		imagesRef.current = next;
		setImages(next);
	};

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			for (const image of imagesRef.current) URL.revokeObjectURL(image.url);
			for (const url of downloadUrls.current) URL.revokeObjectURL(url);
			for (const timer of downloadTimers.current) window.clearTimeout(timer);
		};
	}, []);

	const openPicker = () => fileInput.current?.click();
	const addMoreImages = () => {
		if (images.length >= MAX_IMAGES) {
			setError(`You can add up to ${MAX_IMAGES} images at a time.`);
			return;
		}
		openPicker();
	};

	const handleFiles = async (files: readonly File[]) => {
		if (!files.length || busy) return;
		setError('');
		setStatus('Checking your images…');
		setIsInspecting(true);
		const accepted: ImageItem[] = [];
		const messages: string[] = [];
		let availableCount = Math.max(0, MAX_IMAGES - images.length);
		let availableBytes = Math.max(0, MAX_TOTAL_BYTES - totalBytes);
		for (const file of files) {
			if (availableCount <= 0) {
				messages.push(`You can add up to ${MAX_IMAGES} images at a time.`);
				break;
			}
			if (!/\.jpe?g$/i.test(file.name) || (file.type && file.type.toLowerCase() !== 'image/jpeg')) {
				messages.push(`${file.name}: choose a JPG or JPEG image.`);
				continue;
			}
			if (file.size > MAX_FILE_BYTES) {
				messages.push(`${file.name}: files must be 30 MB or smaller.`);
				continue;
			}
			if (file.size > availableBytes) {
				messages.push(`${file.name}: the combined image limit is 150 MB.`);
				continue;
			}
			const url = URL.createObjectURL(file);
			try {
				const metadata = await readJpegMetadata({ fileName: file.name, data: file });
				accepted.push({
					id: crypto.randomUUID(),
					file,
					url,
					width: metadata.width,
					height: metadata.height,
					rotation: 0,
				});
				availableCount -= 1;
				availableBytes -= file.size;
			} catch {
				URL.revokeObjectURL(url);
				messages.push(`${file.name}: this file could not be opened as a JPEG.`);
			}
		}
		if (!mounted.current) {
			for (const image of accepted) URL.revokeObjectURL(image.url);
			return;
		}
		if (accepted.length) {
			replaceImages([...images, ...accepted]);
			setResult(null);
		}
		setError(messages.join(' '));
		setStatus(accepted.length ? `${accepted.length} ${accepted.length === 1 ? 'image is' : 'images are'} ready.` : '');
		setIsInspecting(false);
	};

	const onInputChange = (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		if (input.files) void handleFiles(Array.from(input.files));
		input.value = '';
	};

	const removeImage = (id: string) => {
		const removed = images.find((image) => image.id === id);
		if (removed) URL.revokeObjectURL(removed.url);
		replaceImages(images.filter((image) => image.id !== id));
		setResult(null);
		setError('');
	};

	const reorderImages = (sourceId: string, targetId: string) => {
		if (sourceId === targetId) return;
		const next = [...images];
		const from = next.findIndex((image) => image.id === sourceId);
		const to = next.findIndex((image) => image.id === targetId);
		if (from < 0 || to < 0) return;
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		replaceImages(next);
		setResult(null);
	};

	const shiftImage = (id: string, direction: -1 | 1) => {
		const from = images.findIndex((image) => image.id === id);
		const to = from + direction;
		if (from < 0 || to < 0 || to >= images.length) return;
		const next = [...images];
		[next[from], next[to]] = [next[to], next[from]];
		replaceImages(next);
		setResult(null);
	};

	const rotateImage = (id: string, direction: -1 | 1) => {
		replaceImages(images.map((image) => image.id === id
			? { ...image, rotation: ((image.rotation + direction * 90 + 360) % 360) as ImageItem['rotation'] }
			: image));
		setResult(null);
	};

	const onDropFiles = (event: DragEvent) => {
		event.preventDefault();
		if (event.dataTransfer?.files.length) void handleFiles(Array.from(event.dataTransfer.files));
	};

	const startConversion = async () => {
		setError('');
		if (!images.length) {
			setError('Add at least one JPG or JPEG image first.');
			return;
		}
		if (settings.targetSize === 'custom' && custom.error) {
			setError(custom.error);
			return;
		}
		setIsConverting(true);
		setProgress({ phase: 'reading', iteration: 0, maximumIterations: images.length });
		setStatus('Preparing your images for conversion…');
		setResult(null);
		try {
			const conversionOptions = {
				...settings,
				customTargetBytes: settings.targetSize === 'custom' ? custom.bytes ?? undefined : undefined,
				outputName: 'jpg-to-pdf.pdf',
			};
			const conversionImages = images.map((image) => ({
				fileName: image.file.name,
				data: image.file,
				rotationDegrees: image.rotation,
			}));
			const converted = await convertImages(conversionImages, conversionOptions, (nextProgress) => {
				setProgress(nextProgress);
				setStatus(nextProgress.phase === 'optimizing'
					? `Optimizing your PDF · pass ${nextProgress.iteration} of ${nextProgress.maximumIterations}`
					: nextProgress.phase === 'reading' ? `Preparing image ${nextProgress.iteration} of ${images.length}` : 'Your PDF is ready.');
			});
			setResult(converted);
			setStatus(converted.targetMet ? 'Your PDF is ready to download.' : 'The requested target could not be reached. The best result is ready.');
		} catch (conversionError) {
			setError(friendlyError(conversionError));
			setStatus('');
		} finally {
			setProgress(null);
			setIsConverting(false);
		}
	};

	const downloadDocument = (document: PdfDocumentOutput) => {
		const url = URL.createObjectURL(document.pdf);
		downloadUrls.current.add(url);
		const link = window.document.createElement('a');
		link.href = url;
		link.download = document.fileName || 'jpg-to-pdf.pdf';
		link.style.display = 'none';
		window.document.body.append(link);
		link.click();
		link.remove();
		const timer = window.setTimeout(() => {
			URL.revokeObjectURL(url);
			downloadUrls.current.delete(url);
			downloadTimers.current.delete(timer);
		}, 60_000);
		downloadTimers.current.add(timer);
	};

	const startOver = () => {
		for (const image of images) URL.revokeObjectURL(image.url);
		replaceImages([]);
		setSettings(INITIAL_SETTINGS);
		setCustomValue('500');
		setCustomUnit('kb');
		setError('');
		setStatus('');
		setProgress(null);
		setResult(null);
		if (fileInput.current) fileInput.current.value = '';
	};

	const updateSetting = <K extends keyof SettingsValue>(key: K, value: SettingsValue[K]) => {
		setSettings((current) => ({ ...current, [key]: value }));
		setResult(null);
	};

	const customInvalid = settings.targetSize === 'custom' && Boolean(custom.error);
	const convertDisabled = busy || images.length === 0 || customInvalid;
	return (
		<section class="surface-panel overflow-hidden" aria-label="JPG to PDF converter" aria-busy={isConverting}>
			<div class="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-4 sm:px-6">
				<div class="flex items-center gap-3">
					<span class="grid size-10 place-items-center rounded-lg border border-hairline bg-surface-2 text-ink-muted" aria-hidden="true">
						<svg class="size-5" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="3" width="15" height="14" rx="2" stroke="currentColor" stroke-width="1.4"/><circle cx="7" cy="7.5" r="1.5" stroke="currentColor" stroke-width="1.4"/><path d="m3.5 14 4-4 2.5 2 2-1.5 4.5 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</span>
					<div><h2 class="text-sm font-semibold tracking-[-.01em]">Image to PDF</h2><p class="mt-0.5 text-xs text-ink-subtle">Private, on-device conversion</p></div>
				</div>
				<div class="flex items-center gap-2 rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-xs text-ink-muted">
					<span class="size-1.5 rounded-full bg-success" aria-hidden="true"></span>
					<span>{images.length}/{MAX_IMAGES} images · {readableSize(totalBytes)} total</span>
				</div>
			</div>

			<div class="p-4 sm:p-6">
				<input ref={fileInput} class="sr-only" id="jpg-file-input" type="file" accept="image/jpeg,.jpg,.jpeg" multiple onChange={onInputChange} disabled={busy || images.length >= MAX_IMAGES} tabIndex={-1} aria-describedby="upload-help privacy-note" />
				<button
					type="button"
					class="group grid min-h-[168px] w-full place-items-center rounded-xl border border-dashed border-hairline-strong bg-[#0b0c0d] px-4 py-6 text-center transition hover:border-primary hover:bg-[#101116] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[184px]"
					onClick={openPicker}
					onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add('border-primary', 'bg-[#101116]'); }}
					onDragLeave={(event) => event.currentTarget.classList.remove('border-primary', 'bg-[#101116]')}
					onDrop={(event) => { event.currentTarget.classList.remove('border-primary', 'bg-[#101116]'); onDropFiles(event); }}
					disabled={busy || images.length >= MAX_IMAGES}
				>
					<span>
						<span class="mx-auto mb-3 grid size-11 place-items-center rounded-xl border border-hairline-strong bg-surface-2 text-ink-muted transition group-hover:border-primary/50 group-hover:text-white" aria-hidden="true">
							<svg class="size-5" viewBox="0 0 20 20" fill="none"><path d="M10 13V4m0 0L6.5 7.5M10 4l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 12.5v2.2a.8.8 0 0 0 .8.8h9.4a.8.8 0 0 0 .8-.8v-2.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
						</span>
						<span class="block text-sm font-medium text-ink">{isInspecting ? 'Checking your images…' : images.length ? 'Drop more JPG images here' : 'Drop JPG images here to get started'}</span>
						<span id="upload-help" class="mt-1.5 block text-xs text-ink-subtle">or <span class="text-ink-muted underline decoration-hairline-strong underline-offset-4">browse your device</span></span>
						<span class="mt-3 block text-[11px] text-ink-subtle">JPG or JPEG · Up to {MAX_IMAGES} images · 30 MB per image · 150 MB total</span>
					</span>
				</button>
				<p id="privacy-note" class="mt-3 flex items-center justify-center gap-2 text-xs text-ink-subtle"><svg class="size-4 shrink-0 text-ink-muted" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2.5 4 5v4.3c0 3.8 2.6 6.6 6 8.2 3.4-1.6 6-4.4 6-8.2V5l-6-2.5Z" stroke="currentColor" stroke-width="1.4"/><path d="m7.5 9.8 1.7 1.7 3.5-3.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Your files never leave your device.</p>

				{error && <p class="mt-4 rounded-lg border border-[#633638] bg-[#211214] px-3 py-2.5 text-xs leading-5 text-[#ffb3b3]" role="alert">{error}</p>}
				{status && <p class="sr-only" role="status" aria-live="polite">{status}</p>}

				{images.length > 0 && (
					<ImageQueue
						images={images}
						busy={busy}
			onAdd={addMoreImages}
						onRemove={removeImage}
						onMove={reorderImages}
						onShift={shiftImage}
						onRotate={rotateImage}
					/>
				)}

				<ConverterOptions
					value={settings}
					customValue={customValue}
					customUnit={customUnit}
					customTargetBytes={custom.bytes}
					customError={settings.targetSize === 'custom' ? custom.error : ''}
					busy={busy}
					onChange={updateSetting}
					onCustomValue={setCustomValue}
					onCustomUnit={setCustomUnit}
				/>

				<div class="mt-5 flex flex-col gap-3 border-t border-hairline pt-5 sm:flex-row sm:items-center sm:justify-between">
					<p class="flex items-center gap-2 text-xs leading-5 text-ink-subtle"><svg class="size-4 shrink-0 text-ink-muted" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M10 6.5v3.7l2.4 1.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>Target size is a maximum. Image quality is preserved as much as possible.</p>
					<button type="button" class="btn-primary focus-ring min-h-12 w-full text-sm sm:w-auto sm:min-w-[190px]" onClick={() => void startConversion()} disabled={convertDisabled}>
						{isConverting ? <><svg class="size-4 animate-spin" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-opacity=".3" stroke-width="2"/><path d="M17 10a7 7 0 0 0-7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Optimizing PDF…</> : 'Convert to PDF'}
					</button>
				</div>
				{!images.length && <p class="mt-2 text-right text-[11px] text-ink-subtle">Add at least one image to convert.</p>}
				{customInvalid && <p class="mt-2 text-right text-[11px] text-[#ff9b9b]">Fix the custom target size to continue.</p>}

				{isConverting && progress && (
					<div class="mt-4 rounded-xl border border-hairline bg-surface-2 p-4" role="status" aria-live="polite">
						<div class="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
							<p class="font-medium text-ink">{progress.phase === 'reading' ? 'Preparing your images' : 'Optimizing your PDF'}</p>
							<p class="text-ink-subtle">{progress.phase === 'optimizing' ? `Pass ${progress.iteration} of ${progress.maximumIterations}` : `Image ${progress.iteration} of ${images.length}`}</p>
						</div>
						<div class="h-1.5 overflow-hidden rounded-full bg-[#292a2f]" role="progressbar" aria-label="PDF conversion progress" aria-valuemin={0} aria-valuemax={progress.maximumIterations} aria-valuenow={progress.iteration}>
							<div class="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(8, (progress.iteration / Math.max(1, progress.maximumIterations)) * 100)}%` }}></div>
						</div>
						<p class="mt-2 text-[11px] leading-5 text-ink-subtle">Your images are processed privately in this browser. Please keep this tab open.</p>
					</div>
				)}

				{result && !isConverting && <ConversionResult result={result} onDownload={downloadDocument} onStartOver={startOver} />}
			</div>
		</section>
	);
}

export default ConverterIsland;
