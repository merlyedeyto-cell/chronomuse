<script>
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

	function handleSelect(val) {
		if (onSelect) onSelect(val);
		if (onClose) onClose();
	}
</script>

{#if isOpen}
	<div 
		class="fixed inset-0 z-[110] bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans"
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
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 h-3.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
					</div>
					<h3 class="text-xs sm:text-sm font-black text-pink-950">{title}</h3>
				</div>
				<button
					type="button"
					onclick={onClose}
					class="w-6 h-6 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] flex items-center justify-center transition-colors cursor-pointer"
					title="Close"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
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
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-3 h-3 text-white flex-shrink-0 ml-1">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
							</svg>
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
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-3 h-3 text-white flex-shrink-0 ml-1">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
							</svg>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}
