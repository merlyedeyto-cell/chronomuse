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

	function isVideoMedia(memory) {
		if (!memory) return false;
		const type = memory.photo_video_type || '';
		if (type.startsWith('video/')) return true;
		const url = memory.photo_video_url || memory.photo_video;
		if (typeof url === 'string') {
			const clean = url.split('?')[0].toLowerCase();
			return clean.endsWith('.mp4') || clean.endsWith('.webm') || clean.endsWith('.mov') || clean.endsWith('.m4v') || clean.endsWith('.ogg');
		}
		return false;
	}

	function getMediaUrl(val) {
		if (!val) return '';
		if (typeof val === 'string') {
			if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('blob:') || val.startsWith('data:')) {
				return val;
			}
			if (val.startsWith('/uploads/')) return val;
			if (val.startsWith('uploads/')) return '/' + val;
		}
		return val;
	}
</script>

{#if throwbackMemory}
	<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-4 shadow-[0_4px_20px_rgba(244,114,182,0.08)] font-sans transition-all hover:border-pink-200">
		<div class="flex items-center justify-between mb-2.5">
			<div class="flex items-center space-x-1.5">
				<div class="w-6 h-6 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
					<!-- Simple Flashback Clock Icon -->
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</div>
				<h4 class="text-xs font-black text-pink-950">Memory Flashback</h4>
			</div>
			<span class="text-[10px] bg-pink-50 text-[#f43f8e] font-bold px-2 py-0.5 rounded-full border border-pink-200/60 shadow-2xs">
				{formatMemoryDate(throwbackMemory.date)}
			</span>
		</div>

		<div class="bg-pink-50/50 rounded-xl p-2.5 border border-pink-100/60 mb-2.5 flex items-center space-x-3">
			{#if throwbackMemory.photo_video || throwbackMemory.photo_video_url}
				{@const mediaUrl = getMediaUrl(throwbackMemory.photo_video_url || throwbackMemory.photo_video)}
				{#if isVideoMedia(throwbackMemory)}
					<!-- Video Thumbnail with Play Overlay -->
					<div class="w-12 h-12 rounded-lg bg-[#1e1e24] relative overflow-hidden border border-pink-200 shadow-xs flex-shrink-0 flex items-center justify-center">
						<video
							src={mediaUrl}
							class="w-full h-full object-cover"
							preload="metadata"
							muted
							playsinline
							aria-label="Flashback video"
						></video>
						<div class="absolute inset-0 bg-black/30 flex items-center justify-center">
							<div class="w-5 h-5 rounded-full bg-white/90 text-[#f43f8e] flex items-center justify-center shadow-2xs">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3 h-3 translate-x-0.5">
									<path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
								</svg>
							</div>
						</div>
					</div>
				{:else}
					<!-- Image Thumbnail -->
					<img
						src={mediaUrl}
						alt="Flashback"
						class="w-12 h-12 rounded-lg object-cover border border-pink-200 shadow-xs flex-shrink-0"
					/>
				{/if}
			{:else}
				<div class="w-12 h-12 rounded-lg bg-gradient-to-br from-pink-100 to-pink-50 text-[#f43f8e] flex items-center justify-center flex-shrink-0 border border-pink-200/60 shadow-inner">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5 text-[#f43f8e]">
						<path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
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
			class="w-full py-1.5 px-3 bg-pink-50 hover:bg-pink-100 text-[#f43f8e] font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer active:scale-98 border border-pink-100/90 shadow-2xs"
		>
			<span>View Flashback</span>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 h-3.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
			</svg>
		</button>
	</div>
{/if}
