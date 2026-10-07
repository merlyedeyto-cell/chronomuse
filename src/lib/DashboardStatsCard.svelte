<script>
	import { onMount, untrack } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { playClickSound } from '$lib/soundEffects.js';
	import { Flame, Heart, RefreshCw } from 'lucide-svelte';

	let { userId = null, memoriesData = {} } = $props();

	let totalMemories = $state(0);
	let photoCount = $state(0);
	let streakDays = $state(1);
	let topMood = $state('Happy');
	let isLoading = $state(true);

	// Daily affirmations / inspiration quotes (clean, elegant text without emojis)
	const quotes = [
		{ text: "Every day holds a special little moment worth remembering.", author: "ChronoMuse" },
		{ text: "Collect beautiful moments, not just things.", author: "Daily Note" },
		{ text: "Your story is unique, precious, and worth saving.", author: "Reflection" },
		{ text: "Small reflections today become cherished treasures tomorrow.", author: "Mindful Living" },
		{ text: "Smile, breathe, and capture the joy in today.", author: "Daily Vibe" },
		{ text: "Gratitude turns what we have into enough.", author: "Heartfelt" },
		{ text: "Make each day a masterpiece in your timeline.", author: "Chronicle" }
	];

	let currentQuoteIndex = $state(0);

	function shuffleQuote() {
		playClickSound();
		currentQuoteIndex = (currentQuoteIndex + 1) % quotes.length;
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

				calculateStreak(memories);
				calculateTopMood(memories);
			}
		} catch (err) {
			console.error('Error loading dashboard stats:', err);
		} finally {
			isLoading = false;
		}
	}

	function calculateStreak(memories) {
		if (!memories || memories.length === 0) {
			streakDays = 0;
			return;
		}

		const uniqueDates = [...new Set(memories.map(m => m.date).filter(Boolean))].sort().reverse();
		if (uniqueDates.length === 0) {
			streakDays = 0;
			return;
		}

		const today = new Date();
		const todayStr = today.toISOString().split('T')[0];
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const yesterdayStr = yesterday.toISOString().split('T')[0];

		const latestDate = uniqueDates[0];
		if (latestDate !== todayStr && latestDate !== yesterdayStr) {
			streakDays = 1;
			return;
		}

		let streak = 0;
		let checkDate = new Date(latestDate);

		for (const dStr of uniqueDates) {
			const curr = new Date(dStr);
			const diffDays = Math.round((checkDate - curr) / (1000 * 60 * 60 * 24));
			if (diffDays <= 1) {
				streak++;
				checkDate = curr;
			} else {
				break;
			}
		}

		streakDays = Math.max(streak, 1);
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
			<div class="flex items-center space-x-1.5">
				<div class="w-6 h-6 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
					<!-- Memory Streak Flame SVG -->
					<Flame class="w-3.5 h-3.5 text-[#f43f8e]" />
				</div>
				<div>
					<h3 class="text-xs sm:text-sm font-black text-pink-950 leading-tight">Memory Streak</h3>
					<p class="text-[10px] text-pink-400 font-bold">Daily journal momentum</p>
				</div>
			</div>
			{#if isLoading}
				<div class="h-6 w-16 bg-pink-100/80 rounded-full animate-pulse"></div>
			{:else}
				<span class="text-[11px] font-black bg-pink-50 text-[#f43f8e] border border-pink-200/80 px-2.5 py-1 rounded-full flex items-center space-x-1.5 shadow-2xs">
					<Flame class="w-3.5 h-3.5 text-[#f43f8e]" />
					<span>{streakDays} {streakDays === 1 ? 'Day' : 'Days'}</span>
				</span>
			{/if}
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
			<div class="flex items-center space-x-1.5">
				<div class="w-6 h-6 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
					<!-- Daily Affirmation Heart SVG -->
					<Heart class="w-3.5 h-3.5 text-[#f43f8e] fill-current" />
				</div>
				<span class="text-[11px] font-black tracking-wider uppercase text-[#f43f8e]">Daily Affirmation</span>
			</div>
			<button
				onclick={shuffleQuote}
				title="Get new quote"
				class="w-6 h-6 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-500 hover:text-[#f43f8e] border border-pink-200/60 flex items-center justify-center transition-all active:rotate-180 duration-300 cursor-pointer shadow-2xs"
			>
				<RefreshCw class="w-3 h-3" />
			</button>
		</div>
		<p class="text-xs sm:text-[13px] text-pink-950 font-medium italic leading-relaxed mb-1.5 pr-2">
			"{quotes[currentQuoteIndex].text}"
		</p>
		<p class="text-[10px] text-pink-400 font-bold text-right">— {quotes[currentQuoteIndex].author}</p>
	</div>
</div>
