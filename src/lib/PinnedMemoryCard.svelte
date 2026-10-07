<script>
	import { onMount, onDestroy, createEventDispatcher, untrack } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { playClickSound } from '$lib/soundEffects.js';
	import { Calendar, Bookmark, Check, X, Pencil } from 'lucide-svelte';
	import DashboardMonthsMemoryCard from '$lib/DashboardMonthsMemoryCard.svelte';

	const dispatch = createEventDispatcher();

	let {
		userId = null,
		currentYear = new Date().getFullYear(),
		currentMonth = new Date().getMonth(),
		memoriesData = {}
	} = $props();

	let pinnedMemories = $state([]);
	let isLoading = $state(true);
	let editingId = $state(null);
	let editingTitle = $state('');
	let showMonthsFilter = $state(false);

	function autoFocus(node) {
		node?.focus?.();
	}

	let lastLoadedUserId = null;

	$effect(() => {
		const uid = userId;
		untrack(() => {
			if (uid) {
				if (lastLoadedUserId !== uid) {
					lastLoadedUserId = uid;
					loadPinnedMemories();
				}
			} else {
				isLoading = false;
				pinnedMemories = [];
				lastLoadedUserId = null;
			}
		});
	});

	onMount(() => {
		if (userId && lastLoadedUserId !== userId) {
			lastLoadedUserId = userId;
			loadPinnedMemories();
		} else if (!userId) {
			isLoading = false;
		}

		const handleRealtimeChange = () => {
			if (userId) {
				loadPinnedMemories(true);
			}
		};

		window.addEventListener('chronomuse_memory_change', handleRealtimeChange);
		window.addEventListener('chronomuse_pinned_change', handleRealtimeChange);
		window.addEventListener('pinnedDatesChanged', handleRealtimeChange);

		return () => {
			window.removeEventListener('chronomuse_memory_change', handleRealtimeChange);
			window.removeEventListener('chronomuse_pinned_change', handleRealtimeChange);
			window.removeEventListener('pinnedDatesChanged', handleRealtimeChange);
		};
	});

	export function loadPinnedMemories(isSilent = false) {
		if (!userId) {
			isLoading = false;
			pinnedMemories = [];
			return;
		}
		if (!isSilent && pinnedMemories.length === 0) {
			isLoading = true;
		}
		fetch(`${API_ENDPOINTS.getPinnedMemories}?user_id=${userId}`, { cache: 'no-store' })
			.then(response => response.json())
			.then(data => {
				if (data.success && Array.isArray(data.data)) {
					pinnedMemories = data.data;
				} else {
					pinnedMemories = [];
				}
			})
			.catch(error => {
				console.error('Error fetching pinned memories:', error);
				pinnedMemories = [];
			})
			.finally(() => {
				isLoading = false;
			});
	}

	function formatDate(dateString) {
		if (!dateString) return '';
		// Parse date string manually to avoid timezone issues
		const [year, month, day] = dateString.split('-');
		const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function getDayName(dateString) {
		if (!dateString) return '';
		// Parse date string manually to avoid timezone issues
		const [year, month, day] = dateString.split('-');
		const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
		return date.toLocaleDateString('en-US', { weekday: 'short' });
	}

	function startEdit(pinned) {
		editingId = pinned.pinned_id;
		editingTitle = pinned.title || 'Pinned Date';
	}

	function cancelEdit() {
		editingId = null;
		editingTitle = '';
	}

	function saveEdit(pinned) {
		const newTitle = editingTitle.trim() || 'Pinned Date';
		// Call API to update title
		fetch(API_ENDPOINTS.updatePinnedDateTitle, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				pinned_id: pinned.pinned_id,
				title: newTitle,
				user_id: userId || pinned.user_id
			})
		})
		.then(response => response.json())
		.then(data => {
			if (data.success) {
				pinned.title = newTitle;
				editingId = null;
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_pinned_change'));
					window.dispatchEvent(new CustomEvent('pinnedDatesChanged'));
				}
			}
		})
		.catch(error => {
			console.error('Error updating pinned date title:', error);
		});
	}

	function deletePinned(pinned) {
		// Dispatch event to parent to handle unpinning
		dispatch('deletePinnedDate', pinned);
	}

	function viewMemory(pinned) {
		// Dispatch event to parent to open view memory modal
		dispatch('viewPinnedMemory', pinned);
	}
