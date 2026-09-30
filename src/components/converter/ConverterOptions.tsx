/** @jsxImportSource preact */
import type { PageMargin, PageOrientation, PageSize, TargetSizePreset } from '../../lib/pdf/types';

export interface SettingsValue {
	pageSize: PageSize;
	orientation: PageOrientation;
	margin: PageMargin;
	mergeIntoOne: boolean;
	targetSize: TargetSizePreset;
}

interface Props {
	value: SettingsValue;
	customValue: string;
	customUnit: 'kb' | 'mb';
	customTargetBytes: number | null;
	customError: string;
	busy: boolean;
	onChange: <K extends keyof SettingsValue>(key: K, value: SettingsValue[K]) => void;
	onCustomValue: (value: string) => void;
	onCustomUnit: (unit: 'kb' | 'mb') => void;
}

const selectClasses = 'focus-ring mt-2 h-11 w-full rounded-lg border border-hairline-strong bg-surface-2 px-3 text-sm text-ink';

function TargetLabel({ targetSize, customTargetBytes }: { targetSize: TargetSizePreset; customTargetBytes: number | null }) {
	if (targetSize === 'none') return <>No size limit</>;
	if (targetSize === 'custom') {
		if (!customTargetBytes) return <>Enter a custom maximum file size</>;
		return <>Custom maximum: {customTargetBytes >= 1_048_576 ? `${(customTargetBytes / 1_048_576).toFixed(2)} MB` : `${(customTargetBytes / 1024).toFixed(0)} KB`}</>;
	}
	const labels: Record<Exclude<TargetSizePreset, 'custom' | 'none'>, string> = {
		'200kb': '200 KB maximum',
		'500kb': '500 KB maximum',
		'1mb': '1 MB maximum',
		'2mb': '2 MB maximum',
	};
	return <>{labels[targetSize]}</>;
}

export function ConverterOptions({ value, customValue, customUnit, customTargetBytes, customError, busy, onChange, onCustomValue, onCustomUnit }: Props) {
	return (
		<section class="mt-6 rounded-xl border border-hairline bg-[#0b0c0d] p-4 sm:p-5" aria-labelledby="settings-heading">
			<div class="mb-4">
				<h3 id="settings-heading" class="text-sm font-semibold text-ink">PDF settings</h3>
				<p class="mt-1 text-xs leading-5 text-ink-subtle">Choose how your pages should look and set a maximum file size.</p>
			</div>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<label class="block text-xs font-medium text-ink-muted">Page size
					<select class={selectClasses} value={value.pageSize} onChange={(event) => onChange('pageSize', event.currentTarget.value as PageSize)} disabled={busy}>
						<option value="a4">A4</option><option value="letter">Letter</option><option value="fit">Fit to image</option>
					</select>
				</label>
				<label class="block text-xs font-medium text-ink-muted">Orientation
					<select class={selectClasses} value={value.orientation} onChange={(event) => onChange('orientation', event.currentTarget.value as PageOrientation)} disabled={busy}>
						<option value="auto">Auto</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option>
					</select>
				</label>
				<label class="block text-xs font-medium text-ink-muted">Page margin
					<select class={selectClasses} value={value.margin} onChange={(event) => onChange('margin', event.currentTarget.value as PageMargin)} disabled={busy}>
						<option value="none">None</option><option value="small">Small</option><option value="big">Big</option>
					</select>
				</label>
				<label class="block text-xs font-medium text-ink-muted">Maximum PDF size
					<select class={selectClasses} value={value.targetSize} onChange={(event) => onChange('targetSize', event.currentTarget.value as TargetSizePreset)} disabled={busy}>
						<option value="200kb">200 KB</option><option value="500kb">500 KB</option><option value="1mb">1 MB</option><option value="2mb">2 MB</option><option value="custom">Custom</option><option value="none">No limit</option>
					</select>
				</label>
			</div>

			{value.targetSize === 'custom' && (
				<div class="mt-4 rounded-lg border border-hairline bg-surface-1 p-3 sm:max-w-[360px]">
					<label for="custom-target" class="mb-2 block text-xs font-medium text-ink-muted">Custom maximum file size</label>
					<div class="flex gap-2">
						<input id="custom-target" class="focus-ring h-11 min-w-0 flex-1 rounded-lg border border-hairline-strong bg-surface-2 px-3 text-sm text-ink" type="number" inputMode="decimal" min="1" max={customUnit === 'kb' ? 102400 : 100} step="any" value={customValue} onInput={(event) => onCustomValue(event.currentTarget.value)} aria-invalid={Boolean(customError)} aria-describedby={customError ? 'custom-target-error custom-target-hint' : 'custom-target-hint'} disabled={busy} />
						<select class="focus-ring h-11 rounded-lg border border-hairline-strong bg-surface-2 px-3 text-sm text-ink" aria-label="Custom size unit" value={customUnit} onChange={(event) => onCustomUnit(event.currentTarget.value as 'kb' | 'mb')} disabled={busy}>
							<option value="kb">KB</option><option value="mb">MB</option>
						</select>
					</div>
					{customError && <p id="custom-target-error" class="mt-2 text-xs text-[#ff9b9b]" role="alert">{customError}</p>}
					<p id="custom-target-hint" class="mt-2 text-[11px] leading-5 text-ink-subtle">Enter a value from 1 KB to 100 MB. <TargetLabel targetSize={value.targetSize} customTargetBytes={customTargetBytes} />.</p>
				</div>
			)}

			<div class="mt-4 flex flex-col gap-3 border-t border-hairline pt-4 sm:flex-row sm:items-center sm:justify-between">
				<label class="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink-muted">
					<input class="size-4 accent-primary" type="checkbox" checked={value.mergeIntoOne} onChange={(event) => onChange('mergeIntoOne', event.currentTarget.checked)} disabled={busy} />
					<span>Merge all images into one PDF</span>
				</label>
				<p class="text-xs text-ink-subtle">Selected target: <span class="font-medium text-ink-muted"><TargetLabel targetSize={value.targetSize} customTargetBytes={customTargetBytes} /></span></p>
			</div>
		</section>
	);
}
