<script>
	import { onMount, createEventDispatcher } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { playClickSound } from '$lib/soundEffects.js';
	import { ChevronLeft, ChevronRight, Calendar, Info } from 'lucide-svelte';

	const dispatch = createEventDispatcher();

	let {
		userId = null,
		currentYear = new Date().getFullYear(),
		currentMonth = new Date().getMonth(),
		memoriesData = {},
		isEmbedded = false
	} = $props();

	let selectedYear = $state(new Date().getFullYear());
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

	let lastLoadedUserId = null;

	// Keep selectedYear synchronized when main calendar changes year
	$effect(() => {
		if (currentYear && currentYear !== selectedYear) {
			selectedYear = currentYear;
		}
	});

	// React to userId changes
	$effect(() => {
		const uid = userId;
		if (uid && lastLoadedUserId !== uid) {
			lastLoadedUserId = uid;
			loadAllMemories();
		} else if (!uid) {
			isLoading = false;
			lastLoadedUserId = null;
		}
	});

	onMount(() => {
		if (userId && lastLoadedUserId !== userId) {
			lastLoadedUserId = userId;
			loadAllMemories();
		} else if (!userId) {
			isLoading = false;
		}

		const handleMemoryChange = () => {
			if (userId) {
				loadAllMemories();
			}
		};

		window.addEventListener('chronomuse_memory_change', handleMemoryChange);
		return () => {
			window.removeEventListener('chronomuse_memory_change', handleMemoryChange);
		};
	});

	async function loadAllMemories() {
		if (!userId) return;
		try {
			// Direct Supabase query for immediate results
			const { data, error } = await supabase
				.from('chronomuse_memories')
				.select('id, user_id, date, created_at, mood_tag, memory_tag, title')
				.eq('user_id', userId)
				.order('date', { ascending: false });

			if (!error && Array.isArray(data)) {
				allMemories = data;
				isLoading = false;
				return;
			}

			// Fallback to API endpoint
			const res = await fetch(`${API_ENDPOINTS.getMoodData}?user_id=${userId}&period=all&_t=${Date.now()}`, { cache: 'no-store' });
			const resData = await res.json();
			if (resData.success && Array.isArray(resData.data)) {
				allMemories = resData.data;
			}
		} catch (err) {
			console.error('Error loading memories for month card:', err);
		} finally {
			isLoading = false;
		}
	}

	// Calculate stats and filter ONLY months with memories for selectedYear
	let monthlyStats = $derived.by(() => {
		const counts = Array(12).fill(0);
		const yearStr = String(selectedYear);

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
			isCurrentSelected: selectedYear === currentYear && currentMonth === index
		}));
	});

	// Only show months that have memories
	let displayedMonths = $derived(
		monthlyStats.filter(m => m.hasMemories)
	);

	function changeYear(delta) {
		playClickSound();
		selectedYear += delta;
		dispatch('yearChanged', { year: selectedYear });
	}

	function handleMonthClick(monthIndex) {
		playClickSound();
		dispatch('monthSelected', { month: monthIndex, year: selectedYear });
	}
</script>