</script>

<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-[0_4px_20px_rgba(244,114,182,0.08)] font-sans">
	<!-- Header -->
	<div class="flex items-center justify-between mb-3 border-b border-pink-100/80 pb-2">
		<div class="flex items-center space-x-1.5">
			<div class="w-6 h-6 rounded-lg {showMonthsFilter ? 'bg-gradient-to-tr from-[#f43f8e] to-[#ec4899] text-white' : 'bg-pink-50 border border-pink-100 text-[#f43f8e]'} flex items-center justify-center shadow-2xs">
				{#if showMonthsFilter}
					<Calendar class="w-3.5 h-3.5" />
				{:else}
					<Bookmark class="w-3.5 h-3.5 text-[#f43f8e] fill-current" />
				{/if}
			</div>
			<h3 class="text-xs sm:text-sm font-black text-pink-950">
				{#if showMonthsFilter}
					<span class="md:hidden">Months with Memories</span>
					<span class="hidden md:inline">Pinned Memories</span>
				{:else}
					Pinned Memories
				{/if}
			</h3>
		</div>
		<div class="flex items-center space-x-1.5">
			<!-- Mobile Only: Toggle between Months Filter and Pinned Memories -->
			<button
				type="button"
				onclick={() => { playClickSound(); showMonthsFilter = !showMonthsFilter; }}
				class="md:hidden px-2.5 py-1 rounded-full text-[10px] font-black border transition-all active:scale-95 flex items-center space-x-1 cursor-pointer {showMonthsFilter ? 'bg-[#f43f8e] text-white border-[#f43f8e] shadow-2xs' : 'bg-pink-50 hover:bg-pink-100 text-[#f43f8e] border-pink-200'}"
				title={showMonthsFilter ? 'Switch back to Pinned Memories' : 'Filter by Months with Memories'}
			>
				{#if showMonthsFilter}
					<Bookmark class="w-3 h-3 fill-current" />
					<span>Show Pinned</span>
				{:else}
					<Calendar class="w-3 h-3" />
					<span>Months Filter</span>
				{/if}
			</button>

			<span class="{showMonthsFilter ? 'hidden md:inline-block' : 'inline-block'} text-[10px] bg-pink-100 text-[#f43f8e] px-2 py-0.5 rounded-full font-bold border border-pink-200/80 select-none">
				{pinnedMemories.length} pinned
			</span>
		</div>
	</div>

	<!-- Mobile Only: Months with Memories Content (Replaces pinned list on mobile when active) -->
	{#if showMonthsFilter}
		<div class="md:hidden animate-smooth-reveal">
			<DashboardMonthsMemoryCard
				{userId}
				{currentYear}
				{currentMonth}
				{memoriesData}
				isEmbedded={true}
				on:monthSelected={(e) => {
					dispatch('monthSelected', e.detail);
				}}
				on:yearChanged={(e) => {
					dispatch('yearChanged', e.detail);
				}}
			/>
		</div>
	{/if}

	<!-- Pinned Memories List (Hidden on mobile when months filter is active, always visible on desktop) -->
	<div class="{showMonthsFilter ? 'hidden md:block' : 'block'}">
		{#if isLoading}
			<div class="h-[180px] space-y-2 overflow-hidden animate-pulse">
				{#each Array(3) as _}
					<div class="flex items-center space-x-2.5 p-2.5 bg-[#fdf2f6]/60 border border-pink-100/80 rounded-xl">
						<div class="w-9 h-9 bg-pink-200/70 rounded-lg flex-shrink-0"></div>
						<div class="flex-1 space-y-1.5 py-0.5">
							<div class="h-3 bg-pink-200/70 rounded w-3/4"></div>
							<div class="h-2.5 bg-pink-200/50 rounded w-1/3"></div>
						</div>
						<div class="w-5 h-5 bg-pink-200/50 rounded-md flex-shrink-0"></div>
					</div>
				{/each}
			</div>
		{:else if pinnedMemories.length === 0}
			<div class="h-[180px] flex flex-col items-center justify-center text-center">
				<div class="w-10 h-10 rounded-2xl bg-pink-50 border border-pink-100 text-pink-300 flex items-center justify-center mx-auto mb-2">
					<Bookmark class="w-5 h-5" />
				</div>
				<p class="text-xs font-bold text-pink-400">No pinned memories yet</p>
				<p class="text-[10px] text-pink-400/80 mt-0.5 font-medium">Long-press any date on calendar to pin</p>
			</div>
		{:else}
			<div class="h-[180px] space-y-2 overflow-y-auto custom-pinned-scroll pr-1">
				{#each pinnedMemories as pinned (pinned.pinned_id)}
					<div
						class="flex items-center space-x-2.5 p-2 sm:p-2.5 bg-[#fdf2f6]/60 border border-pink-100/80 rounded-xl hover:border-pink-200 hover:bg-[#fff5f8] transition-all duration-200 cursor-pointer shadow-2xs group active:scale-[0.99]"
						role="button"
						tabindex="0"
						onclick={() => viewMemory(pinned)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								viewMemory(pinned);
							}
						}}
					>
						<!-- Date Badge -->
						<div class="flex flex-col items-center justify-center w-9 h-9 bg-[#f43f8e] rounded-lg text-white flex-shrink-0 shadow-xs">
							<span class="text-[8px] font-black uppercase leading-none">{getDayName(pinned.date)}</span>
							<span class="text-xs font-black leading-none mt-0.5">{pinned.date.split('-')[2]}</span>
						</div>

						<!-- Date Info -->
						<div class="flex-1 min-w-0">
							{#if editingId === pinned.pinned_id}
								<input
									type="text"
									bind:value={editingTitle}
									class="w-full px-2 py-1 text-xs font-bold text-pink-950 bg-white border border-pink-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30"
									onkeydown={(e) => {
										if (e.key === 'Enter') saveEdit(pinned);
										if (e.key === 'Escape') cancelEdit();
									}}
									onclick={(e) => e.stopPropagation()}
									use:autoFocus
								/>
							{:else}
								<p class="text-xs font-bold text-pink-950 truncate group-hover:text-[#f43f8e] transition-colors">{pinned.title || 'Pinned Date'}</p>
								<p class="text-[10px] text-pink-400 font-medium">{formatDate(pinned.date)}</p>
							{/if}
						</div>

						<!-- Edit Button -->
						{#if editingId === pinned.pinned_id}
							<button
								type="button"
								onclick={(e) => { e.stopPropagation(); saveEdit(pinned); }}
								class="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
								title="Save"
							>
								<Check class="w-3.5 h-3.5" />
							</button>
							<button
								type="button"
								onclick={(e) => { e.stopPropagation(); cancelEdit(); }}
								class="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
								title="Cancel"
							>
								<X class="w-3.5 h-3.5" />
							</button>
						{:else}
							<button
								type="button"
								onclick={(e) => { e.stopPropagation(); startEdit(pinned); }}
								class="p-1 text-pink-400 hover:text-[#f43f8e] hover:bg-pink-100 rounded-lg transition-colors cursor-pointer"
								title="Edit title"
							>
								<Pencil class="w-3.5 h-3.5" />
							</button>
							<button
								type="button"
								onclick={(e) => { e.stopPropagation(); deletePinned(pinned); }}
								class="p-1 text-pink-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
								title="Unpin date"
							>
								<Bookmark class="w-3.5 h-3.5 fill-current" />
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	/* Custom scrollbar for pinned memories list */
	.custom-pinned-scroll::-webkit-scrollbar {
		width: 4px;
	}

	.custom-pinned-scroll::-webkit-scrollbar-track {
		background: rgba(254, 226, 238, 0.4);
		border-radius: 8px;
	}

	.custom-pinned-scroll::-webkit-scrollbar-thumb {
		background: #f472b6;
		border-radius: 8px;
	}

	.custom-pinned-scroll::-webkit-scrollbar-thumb:hover {
		background: #f43f8e;
	}

	.custom-pinned-scroll {
		scrollbar-width: thin;
		scrollbar-color: #f472b6 rgba(254, 226, 238, 0.4);
	}
</style>
