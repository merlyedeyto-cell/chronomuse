<script>
	import { onMount, untrack } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { playClickSound } from '$lib/soundEffects.js';
	import { RefreshCw } from 'lucide-svelte';

	let { userId = null, memoriesData = {} } = $props();

	let totalMemories = $state(0);
	let photoCount = $state(0);
	let topMood = $state('Happy');
	let isLoading = $state(true);

	// Daily affirmations / inspiration quotes from ZenQuotes API
	let quotes = $state([
		{ q: "Every day holds a special little moment worth remembering.", a: "Chronomuse" },
		{ q: "Collect beautiful moments, not just things.", a: "Unknown" },
		{ q: "Your story is unique, precious, and worth saving.", a: "Chronomuse" },
		{ q: "Small reflections today become cherished treasures tomorrow.", a: "Chronomuse" },
		{ q: "Smile, breathe, and capture the joy in today.", a: "Unknown" },
		{ q: "Gratitude turns what we have into enough.", a: "Aesop" },
		{ q: "Make each day a masterpiece in your timeline.", a: "John Wooden" }
	]);

	let currentQuoteIndex = $state(0);
	let isShuffling = $state(false);

	async function loadAffirmations() {
		try {
			const res = await fetch(API_ENDPOINTS.getAffirmation);
			const data = await res.json();
			if (data.success && Array.isArray(data.quotes) && data.quotes.length > 0) {
				quotes = data.quotes;
				const today = new Date();
				currentQuoteIndex = (today.getDate() + today.getMonth() * 31) % quotes.length;
			}
		} catch (err) {
			console.warn('Could not fetch affirmations from API, using fallback:', err);
		}
	}

	function shuffleQuote() {
		playClickSound();
		isShuffling = true;
		if (quotes.length > 1) {
			let nextIndex;
			do {
				nextIndex = Math.floor(Math.random() * quotes.length);
			} while (nextIndex === currentQuoteIndex && quotes.length > 1);
			currentQuoteIndex = nextIndex;
		}
		setTimeout(() => {
			isShuffling = false;
		}, 300);
	}

	let lastLoadedUserId = null;

	$effect(() => {
		const uid = userId;
		untrack(() => {
			if (uid) {
				if (lastLoadedUserId !== uid) {
					lastLoadedUserId = uid;
					loadStats();
				}
			} else {
				isLoading = false;
				lastLoadedUserId = null;
			}
		});
	});

	onMount(() => {
		const today = new Date();
		currentQuoteIndex = today.getDate() % quotes.length;
		loadAffirmations();

		if (userId && lastLoadedUserId !== userId) {
			lastLoadedUserId = userId;
			loadStats();
		} else if (!userId) {
			isLoading = false;
		}

		const handleUpdate = () => {
			if (userId) loadStats();
		};

		window.addEventListener('chronomuse_memory_change', handleUpdate);
		return () => {
			window.removeEventListener('chronomuse_memory_change', handleUpdate);
		};
	});

	async function loadStats() {
		if (!userId) return;
		isLoading = true;
		try {
			const res = await fetch(`${API_ENDPOINTS.getMoodData}?user_id=${userId}&period=all`, { cache: 'no-store' });
			const data = await res.json();

			if (data.success && Array.isArray(data.data)) {
				const memories = data.data;
				totalMemories = memories.length;
				photoCount = memories.filter(m => m.photo_video || m.photo_video_url).length;

				calculateTopMood(memories);
			}
		} catch (err) {
			console.error('Error loading dashboard stats:', err);
		} finally {
			isLoading = false;
		}
	}

	function calculateTopMood(memories) {
		const moodCounts = {};
		for (const m of memories) {
			if (m.mood_tag) {
				moodCounts[m.mood_tag] = (moodCounts[m.mood_tag] || 0) + 1;
			}
		}
		let highest = 'Happy';
		let maxCount = 0;
		for (const [mood, cnt] of Object.entries(moodCounts)) {
			if (cnt > maxCount) {
				maxCount = cnt;
				highest = mood;
			}
		}
		topMood = highest.charAt(0).toUpperCase() + highest.slice(1);
	}
</script>

