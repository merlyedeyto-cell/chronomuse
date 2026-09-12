<script>
	import { onMount, createEventDispatcher } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { playClickSound } from '$lib/soundEffects.js';

	const dispatch = createEventDispatcher();

	let { userId = null, memoriesData = {} } = $props();

	let throwbackMemory = $state(null);
	let isLoading = $state(true);

	$effect(() => {
		if (userId) {
			loadFlashback();
		}
	});

	onMount(() => {
		if (userId) loadFlashback();

		const handleUpdate = () => {
			if (userId) loadFlashback();
		};

		window.addEventListener('chronomuse_memory_change', handleUpdate);
		return () => {
			window.removeEventListener('chronomuse_memory_change', handleUpdate);
		};
	});

	async function loadFlashback() {
		if (!userId) return;
		try {
			const res = await fetch(`${API_ENDPOINTS.getMoodData}?user_id=${userId}&period=all`, { cache: 'no-store' });
			const data = await res.json();

			if (data.success && Array.isArray(data.data)) {
				findThrowbackMemory(data.data);
			}
		} catch (err) {
			console.error('Error loading throwback memory:', err);
		} finally {
			isLoading = false;
		}
	}

	function findThrowbackMemory(memories) {
		if (!memories || memories.length === 0) {
			throwbackMemory = null;
			return;
		}

		const today = new Date();
		const currentDay = today.getDate();
		const todayStr = today.toISOString().split('T')[0];

		const pastMatches = memories.filter(m => {
			if (!m.date || m.date === todayStr) return false;
			const parts = m.date.split('-');
			if (parts.length === 3) {
				const day = parseInt(parts[2], 10);
				return day === currentDay;
			}
			return false;
		});

		if (pastMatches.length > 0) {
			throwbackMemory = pastMatches[0];
		} else {
			const olderMemories = memories.filter(m => m.date !== todayStr);
			if (olderMemories.length > 0) {
				throwbackMemory = olderMemories[Math.floor(Math.random() * olderMemories.length)];
			} else {
				throwbackMemory = null;
			}
		}
	}

	function viewThrowback() {
		if (throwbackMemory) {
			playClickSound();
			dispatch('viewMemory', throwbackMemory);
		}
	}

	function formatMemoryDate(dateStr) {
		if (!dateStr) return '';
		const [year, month, day] = dateStr.split('-');
		const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}
</script>

{#if throwbackMemory}
	<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-4 shadow-[0_4px_20px_rgba(244,114,182,0.08)] font-sans transition-all hover:border-pink-200">
		<div class="flex items-center justify-between mb-2.5">
			<div class="flex items-center space-x-1.5">
				<div class="w-5 h-5 rounded-md bg-pink-50 text-[#f43f8e] flex items-center justify-center border border-pink-100">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</div>
				<h4 class="text-xs font-black text-pink-950">Memory Flashback</h4>
			</div>
			<span class="text-[10px] bg-pink-50 text-[#f43f8e] font-bold px-2 py-0.5 rounded-full border border-pink-200/60">
				{formatMemoryDate(throwbackMemory.date)}
			</span>
		</div>

		<div class="bg-pink-50/50 rounded-xl p-2.5 border border-pink-100/60 mb-2.5 flex items-center space-x-3">
			{#if throwbackMemory.photo_video || throwbackMemory.photo_video_url}
				<img
					src={throwbackMemory.photo_video_url || throwbackMemory.photo_video}
					alt="Flashback"
					class="w-12 h-12 rounded-lg object-cover border border-pink-200 shadow-xs flex-shrink-0"
				/>
			{:else}
				<div class="w-12 h-12 rounded-lg bg-pink-100/80 text-pink-400 flex items-center justify-center flex-shrink-0">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5 text-[#f43f8e]">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
					</svg>
				</div>
			{/if}
			<div class="min-w-0 flex-1">
				<p class="text-xs font-bold text-pink-950 truncate">
					{throwbackMemory.title || throwbackMemory.description || 'Special Memory'}
				</p>
				{#if throwbackMemory.mood_tag}
					<span class="inline-block mt-0.5 text-[9px] font-bold text-[#f43f8e] bg-white px-1.5 py-0.5 rounded-md border border-pink-100">
						Mood: {throwbackMemory.mood_tag}
					</span>
				{/if}
			</div>
		</div>

		<button
			onclick={viewThrowback}
			class="w-full py-1.5 px-3 bg-pink-50 hover:bg-pink-100 text-[#f43f8e] font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer active:scale-98 border border-pink-100"
		>
			<span>View Flashback</span>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 h-3.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
			</svg>
		</button>
	</div>
{/if}
