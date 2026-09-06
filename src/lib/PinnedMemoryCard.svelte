<script>
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';

	const dispatch = createEventDispatcher();

	let { userId = 1 } = $props();
	let pinnedMemories = $state([]);
	let isLoading = $state(true);
	let editingId = $state(null);
	let editingTitle = $state('');

	onMount(() => {
		loadPinnedMemories();

		const handleRealtimeChange = () => {
			loadPinnedMemories(true);
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
		if (!isSilent && pinnedMemories.length === 0) {
			isLoading = true;
		}
		fetch(`${API_ENDPOINTS.getPinnedMemories}?user_id=${userId}`)
			.then(response => response.json())
			.then(data => {
				isLoading = false;
				if (data.success && Array.isArray(data.data)) {
					pinnedMemories = data.data;
				} else {
					pinnedMemories = [];
				}
			})
			.catch(error => {
				isLoading = false;
				console.error('Error fetching pinned memories:', error);
				pinnedMemories = [];
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
		// Call API to update title
		fetch(API_ENDPOINTS.updatePinnedDateTitle, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				pinned_id: pinned.pinned_id,
				title: editingTitle,
				user_id: userId
			})
		})
		.then(response => response.json())
		.then(data => {
			if (data.success) {
				// Update local state
				const index = pinnedMemories.findIndex(p => p.pinned_id === pinned.pinned_id);
				if (index !== -1) {
					pinnedMemories[index].title = editingTitle;
				}
				editingId = null;
				editingTitle = '';
			} else {
				console.error('Error updating title:', data.error);
			}
		})
		.catch(error => {
			console.error('Error updating title:', error);
		});
	}

	function confirmDelete(pinned) {
		// Dispatch event to parent to show delete modal
		dispatch('deletePinnedDate', pinned);
	}

	function viewMemory(pinned) {
		// Dispatch event to parent to open view memory modal
		dispatch('viewPinnedMemory', pinned);
	}
</script>

<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-4 transition-all duration-300 hover:shadow-lg">
	<!-- Header -->
	<div class="flex items-center justify-between mb-4">
		<div class="flex items-center space-x-1.5">
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 text-pink-500">
				<path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
			</svg>
			<h3 class="text-xs sm:text-sm font-bold text-pink-500 uppercase tracking-wide">Pinned Memories</h3>
		</div>
		<span class="text-[11px] text-pink-400">{pinnedMemories.length} pinned</span>
	</div>

	<!-- Pinned Memories List -->
	{#if isLoading}
		<div class="text-center py-8">
			<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500 mx-auto"></div>
			<p class="text-xs text-pink-400 mt-2">Loading...</p>
		</div>
	{:else if pinnedMemories.length === 0}
		<div class="text-center py-8">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-10 h-10 text-pink-200 mx-auto mb-2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
			</svg>
			<p class="text-xs text-pink-400">No pinned memories yet</p>
		</div>
	{:else}
		<div class="space-y-2 max-h-[300px] overflow-y-auto scrollbar-hide">
			{#each pinnedMemories as pinned (pinned.pinned_id)}
				<div class="flex items-center space-x-2.5 p-2.5 bg-pink-50 border border-pink-200 rounded-xl hover:border-pink-300 hover:bg-pink-100/80 transition-all duration-200 cursor-pointer" onclick={() => viewMemory(pinned)}>
					<!-- Date Badge -->
					<div class="flex flex-col items-center justify-center w-9 h-9 bg-gradient-to-r from-pink-400 to-pink-600 rounded-lg text-white shadow-sm flex-shrink-0">
						<span class="text-[9px] font-semibold uppercase">{getDayName(pinned.date)}</span>
						<span class="text-xs font-bold">{pinned.date.split('-')[2]}</span>
					</div>

					<!-- Date Info -->
					<div class="flex-1 min-w-0">
						{#if editingId === pinned.pinned_id}
							<input
								type="text"
								bind:value={editingTitle}
								class="w-full px-2 py-1 text-xs font-medium text-pink-700 bg-white border-2 border-pink-300 rounded focus:outline-none focus:ring-2 focus:ring-pink-400"
								onkeydown={(e) => {
									if (e.key === 'Enter') saveEdit(pinned);
									if (e.key === 'Escape') cancelEdit();
								}}
								onclick={(e) => e.stopPropagation()}
								autofocus
							/>
						{:else}
							<p class="text-xs font-medium text-pink-700 truncate">{pinned.title || 'Pinned Date'}</p>
							<p class="text-[10px] text-pink-400">{formatDate(pinned.date)}</p>
						{/if}
					</div>

					<!-- Edit Button -->
					{#if editingId === pinned.pinned_id}
						<button
							onclick={(e) => { e.stopPropagation(); saveEdit(pinned); }}
							class="p-1.5 text-green-500 hover:text-green-600 hover:bg-green-50 rounded transition-all duration-200"
							title="Save"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
							</svg>
						</button>
						<button
							onclick={(e) => { e.stopPropagation(); cancelEdit(); }}
							class="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded transition-all duration-200"
							title="Cancel"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					{:else}
						<button
							onclick={(e) => { e.stopPropagation(); startEdit(pinned); }}
							class="p-1.5 text-pink-400 hover:text-pink-600 hover:bg-pink-100 rounded transition-all duration-200"
							title="Edit title"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
							</svg>
						</button>
						<button
							onclick={(e) => { e.stopPropagation(); confirmDelete(pinned); }}
							class="p-1.5 text-pink-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all duration-200"
							title="Unpin date"
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
							</svg>
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	/* Custom scrollbar for pinned memories list */
	.max-h-\[300px\]::-webkit-scrollbar {
		width: 6px;
	}

	.max-h-\[300px\]::-webkit-scrollbar-track {
		background: rgba(255, 225, 240, 0.5);
		border-radius: 10px;
	}

	.max-h-\[300px\]::-webkit-scrollbar-thumb {
		background: linear-gradient(180deg, #ff69b4, #ff1493);
		border-radius: 10px;
	}

	.max-h-\[300px\]::-webkit-scrollbar-thumb:hover {
		background: linear-gradient(180deg, #ff1493, #b11663);
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes modal-content {
		from {
			opacity: 0;
			transform: scale(0.9) translateY(-20px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.animate-fade-in {
		animation: fade-in 0.2s ease-out;
	}

	.animate-modal-content {
		animation: modal-content 0.3s ease-out cubic-bezier(0.34, 1.56, 0.64, 1);
	}
</style>