<div class="space-y-4">
	<!-- Journaling Streak & Quick Numbers Card -->
	<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] font-sans">
		<!-- Header -->
		<div class="flex items-center justify-between mb-3.5">
			<div>
				<h3 class="text-xs sm:text-sm font-black text-pink-950 leading-tight">Memory Streak</h3>
				<p class="text-[10px] text-pink-400 font-bold">Daily journal momentum</p>
			</div>
		</div>

		<!-- Quick Metric Pills -->
		{#if isLoading}
			<div class="grid grid-cols-3 gap-2 pt-1 animate-pulse">
				<div class="bg-pink-50/70 border border-pink-100/80 rounded-xl p-2.5 text-center flex flex-col items-center justify-center space-y-1.5">
					<div class="h-5 w-8 bg-pink-200/70 rounded-md"></div>
					<div class="h-2.5 w-12 bg-pink-200/50 rounded"></div>
				</div>
				<div class="bg-pink-50/70 border border-pink-100/80 rounded-xl p-2.5 text-center flex flex-col items-center justify-center space-y-1.5">
					<div class="h-5 w-8 bg-pink-200/70 rounded-md"></div>
					<div class="h-2.5 w-12 bg-pink-200/50 rounded"></div>
				</div>
				<div class="bg-pink-50/70 border border-pink-100/80 rounded-xl p-2.5 text-center flex flex-col items-center justify-center space-y-1.5">
					<div class="h-5 w-12 bg-pink-200/70 rounded-md"></div>
					<div class="h-2.5 w-12 bg-pink-200/50 rounded"></div>
				</div>
			</div>
		{:else}
			<div class="grid grid-cols-3 gap-2 pt-1">
				<div class="bg-pink-50/70 border border-pink-100/80 rounded-xl p-2 text-center transition-all hover:bg-pink-50">
					<span class="block text-base sm:text-lg font-black text-pink-900 leading-tight">{totalMemories}</span>
					<span class="text-[9px] sm:text-[10px] text-pink-500 font-bold uppercase tracking-wider">Memories</span>
				</div>
				<div class="bg-pink-50/70 border border-pink-100/80 rounded-xl p-2 text-center transition-all hover:bg-pink-50">
					<span class="block text-base sm:text-lg font-black text-pink-900 leading-tight">{photoCount}</span>
					<span class="text-[9px] sm:text-[10px] text-pink-500 font-bold uppercase tracking-wider">Photos</span>
				</div>
				<div class="bg-pink-50/70 border border-pink-100/80 rounded-xl p-2 text-center transition-all hover:bg-pink-50">
					<span class="block text-xs sm:text-sm font-black text-[#f43f8e] truncate mt-0.5 leading-tight">{topMood}</span>
					<span class="text-[9px] sm:text-[10px] text-pink-500 font-bold uppercase tracking-wider">Top Vibe</span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Daily Inspiration Quote Card -->
	<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-4 sm:p-4.5 shadow-[0_4px_20px_rgba(244,114,182,0.06)] relative overflow-hidden font-sans">
		<div class="flex items-center justify-between mb-2">
			<div>
				<span class="text-[11px] font-black tracking-wider uppercase text-[#f43f8e]">Daily Affirmation</span>
			</div>
			<button
				onclick={shuffleQuote}
				title="Get new quote"
				class="w-6 h-6 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-500 hover:text-[#f43f8e] border border-pink-200/60 flex items-center justify-center transition-all duration-300 cursor-pointer shadow-2xs {isShuffling ? 'rotate-180 scale-95' : 'hover:rotate-45'}"
			>
				<RefreshCw class="w-3 h-3 {isShuffling ? 'animate-spin' : ''}" />
			</button>
		</div>
		<div class="transition-opacity duration-200 {isShuffling ? 'opacity-40' : 'opacity-100'}">
			<p class="text-xs sm:text-[13px] text-pink-950 font-medium italic leading-relaxed pr-2">
				"{quotes[currentQuoteIndex]?.q || quotes[currentQuoteIndex]}"
			</p>
			{#if quotes[currentQuoteIndex]?.a && quotes[currentQuoteIndex]?.a !== 'Unknown'}
				<p class="text-[10px] sm:text-[11px] text-pink-500 font-bold text-right mt-1.5 tracking-wide">
					— {quotes[currentQuoteIndex].a}
				</p>
			{/if}
		</div>
	</div>
</div>
