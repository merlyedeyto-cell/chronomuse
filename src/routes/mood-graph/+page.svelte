<script>
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import AppHeader from '$lib/AppHeader.svelte';
	import AppFooter from '$lib/AppFooter.svelte';
	import ViewMemoryModal from '$lib/ViewMemoryModal.svelte';

	let user = $state(typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('chronomuse_user') || 'null') : null);

	function getInitialMoodData() {
		if (typeof window === 'undefined' || !user?.id) return [];
		try {
			const cached = localStorage.getItem(`chronomuse_mood_cache_${user.id}_all`);
			return cached ? JSON.parse(cached) : [];
		} catch (e) {
			return [];
		}
	}

	let isLoading = $state(false);
	let hasLoadedOnce = $state(false);
	let moodData = $state(getInitialMoodData());
	let selectedPeriod = $state('all'); // Default to all time
	let sidebarOpen = $state(false);
	let hasNotifications = $state(false);

	let showViewMemoryModal = $state(false);
	let selectedMemoryDate = $state('');
	let memoriesForDate = $state([]);
	let showMoodListModal = $state(false);
	let selectedMoodTag = $state('');
	let filteredMoodMemories = $state([]);

	function openMoodListModal(moodName) {
		selectedMoodTag = moodName;
		filteredMoodMemories = moodData.filter(m => (m.mood_tag || '').toLowerCase() === moodName.toLowerCase());
		showMoodListModal = true;
	}

	function handleSelectMemoryFromMoodList(memory) {
		showMoodListModal = false;
		viewMemory(memory);
	}

	function viewMemory(memory) {
		selectedMemoryDate = memory.date || memory.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
		const sameDateMemories = moodData.filter(m => m.date === selectedMemoryDate);
		memoriesForDate = sameDateMemories.length > 0 ? sameDateMemories : [memory];
		showViewMemoryModal = true;
	}

	// Mood statistics
	let moodStats = $state({
		happy: 0,
		sad: 0,
		excited: 0,
		angry: 0,
		calm: 0,
		anxious: 0,
		grateful: 0,
		lonely: 0,
		love: 0,
		neutral: 0
	});

	let totalMemories = $state(0);
	let mostFrequentMoods = $state([]);
	let mostFrequentMoodCount = $state(0);

	// Pie chart data
	function getPieChartData() {
		const data = Object.entries(moodStats).filter(([mood, count]) => count > 0);
		let cumulativePercent = 0;
		const segments = [];
		const radius = 35;
		const circumference = 2 * Math.PI * radius; // ~219.911

		data.forEach(([mood, count]) => {
			const percent = totalMemories > 0 ? (count / totalMemories) * 100 : 0;
			const segmentLength = (percent / 100) * circumference;
			const strokeDasharray = `${segmentLength} ${circumference}`;
			const strokeDashoffset = -((cumulativePercent / 100) * circumference);
			const color = getMoodFillColor(mood.charAt(0).toUpperCase() + mood.slice(1));

			segments.push({
				mood,
				count,
				percent,
				strokeDasharray,
				strokeDashoffset,
				color
			});

			cumulativePercent += percent;
		});

		return segments;
	}

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	let periodCache = {};
	let activeFetchControllers = {};
	let autoSyncNotifsInterval = null;

	function checkNotifications() {
		if (!user || !user.id) return;
		Promise.all([
			fetch(API_ENDPOINTS.getNotifications, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id })
			}).then(r => r.json()).catch(() => null),
			fetch(API_ENDPOINTS.getChatList, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id })
			}).then(r => r.json()).catch(() => null)
		])
		.then(([notifData, chatData]) => {
			const notifCount = notifData?.data?.total_notifications_count || 0;
			const unreadChats = chatData?.data?.friends?.reduce((sum, f) => sum + (f.unread_count || 0), 0) || 0;
			hasNotifications = notifCount > 0 || unreadChats > 0;
		})
		.catch(() => {});
	}

	let allMemoriesRaw = $state(getInitialMoodData());

	function filterMemoriesByPeriod(memories, period) {
		if (!memories || !Array.isArray(memories) || memories.length === 0) return [];
		if (period === 'all') return [...memories];

		const now = new Date();
		if (period === 'week') {
			const sevenDaysAgo = new Date();
			sevenDaysAgo.setDate(now.getDate() - 7);
			const cutoff = sevenDaysAgo.toISOString().split('T')[0];
			return memories.filter(m => (m.date || m.created_at?.split('T')[0] || '') >= cutoff);
		}
		if (period === 'month') {
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(now.getDate() - 30);
			const cutoff = thirtyDaysAgo.toISOString().split('T')[0];
			return memories.filter(m => (m.date || m.created_at?.split('T')[0] || '') >= cutoff);
		}
		if (period === 'year') {
			const oneYearAgo = new Date();
			oneYearAgo.setDate(now.getDate() - 365);
			const cutoff = oneYearAgo.toISOString().split('T')[0];
			return memories.filter(m => (m.date || m.created_at?.split('T')[0] || '') >= cutoff);
		}
		return [...memories];
	}

	async function loadMoodData(isSilent = false) {
		const currentUser = user || (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('chronomuse_user') || 'null') : null);
		if (!currentUser?.id) return;
		user = currentUser;

		if (!isSilent && !hasLoadedOnce && allMemoriesRaw.length === 0) {
			isLoading = true;
		}

		if (activeFetchControllers['all']) {
			activeFetchControllers['all'].abort();
		}
		const controller = new AbortController();
		activeFetchControllers['all'] = controller;

		try {
			const res = await fetch(`${API_ENDPOINTS.getMoodData}?user_id=${currentUser.id}&period=all`, {
				signal: controller.signal
			});
			const data = await res.json();
			if (data.success && Array.isArray(data.data)) {
				allMemoriesRaw = data.data;
				try {
					localStorage.setItem(`chronomuse_mood_cache_${currentUser.id}_all`, JSON.stringify(data.data));
				} catch (e) {}
				moodData = filterMemoriesByPeriod(allMemoriesRaw, selectedPeriod);
				calculateMoodStats();
			}
		} catch (error) {
			if (error.name !== 'AbortError') {
				console.error('Error loading mood data:', error);
			}
		} finally {
			isLoading = false;
			hasLoadedOnce = true;
		}
	}

	function changePeriod(newPeriod) {
		selectedPeriod = newPeriod;
		moodData = filterMemoriesByPeriod(allMemoriesRaw, newPeriod);
		calculateMoodStats();
	}

	onMount(() => {
		const storedUser = localStorage.getItem('chronomuse_user');
		if (storedUser) {
			user = JSON.parse(storedUser);
			calculateMoodStats();
			loadMoodData(false);
			checkNotifications();
		} else {
			goto('/');
		}

		const handleRealtimeUpdate = () => {
			if (user && user.id) {
				loadMoodData(true);
				checkNotifications();
			}
		};

		const handleAuthChange = () => {
			const updatedUser = localStorage.getItem('chronomuse_user');
			if (updatedUser) {
				user = JSON.parse(updatedUser);
				loadMoodData(true);
				checkNotifications();
			} else {
				goto('/');
			}
		};

		window.addEventListener('chronomuse_memory_change', handleRealtimeUpdate);
		window.addEventListener('chronomuse_friend_change', handleRealtimeUpdate);
		window.addEventListener('chronomuse_notification_change', handleRealtimeUpdate);
		window.addEventListener('chronomuse_chat_change', handleRealtimeUpdate);
		window.addEventListener('chronomuse_auth_change', handleAuthChange);

		autoSyncNotifsInterval = setInterval(() => {
			checkNotifications();
		}, 8000);

		return () => {
			if (autoSyncNotifsInterval) clearInterval(autoSyncNotifsInterval);
			window.removeEventListener('chronomuse_memory_change', handleRealtimeUpdate);
			window.removeEventListener('chronomuse_friend_change', handleRealtimeUpdate);
			window.removeEventListener('chronomuse_notification_change', handleRealtimeUpdate);
			window.removeEventListener('chronomuse_chat_change', handleRealtimeUpdate);
			window.removeEventListener('chronomuse_auth_change', handleAuthChange);
		};
	});

	function calculateMoodStats() {
		// Reset stats
		moodStats = {
			happy: 0,
			sad: 0,
			excited: 0,
			angry: 0,
			calm: 0,
			anxious: 0,
			grateful: 0,
			lonely: 0,
			love: 0,
			neutral: 0
		};
		
		// Count moods
		moodData.forEach(memory => {
			const tag = (memory.mood_tag || '').toLowerCase().trim();
			if (tag && moodStats.hasOwnProperty(tag)) {
				moodStats[tag]++;
			}
		});
		
		totalMemories = moodData.length;
		
		// Find all dominant moods sharing the maximum count
		if (totalMemories > 0) {
			const maxVal = Math.max(...Object.values(moodStats));
			if (maxVal > 0) {
				mostFrequentMoodCount = maxVal;
				mostFrequentMoods = Object.entries(moodStats)
					.filter(([_, count]) => count === maxVal)
					.map(([m]) => m.charAt(0).toUpperCase() + m.slice(1));
			} else {
				mostFrequentMoodCount = 0;
				mostFrequentMoods = [];
			}
		} else {
			mostFrequentMoodCount = 0;
			mostFrequentMoods = [];
		}
	}

	function getMoodColor(mood) {
		const colors = {
			'Happy': 'bg-amber-400 text-amber-900 border-amber-300',
			'Sad': 'bg-blue-400 text-white border-blue-300',
			'Excited': 'bg-orange-400 text-white border-orange-300',
			'Angry': 'bg-rose-500 text-white border-rose-400',
			'Calm': 'bg-emerald-400 text-white border-emerald-300',
			'Anxious': 'bg-purple-400 text-white border-purple-300',
			'Grateful': 'bg-pink-400 text-white border-pink-300',
			'Lonely': 'bg-slate-400 text-white border-slate-300',
			'Love': 'bg-rose-400 text-white border-rose-300',
			'Neutral': 'bg-gray-400 text-white border-gray-300'
		};
		return colors[mood] || 'bg-[#f43f8e] text-white border-pink-300';
	}

	function getMoodFillColor(mood) {
		const colors = {
			'Happy': '#F59E0B',
			'Sad': '#3B82F6',
			'Excited': '#F97316',
			'Angry': '#F43F5E',
			'Calm': '#10B981',
			'Anxious': '#8B5CF6',
			'Grateful': '#EC4899',
			'Lonely': '#64748B',
			'Love': '#FB7185',
			'Neutral': '#94A3B8'
		};
		return colors[mood] || '#F43F8E';
	}

	function getMoodPercentage(mood) {
		if (totalMemories === 0) return 0;
		return Math.round((moodStats[mood.toLowerCase()] / totalMemories) * 100);
	}

	let recentTenMemories = $derived(
		[...moodData]
			.sort((a, b) => new Date(b.date || b.created_at || 0).getTime() - new Date(a.date || a.created_at || 0).getTime())
			.slice(0, 10)
	);
