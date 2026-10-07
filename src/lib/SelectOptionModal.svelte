<script>
	import { Settings, X, Check } from 'lucide-svelte';

	/**
	 * SelectOptionModal component matching the exact layout and design of the Month selection popup:
	 * - Transparent backdrop (no dark blur overlay)
	 * - 2-column grid of rounded pill buttons
	 * - Pink gradient active state with checkmark icon
	 */
	let {
		isOpen = false,
		title = 'Select Option',
		options = [],
		selectedValue = '',
		defaultOption = '',
		onSelect,
		onClose
	} = $props();

	$effect(() => {
		if (isOpen) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
		};
	});

	function handleSelect(val) {
		if (onSelect) onSelect(val);
		if (onClose) onClose();
	}
</script>

{#if isOpen}
	<div 
		class="fixed inset-0 z-[110] bg-transparent flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans"
		onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Escape' && onClose()}
	>
		<!-- Modal Content Box matching Month popup -->
		<div 
			class="bg-white border border-pink-100 rounded-3xl p-4 sm:p-5 max-w-xs sm:max-w-sm w-full space-y-3 animate-modal-content max-h-[85vh] flex flex-col shadow-2xl my-auto"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-pink-100 pb-2 flex-shrink-0">
				<div class="flex items-center space-x-2">
					<div class="w-6 h-6 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
						<Settings class="w-3.5 h-3.5" />
					</div>
					<h3 class="text-xs sm:text-sm font-black text-pink-950">{title}</h3>
				</div>
				<button
					type="button"
					onclick={onClose}
					class="w-6 h-6 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] flex items-center justify-center transition-colors cursor-pointer"
					title="Close"
				>
					<X class="w-3.5 h-3.5" />
				</button>
			</div>

			<!-- Options Grid matching Month popup format -->
			<div class="grid grid-cols-2 gap-1.5 p-0.5 overflow-y-auto flex-1">
				<!-- Default Reset / Option -->
				{#if defaultOption || title}
					{@const isDefaultSelected = selectedValue === '' || selectedValue === null || selectedValue === undefined}
					<button
						type="button"
						onclick={() => handleSelect('')}
						class="py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-between border col-span-2 {isDefaultSelected ? 'bg-[#f43f8e] text-white border-[#e0337f] shadow-xs' : 'bg-[#fdf2f6]/70 hover:bg-pink-100 text-pink-950 border-pink-100'}"
					>
						<span class="truncate">{defaultOption || title}</span>
						{#if isDefaultSelected}
							<Check class="w-3 h-3 text-white flex-shrink-0 ml-1" strokeWidth={3} />
						{/if}
					</button>
				{/if}

				{#each options as option}
					{@const isSelected = selectedValue?.toLowerCase() === option?.toLowerCase()}
					<button
						type="button"
						onclick={() => handleSelect(option)}
						class="py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-between border {isSelected ? 'bg-[#f43f8e] text-white border-[#e0337f] shadow-xs' : 'bg-[#fdf2f6]/70 hover:bg-pink-100 text-pink-950 border-pink-100'}"
					>
						<span class="truncate">{option}</span>
						{#if isSelected}
							<Check class="w-3 h-3 text-white flex-shrink-0 ml-1" strokeWidth={3} />
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}
