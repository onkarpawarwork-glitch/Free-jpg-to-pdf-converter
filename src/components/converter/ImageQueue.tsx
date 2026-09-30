/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

export interface ImageItem {
	id: string;
	file: File;
	url: string;
	width: number;
	height: number;
	rotation: 0 | 90 | 180 | 270;
}

interface Props {
	images: readonly ImageItem[];
	busy: boolean;
	onAdd: () => void;
	onRemove: (id: string) => void;
	onMove: (sourceId: string, targetId: string) => void;
	onShift: (id: string, direction: -1 | 1) => void;
	onRotate: (id: string, direction: -1 | 1) => void;
}

function formatSize(bytes: number): string {
	if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function ImageQueue({ images, busy, onAdd, onRemove, onMove, onShift, onRotate }: Props) {
	const [draggedId, setDraggedId] = useState<string | null>(null);
	return (
		<section class="mt-5" aria-labelledby="image-list-heading">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
				<div>
					<h3 id="image-list-heading" class="text-sm font-semibold text-ink">Images <span class="ml-1 text-ink-subtle">({images.length})</span></h3>
					<p class="mt-1 text-xs text-ink-subtle">Drag to arrange. Use the arrows to reorder with a keyboard or touch.</p>
				</div>
				<button type="button" class="btn-secondary focus-ring min-h-11" onClick={onAdd} disabled={busy}>
					<span aria-hidden="true" class="mr-2 text-base">+</span>Add images
				</button>
			</div>
			<ol class="space-y-2" aria-label="Images in PDF order">
				{images.map((image, index) => {
					const isSideways = image.rotation === 90 || image.rotation === 270;
					const shownWidth = isSideways ? image.height : image.width;
					const shownHeight = isSideways ? image.width : image.height;
					return (
						<li
							key={image.id}
							draggable={!busy}
							class={`group flex items-center gap-3 rounded-xl border bg-surface-2 p-3 sm:gap-4 ${draggedId === image.id ? 'border-primary' : 'border-hairline'}`}
							onDragStart={(event: JSX.TargetedDragEvent<HTMLLIElement>) => {
								setDraggedId(image.id);
								event.dataTransfer?.setData('text/plain', image.id);
								event.dataTransfer?.setDragImage(event.currentTarget, 24, 24);
							}}
							onDragEnd={() => setDraggedId(null)}
							onDragOver={(event: JSX.TargetedDragEvent<HTMLLIElement>) => event.preventDefault()}
							onDrop={(event: JSX.TargetedDragEvent<HTMLLIElement>) => {
								event.preventDefault();
								const sourceId = event.dataTransfer?.getData('text/plain');
								if (sourceId) onMove(sourceId, image.id);
								setDraggedId(null);
							}}
						>
							<span class="hidden select-none text-ink-tertiary sm:inline" aria-hidden="true">⠿</span>
							<div class="grid size-[58px] shrink-0 place-items-center overflow-hidden rounded-lg border border-hairline bg-[#090a0b]">
								<img
									src={image.url}
									alt={`Preview of ${image.file.name}`}
									class="max-h-full max-w-full object-contain"
									style={{ transform: `rotate(${image.rotation}deg)` }}
									loading="lazy"
								/>
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-xs font-medium text-ink sm:text-sm">{image.file.name}</p>
								<p class="mt-1 text-[11px] text-ink-subtle">{shownWidth} × {shownHeight} px <span aria-hidden="true">·</span> {formatSize(image.file.size)}</p>
								<p class="mt-1 text-[11px] text-ink-subtle">Page {String(index + 1).padStart(2, '0')}</p>
							</div>
							<div class="flex shrink-0 items-center gap-1">
								<button type="button" class="focus-ring grid size-10 place-items-center rounded-lg text-ink-subtle transition hover:bg-surface-3 hover:text-ink disabled:opacity-40" aria-label={`Rotate ${image.file.name} left`} title="Rotate left" onClick={() => onRotate(image.id, -1)} disabled={busy}>
									<svg class="size-[18px]" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.4 8A6 6 0 1 1 4 12M4.4 8V4.8M4.4 8h3.2M10 7v3.5l2.4 1.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
								</button>
								<button type="button" class="focus-ring grid size-10 place-items-center rounded-lg text-ink-subtle transition hover:bg-surface-3 hover:text-ink disabled:opacity-40" aria-label={`Rotate ${image.file.name} right`} title="Rotate right" onClick={() => onRotate(image.id, 1)} disabled={busy}>
									<svg class="size-[18px] -scale-x-100" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.4 8A6 6 0 1 1 4 12M4.4 8V4.8M4.4 8h3.2M10 7v3.5l2.4 1.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
								</button>
								<div class="flex items-center">
									<button type="button" class="focus-ring grid size-10 place-items-center rounded-lg text-ink-subtle transition hover:bg-surface-3 hover:text-ink disabled:opacity-40" aria-label={`Move ${image.file.name} up`} title="Move up" onClick={() => onShift(image.id, -1)} disabled={busy || index === 0}><span aria-hidden="true">↑</span></button>
									<button type="button" class="focus-ring grid size-10 place-items-center rounded-lg text-ink-subtle transition hover:bg-surface-3 hover:text-ink disabled:opacity-40" aria-label={`Move ${image.file.name} down`} title="Move down" onClick={() => onShift(image.id, 1)} disabled={busy || index === images.length - 1}><span aria-hidden="true">↓</span></button>
								</div>
								<button type="button" class="focus-ring grid size-10 place-items-center rounded-lg text-ink-subtle transition hover:bg-[#351c20] hover:text-white disabled:opacity-40" aria-label={`Remove ${image.file.name}`} title="Remove image" onClick={() => onRemove(image.id)} disabled={busy}>
									<svg class="size-[18px]" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
								</button>
							</div>
						</li>
					);
				})}
			</ol>
			{images.length > 1 && <p class="sr-only" aria-live="polite">{images.length} images are arranged in conversion order.</p>}
		</section>
	);
}