{#snippet monthsContent()}
	<!-- Sub-header: Year Switcher & Month Count -->
	<div class="flex items-center justify-between pb-1.5 border-b border-pink-100/70">
		{#if isLoading && allMemories.length === 0}
			<div class="h-4.5 w-24 bg-pink-100/80 rounded-full animate-pulse"></div>
			<div class="h-5 w-16 bg-pink-100/80 rounded-lg animate-pulse"></div>
		{:else}
			<div class="flex items-center gap-1.5">
				<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-pink-50 text-[#f43f8e] border border-pink-200/80 inline-flex items-center gap-1 shadow-2xs">
					<span class="w-1.5 h-1.5 rounded-full bg-[#f43f8e] animate-pulse"></span>
					<span>{monthsWithMemoriesCount} {monthsWithMemoriesCount === 1 ? 'active month' : 'active months'}</span>
				</span>
			</div>

			<!-- Year Switcher (Interactive Previous/Next Year) -->
			<div class="flex items-center space-x-1 bg-pink-50/80 p-0.5 rounded-lg border border-pink-200/80 shadow-2xs">
				<button
					type="button"
					onclick={() => changeYear(-1)}
					class="p-0.5 text-pink-600 hover:text-[#f43f8e] hover:bg-white rounded transition-all cursor-pointer active:scale-95 flex items-center justify-center"
					title="Previous Year"
					aria-label="Previous Year"
				>
					<ChevronLeft class="w-3 h-3" />
				</button>
				<span class="text-[11px] font-black text-[#f43f8e] px-1 select-none">{selectedYear}</span>
				<button
					type="button"
					onclick={() => changeYear(1)}
					class="p-0.5 text-pink-600 hover:text-[#f43f8e] hover:bg-white rounded transition-all cursor-pointer active:scale-95 flex items-center justify-center"
					title="Next Year"
					aria-label="Next Year"
				>
					<ChevronRight class="w-3 h-3" />
				</button>
			</div>
		{/if}
	</div>

	<!-- Months Interactive Grid (Only Months with Memories) -->
	{#if isLoading && allMemories.length === 0}
		<div class="flex-1 flex flex-col justify-between py-1.5 animate-pulse">
			<div class="grid grid-cols-6 gap-1 content-start">
				{#each Array(6) as _}
					<div class="py-1.5 sm:py-2 px-1 rounded-xl border border-pink-100/90 bg-pink-50/50 flex flex-col items-center justify-center space-y-1">
						<div class="h-2.5 w-6 bg-pink-200/70 rounded"></div>
						<div class="w-3.5 h-3.5 rounded-full bg-pink-200/60"></div>
					</div>
				{/each}
			</div>
			<div class="pt-1.5 border-t border-pink-100/70 flex items-center justify-between">
				<div class="h-2.5 w-32 bg-pink-100/80 rounded"></div>
				<div class="h-3.5 w-12 bg-pink-100/80 rounded"></div>
			</div>
		</div>
	{:else if displayedMonths.length === 0}
		<div class="flex-1 flex flex-col items-center justify-center text-center py-2">
			<div class="w-9 h-9 rounded-2xl bg-pink-50 border border-pink-100 text-pink-300 flex items-center justify-center mx-auto mb-1.5">
				<Calendar class="w-4 h-4" />
			</div>
			<p class="text-xs font-bold text-pink-400">No memories for {selectedYear}</p>
			<p class="text-[10px] text-pink-400/80 mt-0.5 font-medium">Add a memory on the calendar to see it here</p>
		</div>
	{:else}
		<div class="flex-1 flex flex-col justify-between py-1 min-h-0">
			<div class="grid grid-cols-6 gap-1 sm:gap-1.5 content-start overflow-y-auto max-h-[105px] pr-0.5 custom-month-scroll">
				{#each displayedMonths as month}
					<button
						type="button"
						onclick={() => handleMonthClick(month.index)}
						class="py-1.5 sm:py-2 px-1 rounded-xl border transition-all duration-200 flex flex-col items-center justify-center text-center relative group cursor-pointer active:scale-95
							{month.isCurrentSelected
								? 'bg-gradient-to-b from-pink-100 to-pink-50 border-[#f43f8e] shadow-2xs'
								: 'bg-white hover:bg-pink-50/90 border-pink-200/90 hover:border-[#f43f8e] shadow-2xs hover:shadow-xs'}"
						title="Jump to {month.name} {selectedYear} ({month.count} memories)"
					>
						<!-- Month Name -->
						<span class="text-[10px] sm:text-[11px] font-black text-pink-950 group-hover:text-[#f43f8e] transition-colors leading-tight">
							{month.shortName}
						</span>

						<!-- Memory Count Badge -->
						<div class="mt-0.5 sm:mt-1">
							<span class="text-[8px] sm:text-[8.5px] font-black min-w-[15px] h-[13px] px-1 rounded-full bg-[#f43f8e] text-white shadow-2xs inline-flex items-center justify-center leading-none">
								{month.count}
							</span>
						</div>

						<!-- Indicator dot if active selected month in main calendar -->
						{#if month.isCurrentSelected}
							<span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[#f43f8e]"></span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Description & Hint Note in the bottom space -->
			<div class="pt-1.5 border-t border-pink-100/70 flex items-center justify-between text-[9.5px] sm:text-[10px] text-pink-400 font-bold px-0.5">
				<span class="flex items-center gap-1 truncate min-w-0 pr-1">
					<Info class="w-3 h-3 text-[#f43f8e] flex-shrink-0" />
					<span class="truncate">Tap any month to switch view</span>
				</span>
				<span class="text-[9px] text-pink-500 bg-pink-50 px-1.5 py-0.5 rounded-md border border-pink-200/60 font-black flex-shrink-0">
					{displayedMonths.reduce((sum, m) => sum + m.count, 0)} total
				</span>
			</div>
		</div>
	{/if}
{/snippet}

{#if isEmbedded}
	<!-- Embedded Mode (e.g. inside PinnedMemoryCard on mobile): Exact h-[180px] matching pinned list -->
	<div class="w-full h-[180px] font-sans flex flex-col justify-between overflow-hidden">
		{@render monthsContent()}
	</div>
{:else}
	<!-- Standalone Mode (e.g. on Desktop): Exact match with PinnedMemoryCard wrapper and h-[180px] body -->
	<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-[0_4px_20px_rgba(244,114,182,0.08)] font-sans transition-all duration-300 hover:border-pink-200">
		<!-- Header -->
		<div class="flex items-center justify-between mb-3 border-b border-pink-100/80 pb-2">
			<div class="flex items-center space-x-1.5">
				<div class="w-6 h-6 rounded-lg bg-gradient-to-tr from-[#f43f8e] to-[#ec4899] text-white flex items-center justify-center shadow-2xs flex-shrink-0">
					<Calendar class="w-3.5 h-3.5" />
				</div>
				<h3 class="text-xs sm:text-sm font-black text-pink-950">Months with Memories</h3>
			</div>
		</div>

		<!-- Body with exact h-[180px] height to match PinnedMemoryCard -->
		<div class="h-[180px] flex flex-col justify-between overflow-hidden">
			{@render monthsContent()}
		</div>
	</div>
{/if}

<style>
	.custom-month-scroll::-webkit-scrollbar {
		width: 3px;
	}
	.custom-month-scroll::-webkit-scrollbar-track {
		background: rgba(254, 226, 238, 0.3);
		border-radius: 6px;
	}
	.custom-month-scroll::-webkit-scrollbar-thumb {
		background: #f472b6;
		border-radius: 6px;
	}
	.custom-month-scroll {
		scrollbar-width: thin;
		scrollbar-color: #f472b6 rgba(254, 226, 238, 0.3);
	}
</style>
