<script>
	import { onMount, createEventDispatcher, untrack } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { playClickSound } from '$lib/soundEffects.js';
	import { Clock, Image as ImageIcon, Play, ArrowRight } from 'lucide-svelte';

	const dispatch = createEventDispatcher();

	let { userId = null, memoriesData = {} } = $props();

	let throwbackMemory = $state(null);
	let isLoading = $state(true);

	let lastLoadedUserId = null;

	$effect(() => {
		const uid = userId;
		untrack(() => {
			if (uid) {
				if (lastLoadedUserId !== uid) {
					lastLoadedUserId = uid;
					loadFlashback();
				}
			} else {
				isLoading = false;
				lastLoadedUserId = null;
			}
		});
	});

	onMount(() => {
		if (userId && lastLoadedUserId !== userId) {
			lastLoadedUserId = userId;
			loadFlashback();
		} else if (!userId) {
			isLoading = false;
		}

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

{#if isLoading}
	<!-- Skeleton Flashback Card -->
	<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-[0_4px_20px_rgba(244,114,182,0.08)] font-sans transition-all">
		<!-- Header Skeleton -->
		<div class="flex items-center justify-between mb-2.5">
			<div class="flex items-center space-x-1.5">
				<div class="w-6 h-6 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
					<Clock class="w-3.5 h-3.5 text-pink-400" />
				</div>
				<h4 class="text-xs font-black text-pink-950">Memory Flashback</h4>
			</div>
			<!-- Date Badge Skeleton -->
			<div class="h-4.5 w-20 bg-pink-100/80 rounded-full animate-pulse"></div>
		</div>

		<!-- Body Media + Info Skeleton -->
		<div class="bg-pink-50/50 rounded-xl p-2.5 border border-pink-100/60 mb-2.5 flex items-center space-x-2.5 animate-pulse">
			<!-- Square Thumbnail Placeholder -->
			<div class="w-11 h-11 rounded-lg bg-pink-200/60 flex-shrink-0 flex items-center justify-center border border-pink-200/50">
				<ImageIcon class="w-4 h-4 text-pink-300" />
			</div>
			<!-- Text Placeholders -->
			<div class="min-w-0 flex-1 space-y-1.5">
				<div class="h-3 bg-pink-200/70 rounded-md w-3/4"></div>
				<div class="h-2 bg-pink-200/50 rounded-md w-1/3"></div>
			</div>
		</div>

		<!-- Action Button Skeleton -->
		<div class="w-full py-2 px-3 bg-pink-100/60 rounded-xl border border-pink-100 flex items-center justify-center space-x-2 animate-pulse">
			<div class="h-3 w-24 bg-pink-200/70 rounded"></div>
			<div class="w-3.5 h-3.5 bg-pink-200/70 rounded-full"></div>
		</div>
	</div>
{:else if throwbackMemory}
	<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-[0_4px_20px_rgba(244,114,182,0.08)] font-sans transition-all hover:border-pink-200">
		<div class="flex items-center justify-between mb-2.5">
			<div class="flex items-center space-x-1.5">
				<div class="w-6 h-6 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
					<!-- Simple Flashback Clock Icon -->
					<Clock class="w-3.5 h-3.5" />
				</div>
				<h4 class="text-xs font-black text-pink-950">Memory Flashback</h4>
			</div>
			<span class="text-[10px] bg-pink-50 text-[#f43f8e] font-bold px-2 py-0.5 rounded-full border border-pink-200/60 shadow-2xs">
				{formatMemoryDate(throwbackMemory.date)}
			</span>
		</div>

		<div class="bg-pink-50/50 rounded-xl p-2.5 border border-pink-100/60 mb-2.5 flex items-center space-x-2.5">
			{#if throwbackMemory.photo_video || throwbackMemory.photo_video_url}
				{@const mediaUrl = getMediaUrl(throwbackMemory.photo_video_url || throwbackMemory.photo_video)}
				{#if isVideoMedia(throwbackMemory)}
					<!-- Video Thumbnail with Play Overlay -->
					<div class="w-11 h-11 rounded-lg bg-[#1e1e24] relative overflow-hidden border border-pink-200 shadow-xs flex-shrink-0 flex items-center justify-center">
						<video
							src={mediaUrl}
							class="w-full h-full object-cover"
							preload="metadata"
							muted
							playsinline
							aria-label="Flashback video"
						></video>
						<div class="absolute inset-0 bg-black/30 flex items-center justify-center">
							<div class="w-4 h-4 rounded-full bg-white/90 text-[#f43f8e] flex items-center justify-center shadow-2xs">
								<Play class="w-2.5 h-2.5 fill-current translate-x-0.2" />
							</div>
						</div>
					</div>
				{:else}
					<!-- Image Thumbnail -->
					<img
						src={mediaUrl}
						alt="Flashback"
						class="w-11 h-11 rounded-lg object-cover border border-pink-200 shadow-xs flex-shrink-0"
					/>
				{/if}
			{:else}
				<div class="w-11 h-11 rounded-lg bg-gradient-to-br from-pink-100 to-pink-50 text-[#f43f8e] flex items-center justify-center flex-shrink-0 border border-pink-200/60 shadow-inner">
					<ImageIcon class="w-4 h-4 text-[#f43f8e]" />
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
			class="w-full py-2 px-3 bg-pink-50 hover:bg-pink-100 text-[#f43f8e] font-semibold sm:font-bold text-xs rounded-xl transition-all duration-200 flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95 border border-pink-200/80 shadow-sm hover:shadow-md"
		>
			<span>View Flashback</span>
			<ArrowRight class="w-3.5 h-3.5" />
		</button>
	</div>
{/if}
