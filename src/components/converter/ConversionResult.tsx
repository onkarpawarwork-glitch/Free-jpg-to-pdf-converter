/** @jsxImportSource preact */
import type { PdfConversionResult, PdfDocumentOutput } from '../../lib/pdf/types';

interface Props {
	result: PdfConversionResult;
	onDownload: (document: PdfDocumentOutput) => void;
	onStartOver: () => void;
}

function formatSize(bytes: number): string {
	if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / 1_048_576).toFixed(2)} MB`;
}

export function ConversionResult({ result, onDownload, onStartOver }: Props) {
	const target = result.targetByteSize === null ? 'No size limit' : `${formatSize(result.targetByteSize)} target`;
	const fileCount = result.images.length;
	const notMet = result.targetByteSize !== null && !result.targetMet;
	return (
		<section class="mt-5 rounded-xl border border-[#34463b] bg-[#101511] p-4 sm:p-5" aria-labelledby="result-heading" aria-live="polite" tabIndex={-1}>
			<div class="flex items-start gap-3">
				<span class="grid size-10 shrink-0 place-items-center rounded-full border border-[#34503e] bg-[#18231b] text-[#8bd3a0]" aria-hidden="true">
					{result.targetMet ? <svg class="size-5" viewBox="0 0 20 20" fill="none"><path d="m4.5 10.2 3.5 3.4 7.5-7.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg> : <span class="text-lg">!</span>}
				</span>
				<div class="min-w-0 flex-1">
					<h3 id="result-heading" class="text-base font-semibold tracking-[-.01em] text-ink">PDF ready</h3>
					<p class="mt-1 text-sm text-ink-muted">{formatSize(result.finalByteSize)} / {target}</p>
					<p class="mt-1 text-xs text-ink-subtle">{result.pageCount} {result.pageCount === 1 ? 'page' : 'pages'} · {result.jpegQuality.toFixed(2)} JPEG quality</p>
				</div>
			</div>

			{notMet && (
				<div class="mt-4 rounded-lg border border-[#58443a] bg-[#211a16] p-3 text-xs leading-5 text-[#e6c0a6]">
					{result.optimizationStatus === 'impossible-target'
						? `Smallest achievable is ${formatSize(result.finalByteSize)} for ${fileCount} ${fileCount === 1 ? 'image' : 'images'}. Remove images or choose a higher limit.`
						: `The target was not reached within the optimization limit. The best result found is ${formatSize(result.finalByteSize)}. Choose a higher limit to meet the target.`}
				</div>
			)}
			{result.targetMet && result.targetByteSize !== null && <p class="mt-3 text-xs text-[#8bd3a0]">The requested maximum size was met.</p>}
			{result.optimizationStatus === 'no-limit' && <p class="mt-3 text-xs text-ink-subtle">Created at high quality with no target size.</p>}

			<div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
				{result.documents.length === 1 ? (
					<button type="button" class="btn-primary focus-ring min-h-11 w-full sm:w-auto" onClick={() => onDownload(result.documents[0])}>
						<svg class="size-4" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3.5v9m0 0 3.5-3.5M10 12.5 6.5 9M4 13.5v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
						Download PDF
					</button>
				) : <p class="text-xs text-ink-muted">Download each PDF below</p>}
				<button type="button" class="btn-secondary focus-ring min-h-11 w-full sm:w-auto" onClick={onStartOver}>Start over</button>
			</div>
			{result.documents.length > 1 && (
				<ul class="mt-4 divide-y divide-hairline rounded-lg border border-hairline bg-surface-1" aria-label="PDF downloads">
					{result.documents.map((document) => (
						<li key={document.fileName} class="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
							<span class="min-w-0 flex-1 truncate text-xs text-ink-muted">{document.fileName} <span class="text-ink-subtle">· {formatSize(document.byteSize)}</span></span>
							<button type="button" class="focus-ring min-h-10 rounded-lg px-3 text-xs font-medium text-primary-hover hover:bg-surface-3" onClick={() => onDownload(document)}>Download</button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
