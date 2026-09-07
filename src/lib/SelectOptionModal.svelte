<script>
	/**
	 * SelectOptionModal component for selecting Mood or Tag in ChronoMuse theme.
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
		class="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-pink-950/40 backdrop-blur-xs transition-all duration-200"
		onclick={onClose}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Escape' && onClose()}
	>
		<!-- Modal Dialog Container -->
		<div 
			class="bg-white/95 backdrop-blur-md rounded-2xl sm:rounded-3xl w-full max-w-xs sm:max-w-sm max-h-[80vh] flex flex-col shadow-2xl overflow-hidden border-2 border-pink-200 animate-in fade-in zoom-in-95 duration-200"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
		>
			<!-- Header -->
			<div class="bg-gradient-to-r from-pink-50 via-pink-100/50 to-pink-50 px-5 py-3.5 border-b border-pink-200 flex items-center justify-between flex-shrink-0">
				<h3 class="text-base font-bold text-pink-700 flex items-center space-x-2">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-500">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
					<span>{title}</span>
				</h3>
				<button
					type="button"
					onclick={onClose}
					class="p-1 text-pink-400 hover:text-pink-600 hover:bg-pink-100 rounded-lg transition-colors cursor-pointer"
					title="Close"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Options List -->
			<div class="overflow-y-auto divide-y divide-pink-100 py-1">
				<!-- Default Reset Option -->
				{#if defaultOption || title}
					{@const isDefaultSelected = selectedValue === '' || selectedValue === null || selectedValue === undefined}
					<button
						type="button"
						onclick={() => handleSelect('')}
						class="w-full px-5 py-3 flex items-center justify-between text-left transition-colors hover:bg-pink-50/70 cursor-pointer"
					>
						<span class="text-xs sm:text-sm font-semibold text-pink-900">{defaultOption || title}</span>
						<div class="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all {isDefaultSelected ? 'border-pink-500 bg-pink-50 shadow-xs' : 'border-pink-200 bg-white'}">
							{#if isDefaultSelected}
								<div class="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-pink-500 to-pink-600"></div>
							{/if}
						</div>
					</button>
				{/if}

				{#each options as option}
					{@const isSelected = selectedValue?.toLowerCase() === option?.toLowerCase()}
					<button
						type="button"
						onclick={() => handleSelect(option)}
						class="w-full px-5 py-3 flex items-center justify-between text-left transition-colors hover:bg-pink-50/70 cursor-pointer"
					>
						<span class="text-xs sm:text-sm font-semibold text-pink-900">{option}</span>
						<div class="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all {isSelected ? 'border-pink-500 bg-pink-50 shadow-xs' : 'border-pink-200 bg-white'}">
							{#if isSelected}
								<div class="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-pink-500 to-pink-600"></div>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}
