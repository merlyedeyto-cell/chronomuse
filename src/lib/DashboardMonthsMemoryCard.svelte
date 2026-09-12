<script>
	import { onMount, createEventDispatcher } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { playClickSound } from '$lib/soundEffects.js';

	const dispatch = createEventDispatcher();

	let {
		userId = null,
		currentYear = new Date().getFullYear(),
		currentMonth = new Date().getMonth()
	} = $props();

	let allMemories = $state([]);
	let isLoading = $state(true);

	const monthNames = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];

	const monthShortNames = [
		'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
		'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
	];

	$effect(() => {
		if (userId) {
			loadAllMemories();
		}
	});

	onMount(() => {
		if (userId) {
			loadAllMemories();
		}

		const handleMemoryChange = () => {
			if (userId) loadAllMemories();
		};

		window.addEventListener('chronomuse_memory_change', handleMemoryChange);
		return () => {
			window.removeEventListener('chronomuse_memory_change', handleMemoryChange);
		};
	});

	async function loadAllMemories() {
		if (!userId) return;
		try {
			const res = await fetch(`${API_ENDPOINTS.getMoodData}?user_id=${userId}&period=all`, { cache: 'no-store' });
			const data = await res.json();
			if (data.success && Array.isArray(data.data)) {
				allMemories = data.data;
			}
		} catch (err) {
			console.error('Error loading memories for month card:', err);
		} finally {
			isLoading = false;
		}
	}

	// Calculate stats and filter ONLY months with memories for currentYear
	let monthlyStats = $derived.by(() => {
		const counts = Array(12).fill(0);
		const yearStr = String(currentYear);

		(allMemories || []).forEach(m => {
			const dateStr = m.date || (m.created_at ? m.created_at.split('T')[0] : '');
			if (dateStr && dateStr.startsWith(`${yearStr}-`)) {
				const parts = dateStr.split('-');
				if (parts.length >= 2) {
					const mIndex = parseInt(parts[1], 10) - 1;
					if (mIndex >= 0 && mIndex < 12) {
						counts[mIndex]++;
					}
				}
			}
		});

		return counts.map((count, index) => ({
			index,
			name: monthNames[index],
			shortName: monthShortNames[index],
			count,
			hasMemories: count > 0,
			isCurrentSelected: currentMonth === index
		}));
	});

	// Only show months that have memories
	let displayedMonths = $derived(
		monthlyStats.filter(m => m.hasMemories)
	);

	let totalMemoriesInYear = $derived(
		displayedMonths.reduce((sum, m) => sum + m.count, 0)
	);

	let monthsWithMemoriesCount = $derived(
		displayedMonths.length
	);

	function handleMonthClick(monthIndex) {
		playClickSound();
		dispatch('monthSelected', { month: monthIndex, year: currentYear });
	}
</script>

<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] transition-all duration-300 hover:border-pink-200">
	<!-- Header -->
	<div class="flex items-center justify-between mb-3 border-b border-pink-100 pb-3">
		<div class="flex items-center space-x-2.5">
			<div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#f43f8e] to-[#ec4899] text-white flex items-center justify-center shadow-xs flex-shrink-0">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
				</svg>
			</div>
			<div>
				<h3 class="text-xs sm:text-sm font-black text-pink-950">Months with Memories</h3>
				<p class="text-[10px] sm:text-[11px] text-pink-400 font-bold">Quick navigate by month</p>
			</div>
		</div>

		<!-- Year Badge (Synced with Main Calendar) -->
		<div class="flex items-center px-3 py-1 bg-pink-50 text-[#f43f8e] font-black text-xs sm:text-sm rounded-xl border border-pink-200 shadow-2xs select-none">
			{currentYear}
		</div>
	</div>

	<!-- Status & Summary Badge -->
	<div class="flex items-center justify-between mb-3 text-[11px]">
		<div class="flex items-center gap-1.5 flex-wrap">
			<span class="px-2.5 py-0.5 rounded-full font-black bg-pink-50 text-[#f43f8e] border border-pink-200 shadow-2xs inline-flex items-center gap-1">
				<span class="w-1.5 h-1.5 rounded-full bg-[#f43f8e] animate-pulse"></span>
				<span>{monthsWithMemoriesCount} {monthsWithMemoriesCount === 1 ? 'month' : 'months'} active in {currentYear}</span>
			</span>
			{#if totalMemoriesInYear > 0}
				<span class="text-[10px] font-bold text-pink-400">({totalMemoriesInYear} memories total)</span>
			{/if}
		</div>
	</div>

	<!-- Months Interactive Grid (Only Months with Memories) -->
	{#if isLoading}
		<div class="py-6 text-center space-y-2">
			<div class="w-5 h-5 border-2 border-pink-200 border-t-[#f43f8e] rounded-full animate-spin mx-auto"></div>
			<p class="text-xs text-pink-400 font-bold">Scanning memories for {currentYear}...</p>
		</div>
	{:else if displayedMonths.length === 0}
		<div class="py-5 text-center bg-pink-50/40 rounded-2xl border border-dashed border-pink-200">
			<p class="text-xs font-black text-pink-600">No memories recorded for {currentYear}</p>
			<p class="text-[10px] text-pink-400 font-medium mt-0.5">Add a memory on the calendar above to see it here!</p>
		</div>
	{:else}
		<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
			{#each displayedMonths as month}
				<button
					type="button"
					onclick={() => handleMonthClick(month.index)}
					class="p-2 sm:p-2.5 rounded-2xl border transition-all duration-200 flex flex-col items-center justify-between text-center relative group cursor-pointer active:scale-95 shadow-2xs
						{month.isCurrentSelected
							? 'bg-gradient-to-b from-pink-100 to-pink-50 border-[#f43f8e] ring-2 ring-[#f43f8e]/40 shadow-xs'
							: 'bg-white hover:bg-pink-50/90 border-pink-200/90 hover:border-[#f43f8e] hover:shadow-xs'}"
					title="Navigate to {month.name} {currentYear} ({month.count} memories)"
				>
					<!-- Month Name -->
					<span class="text-xs font-black text-pink-950 group-hover:text-[#f43f8e] transition-colors">
						{month.shortName}
					</span>

					<!-- Memory Count Badge -->
					<div class="mt-1">
						<span class="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-[#f43f8e] text-white shadow-2xs inline-flex items-center gap-0.5">
							<span>{month.count}</span>
							<span class="text-[8px] opacity-90">{month.count === 1 ? 'mem' : 'mems'}</span>
						</span>
					</div>

					<!-- Indicator dot if active selected month in main calendar -->
					{#if month.isCurrentSelected}
						<span class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#f43f8e]"></span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Quick Jump Hint Footer -->
	<p class="text-[10px] text-pink-400 font-semibold text-center mt-3 pt-2 border-t border-pink-50">
		Tip: Tap any month button to jump directly to its calendar view!
	</p>
</div>