</script>

<svelte:head>
	<title>Mood Graph - ChronoMuse</title>
</svelte:head>

<div class="flex flex-col min-h-screen bg-[#fff0f5] animate-fade-in font-sans">
	<!-- Top Navigation -->
	<AppHeader />

	<!-- Main Content -->
	<main class="flex-grow container mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8 pb-24 sm:pb-28 max-w-4xl lg:max-w-6xl xl:max-w-7xl">
		<!-- Header Banner -->
		<div class="bg-white border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 mb-4 shadow-[0_4px_20px_rgba(244,114,182,0.08)] animate-fade-in-up">
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
				<div>
					<div class="flex items-center space-x-2 mb-0.5">
						<button
							onclick={() => goto('/dashboard')}
							class="w-7 h-7 rounded-xl bg-pink-50 hover:bg-pink-100 text-[#f43f8e] border border-pink-100 flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer shadow-2xs"
							title="Back to Dashboard"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
							</svg>
						</button>
						<h1 class="text-sm sm:text-base font-black text-[#f43f8e]">Mood Graph</h1>
					</div>
					<p class="text-[11px] text-pink-400 font-bold ml-9">Track your emotional journey and mood trends over time</p>
				</div>

				<!-- Period Selector -->
				<div class="flex items-center gap-1 bg-[#fdf2f6] p-1 rounded-2xl border border-pink-100 shadow-2xs self-start sm:self-auto flex-wrap">
					<button
						onclick={() => changePeriod('all')}
						class="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 text-center cursor-pointer {selectedPeriod === 'all' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-700 hover:text-[#f43f8e] hover:bg-white/70'}"
					>
						All Time
					</button>
					<button
						onclick={() => changePeriod('week')}
						class="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 text-center cursor-pointer {selectedPeriod === 'week' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-700 hover:text-[#f43f8e] hover:bg-white/70'}"
					>
						This Week
					</button>
					<button
						onclick={() => changePeriod('month')}
						class="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 text-center cursor-pointer {selectedPeriod === 'month' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-700 hover:text-[#f43f8e] hover:bg-white/70'}"
					>
						This Month
					</button>
					<button
						onclick={() => changePeriod('year')}
						class="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 text-center cursor-pointer {selectedPeriod === 'year' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-700 hover:text-[#f43f8e] hover:bg-white/70'}"
					>
						This Year
					</button>
				</div>
			</div>
		</div>

		<!-- Mood Statistics Cards (Compact Grid) -->
		<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3 mb-4 animate-fade-in-up" style="animation-delay: 0.1s">
			<!-- Most Frequent Mood(s) -->
			{#if mostFrequentMoods.length > 0}
				{#each mostFrequentMoods as dominantMoodItem}
					<button
						onclick={() => openMoodListModal(dominantMoodItem)}
						class="bg-gradient-to-br from-[#f43f8e] to-[#e0337f] border border-pink-400/40 rounded-2xl p-3 sm:p-3.5 text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-98 text-left cursor-pointer shadow-[0_4px_14px_rgba(244,63,142,0.25)] flex flex-col justify-between"
					>
						<div class="flex items-center space-x-1.5 mb-1 opacity-90">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0V5.625a1.125 1.125 0 011.125-1.125h2.25c1.052 0 2.125.703 2.125 2.25v0c0 1.125-.872 2.25-2.125 2.25h-2.25m-9 0h2.25c1.052 0 2.125-.703 2.125-2.25v0c0-1.125-.872-2.25-2.125-2.25H9.497m0 14.25V5.625a1.125 1.125 0 011.125-1.125h2.25c1.052 0 2.125.703 2.125 2.25v0c0 1.125-.872 2.25-2.125 2.25h-2.25" />
							</svg>
							<span class="text-[10px] font-bold uppercase tracking-wider">{mostFrequentMoods.length > 1 ? 'Dominant' : 'Frequent'}</span>
						</div>
						<div>
							<p class="text-base sm:text-lg font-black leading-tight">{dominantMoodItem}</p>
							<p class="text-[10px] text-pink-100 font-medium mt-0.5">{mostFrequentMoodCount} {mostFrequentMoodCount === 1 ? 'memory' : 'memories'}</p>
						</div>
					</button>
				{/each}
			{/if}

			<!-- Mood Cards (Only moods with memories > 0) -->
			{#each Object.entries(moodStats) as [moodKey, count]}
				{#if count > 0}
					{@const moodName = moodKey.charAt(0).toUpperCase() + moodKey.slice(1)}
					<button
						onclick={() => openMoodListModal(moodName)}
						class="bg-white/95 border border-pink-100/90 rounded-2xl p-3 sm:p-3.5 transition-all duration-200 hover:-translate-y-0.5 active:scale-98 text-left cursor-pointer shadow-[0_2px_10px_rgba(244,114,182,0.06)] hover:border-pink-200 flex flex-col justify-between"
					>
						<div class="flex items-center justify-between mb-1.5">
							<div class="flex items-center space-x-1.5 min-w-0">
								<span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: {getMoodFillColor(moodName)}"></span>
								<span class="text-xs font-bold text-pink-950 truncate">{moodName}</span>
							</div>
							<span class="text-xs font-black" style="color: {getMoodFillColor(moodName)}">{getMoodPercentage(moodKey)}%</span>
						</div>
						<div>
							<div class="w-full bg-pink-50 rounded-full h-1.5 overflow-hidden">
								<div class="h-1.5 rounded-full transition-all duration-500" style="width: {getMoodPercentage(moodKey)}%; background-color: {getMoodFillColor(moodName)};"></div>
							</div>
							<p class="text-[10px] text-pink-600/80 font-medium mt-1.5">{count} {count === 1 ? 'memory' : 'memories'}</p>
						</div>
					</button>
				{/if}
			{/each}
		</div>

		<!-- Pie Chart and Mood Distribution (Compact side-by-side) -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 animate-fade-in-up" style="animation-delay: 0.2s">
			<!-- Donut Chart -->
			<div class="bg-white border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-[0_4px_20px_rgba(244,114,182,0.08)]">
				<div class="flex items-center space-x-1.5 mb-3">
					<div class="w-5 h-5 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3 h-3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
							<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
						</svg>
					</div>
					<h2 class="text-xs sm:text-sm font-black text-pink-950">Mood Breakdown</h2>
				</div>

				{#if totalMemories > 0}
					<div class="flex flex-col items-center">
						<!-- SVG Donut Chart -->
						<div class="relative w-36 h-36 sm:w-40 sm:h-40 my-1">
							<svg viewBox="0 0 100 100" class="w-full h-full transform -rotate-90">
								{#each getPieChartData() as segment}
									<circle
										cx="50"
										cy="50"
										r="35"
										fill="none"
										stroke={segment.color}
										stroke-width="13"
										stroke-dasharray={segment.strokeDasharray}
										stroke-dashoffset={segment.strokeDashoffset}
										class="transition-all duration-500 cursor-pointer hover:opacity-85 focus:outline-none"
										role="button"
										tabindex="0"
										aria-label={`View ${segment.mood} memories`}
										onclick={() => openMoodListModal(segment.mood)}
										onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openMoodListModal(segment.mood); }}
									/>
								{/each}
							</svg>
							<!-- Center text -->
							<div class="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
								<span class="text-lg sm:text-xl font-black text-[#f43f8e]">{totalMemories}</span>
								<span class="text-[9px] text-pink-400 font-bold uppercase tracking-wider">Total</span>
							</div>
						</div>

						<!-- Legend with exact counts & percentages -->
						<div class="mt-2.5 grid grid-cols-2 gap-1.5 w-full">
							{#each getPieChartData() as segment}
								<button
									onclick={() => openMoodListModal(segment.mood)}
									class="flex items-center justify-between p-1.5 rounded-xl bg-pink-50/50 hover:bg-pink-100/70 border border-pink-100/80 transition-all text-left group cursor-pointer active:scale-98"
								>
									<div class="flex items-center space-x-1.5 min-w-0">
										<div class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: {segment.color}"></div>
										<span class="text-[11px] text-pink-900 capitalize font-bold truncate group-hover:text-[#f43f8e]">{segment.mood}</span>
									</div>
									<div class="text-right flex-shrink-0 ml-1">
										<span class="text-[11px] font-black text-[#f43f8e]">{segment.count}</span>
										<span class="text-[9px] text-pink-400 ml-0.5">({Math.round(segment.percent)}%)</span>
									</div>
								</button>
							{/each}
						</div>
					</div>
				{:else}
					<p class="text-center text-pink-400 py-8 text-xs font-medium">No mood data available for this period</p>
				{/if}
			</div>

			<!-- Mood Distribution Bars -->
			<div class="bg-white border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-[0_4px_20px_rgba(244,114,182,0.08)] flex flex-col">
				<div class="flex items-center space-x-1.5 mb-3">
					<div class="w-5 h-5 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3 h-3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
						</svg>
					</div>
					<h2 class="text-xs sm:text-sm font-black text-pink-950">Mood Distribution</h2>
				</div>

				<div class="space-y-2 flex-grow overflow-y-auto">
					{#each Object.entries(moodStats) as [mood, count]}
						{#if count > 0}
							{@const moodName = mood.charAt(0).toUpperCase() + mood.slice(1)}
							<button
								onclick={() => openMoodListModal(mood)}
								class="w-full flex items-center space-x-2 p-1.5 rounded-xl hover:bg-pink-50/70 border border-transparent hover:border-pink-100 transition-all text-left group cursor-pointer active:scale-99"
							>
								<span class="text-xs font-bold text-pink-900 w-16 capitalize group-hover:text-[#f43f8e] transition-colors">{mood}</span>
								<div class="flex-1 bg-pink-50 rounded-full h-2.5 overflow-hidden">
									<div
										class="h-2.5 rounded-full transition-all duration-500 {getMoodColor(moodName)}"
										style="width: {getMoodPercentage(mood)}%"
									></div>
								</div>
								<span class="text-xs font-black text-[#f43f8e] w-8 text-right">{count}</span>
							</button>
						{/if}
					{/each}
					{#if totalMemories === 0}
						<p class="text-center text-pink-400 py-8 text-xs font-medium">No mood data available for this period</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- 10 Recent Memories Section -->
		<div class="bg-white border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-[0_4px_20px_rgba(244,114,182,0.08)] animate-fade-in-up" style="animation-delay: 0.3s">
			<div class="flex items-center space-x-1.5 mb-3">
				<div class="w-5 h-5 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3 h-3">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</div>
				<h2 class="text-xs sm:text-sm font-black text-pink-950">10 Recent Memories</h2>
			</div>

			{#if recentTenMemories.length > 0}
				<div class="space-y-1.5 max-h-72 overflow-y-auto pr-1">
					{#each recentTenMemories as memory}
						<button
							onclick={() => viewMemory(memory)}
							class="w-full flex items-center space-x-2.5 p-2 sm:p-2.5 bg-[#fdf2f6]/60 border border-pink-100/80 hover:border-pink-200 rounded-xl transition-all duration-200 text-left cursor-pointer group hover:bg-[#fff5f8] active:scale-[0.99] shadow-2xs"
						>
							<div class="w-2.5 h-2.5 rounded-full {getMoodColor(memory.mood_tag)} flex-shrink-0"></div>
							<div class="flex-1 min-w-0">
								<p class="text-xs font-bold text-pink-950 truncate group-hover:text-[#f43f8e] transition-colors">
									{memory.description || memory.memory_tag || 'Untitled Memory'}
								</p>
								<p class="text-[10px] text-pink-400 font-medium">{memory.date}</p>
							</div>
							{#if memory.mood_tag}
								<span class="text-[9px] px-2 py-0.5 rounded-full bg-pink-100 text-[#f43f8e] font-bold border border-pink-200/80 flex-shrink-0">
									{memory.mood_tag}
								</span>
							{/if}
						</button>
					{/each}
				</div>
			{:else}
				<div class="text-center py-6">
					<p class="text-xs font-bold text-pink-400">No memories recorded yet</p>
				</div>
			{/if}
		</div>
	</main>

	<!-- Mood List Modal Popup -->
	{#if showMoodListModal}
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in overflow-y-auto"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onclick={(e) => { if (e.target === e.currentTarget) showMoodListModal = false; }}
			onkeydown={(e) => { if (e.key === 'Escape') showMoodListModal = false; }}
		>
			<div
				class="bg-white border border-pink-100 rounded-3xl max-w-sm sm:max-w-md w-full p-4 sm:p-5 relative my-auto shadow-2xl animate-scale-up max-h-[85vh] overflow-y-auto"
			>
				<!-- Close Button -->
				<button
					onclick={() => showMoodListModal = false}
					class="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
					title="Close"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>

				<!-- Modal Header -->
				<div class="text-center mb-3 pr-6">
					<h2 class="text-sm sm:text-base font-black text-pink-950 flex items-center justify-center gap-1.5 capitalize">
						<span>Memories Tagged as "{selectedMoodTag}"</span>
					</h2>
					<p class="text-[11px] text-pink-400 font-bold mt-0.5">Found {filteredMoodMemories.length} {filteredMoodMemories.length === 1 ? 'memory' : 'memories'}</p>
				</div>

				<!-- Memories List -->
				{#if filteredMoodMemories.length > 0}
					<div class="space-y-1.5 max-h-64 overflow-y-auto pr-1">
						{#each filteredMoodMemories as memory}
							<button
								onclick={() => handleSelectMemoryFromMoodList(memory)}
								class="w-full flex items-center space-x-2.5 p-2 sm:p-2.5 bg-pink-50/50 hover:bg-pink-100/60 border border-pink-100/80 hover:border-pink-200 rounded-xl transition-all duration-200 text-left cursor-pointer group active:scale-[0.99] shadow-2xs"
							>
								<div class="w-2.5 h-2.5 rounded-full {getMoodColor(memory.mood_tag)} flex-shrink-0"></div>
								<div class="flex-1 min-w-0">
									<p class="text-xs font-bold text-pink-950 truncate group-hover:text-[#f43f8e] transition-colors">
										{memory.description || memory.memory_tag || 'Untitled Memory'}
									</p>
									<p class="text-[10px] text-pink-400 font-medium">{memory.date}</p>
								</div>
								<span class="text-[9px] px-2 py-0.5 rounded-full bg-pink-100 text-[#f43f8e] font-bold border border-pink-200/80 flex-shrink-0 group-hover:bg-[#f43f8e] group-hover:text-white transition-colors">
									View Details →
								</span>
							</button>
						{/each}
					</div>
				{:else}
					<div class="text-center py-6 bg-pink-50/50 rounded-2xl border border-pink-100">
						<p class="text-xs font-bold text-pink-600">No memories tagged with "{selectedMoodTag}" yet.</p>
						<p class="text-[11px] text-pink-400 font-medium mt-0.5">Start capturing your moments on the dashboard!</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- View Memory Modal -->
	{#if showViewMemoryModal}
		<ViewMemoryModal
			selectedDate={selectedMemoryDate}
			memories={memoriesForDate}
			on:close={() => showViewMemoryModal = false}
		/>
	{/if}

	<!-- Bottom Navigation Bar (Footer) -->
	<AppFooter />
</div>

<style>
	@keyframes fade-in {
		0% {
			opacity: 0;
		}
		100% {
			opacity: 1;
		}
	}

	.animate-fade-in {
		animation: fade-in 0.4s ease-out;
	}

	@keyframes fade-in-up {
		0% {
			opacity: 0;
			transform: translateY(16px);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fade-in-up {
		animation: fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	@keyframes scale-up {
		0% {
			opacity: 0;
			transform: scale(0.95);
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}

	.animate-scale-up {
		animation: scale-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}
</style>
