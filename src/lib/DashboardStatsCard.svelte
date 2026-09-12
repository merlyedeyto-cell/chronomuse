<script>
	import { onMount } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { playClickSound } from '$lib/soundEffects.js';

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

	$effect(() => {
		if (userId) {
			loadStats();
		}
	});

	onMount(() => {
		const today = new Date();
		currentQuoteIndex = today.getDate() % quotes.length;

		if (userId) {
			loadStats();
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
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 text-[#f43f8e]">
						<path fill-rule="evenodd" d="M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.177A7.547 7.547 0 016.6 11.25a7.5 7.5 0 0014.28 2.657 9.747 9.747 0 00-3.418-8.799 15.08 15.08 0 00-4.499-2.822zM12 7.5a6 6 0 00-4.5 9.975A6.002 6.002 0 0018 15c0-1.637-.654-3.12-1.716-4.204a11.968 11.968 0 01-1.859-2.028A7.508 7.508 0 0112 7.5z" clip-rule="evenodd" />
					</svg>
				</div>
				<div>
					<h3 class="text-xs sm:text-sm font-black text-pink-950 leading-tight">Memory Streak</h3>
					<p class="text-[10px] text-pink-400 font-bold">Daily journal momentum</p>
				</div>
			</div>
			<span class="text-[11px] font-black bg-pink-50 text-[#f43f8e] border border-pink-200/80 px-2.5 py-1 rounded-full flex items-center space-x-1.5 shadow-2xs">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5 text-[#f43f8e]">
					<path fill-rule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.316.492-.59 1.043-.843 1.603C8.75 5.8 8.04 7.42 8 8.5c0 .247.02.484.058.71a5.006 5.006 0 00-1.61-.476 1 1 0 00-.916 1.543c.478.775 1.157 1.554 1.956 2.193C8.423 13.2 9.61 14 11 14c3.314 0 6-2.686 6-6 0-1.95-1.118-3.666-2.605-4.447z" clip-rule="evenodd" />
				</svg>
				<span>{streakDays} {streakDays === 1 ? 'Day' : 'Days'}</span>
			</span>
		</div>

		<!-- Quick Metric Pills -->
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
	</div>

	<!-- Daily Inspiration Quote Card -->
	<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-4 sm:p-4.5 shadow-[0_4px_20px_rgba(244,114,182,0.06)] relative overflow-hidden font-sans">
		<div class="flex items-center justify-between mb-2">
			<div class="flex items-center space-x-1.5">
				<div class="w-6 h-6 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
					<!-- Daily Affirmation Heart SVG -->
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 text-[#f43f8e]">
						<path d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
					</svg>
				</div>
				<span class="text-[11px] font-black tracking-wider uppercase text-[#f43f8e]">Daily Affirmation</span>
			</div>
			<button
				onclick={shuffleQuote}
				title="Get new quote"
				class="w-6 h-6 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-500 hover:text-[#f43f8e] border border-pink-200/60 flex items-center justify-center transition-all active:rotate-180 duration-300 cursor-pointer shadow-2xs"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.3" stroke="currentColor" class="w-3 h-3">
					<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
				</svg>
			</button>
		</div>
		<p class="text-xs sm:text-[13px] text-pink-950 font-medium italic leading-relaxed mb-1.5 pr-2">
			"{quotes[currentQuoteIndex].text}"
		</p>
		<p class="text-[10px] text-pink-400 font-bold text-right">— {quotes[currentQuoteIndex].author}</p>
	</div>
</div>
