<script>
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import AppHeader from '$lib/AppHeader.svelte';
	import AppFooter from '$lib/AppFooter.svelte';

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

	function handleLogout() {
		try {
			supabase.removeAllChannels();
		} catch (e) {}
		localStorage.clear();
		sessionStorage.clear();
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new Event('chronomuse_auth_change'));
		}
		window.location.href = '/';
	}

	function handleSidebarLogout() {
		try {
			supabase.removeAllChannels();
		} catch (e) {}
		localStorage.clear();
		sessionStorage.clear();
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new Event('chronomuse_auth_change'));
		}
		goto('/');
	}

	function handleHome() {
		goto('/dashboard');
	}

	function handleMoodGraph() {
		// Already on mood graph page
	}

	function getMoodColor(mood) {
		const colors = {
			'Happy': 'bg-yellow-400 text-yellow-900 border-yellow-300',
			'Sad': 'bg-blue-400 text-white border-blue-300',
			'Excited': 'bg-orange-400 text-white border-orange-300',
			'Angry': 'bg-red-400 text-white border-red-300',
			'Calm': 'bg-green-400 text-white border-green-300',
			'Anxious': 'bg-purple-400 text-white border-purple-300',
			'Grateful': 'bg-pink-400 text-white border-pink-300',
			'Lonely': 'bg-gray-400 text-white border-gray-300',
			'Love': 'bg-rose-400 text-white border-rose-300',
			'Neutral': 'bg-slate-400 text-white border-slate-300'
		};
		return colors[mood] || 'bg-pink-400 text-white border-pink-300';
	}

	function getMoodFillColor(mood) {
		const colors = {
			'Happy': '#FBBF24',
			'Sad': '#60A5FA',
			'Excited': '#FB923C',
			'Angry': '#F87171',
			'Calm': '#4ADE80',
			'Anxious': '#A78BFA',
			'Grateful': '#F472B6',
			'Lonely': '#9CA3AF',
			'Love': '#FB7185',
			'Neutral': '#94A3B8'
		};
		return colors[mood] || '#F472B6';
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

<div class="flex flex-col min-h-screen bg-pink-100 animate-fade-in">
	<!-- Top Navigation -->
	<AppHeader />

	<!-- Main Content -->
	<main class="flex-grow px-4 py-6 sm:py-8 pb-28 sm:pb-32 md:ml-0 overflow-hidden">
			<div class="container mx-auto max-w-6xl">
				<!-- Header Banner -->
				<div class="bg-white border-2 border-pink-300 rounded-2xl p-3.5 sm:p-4 mb-4 sm:mb-5 animate-fade-in-up">
					<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
						<div>
							<div class="flex items-center space-x-2 mb-0.5">
								<button
									onclick={() => goto('/dashboard')}
									class="p-1 sm:p-1.5 text-pink-500 hover:text-pink-700 hover:bg-pink-100 rounded-lg transition-all duration-200"
									title="Back to Dashboard"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 sm:w-5 sm:h-5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
									</svg>
								</button>
								<h1 class="text-base sm:text-lg font-extrabold text-pink-600">Mood Graph</h1>
							</div>
							<p class="text-[11px] sm:text-xs text-pink-400 ml-7 sm:ml-8">Track your emotional journey and mood trends over time</p>
						</div>

						<!-- Period Selector -->
						<div class="flex items-center space-x-1 bg-pink-100 p-1 rounded-xl border border-pink-200 self-start sm:self-auto flex-wrap gap-1">
							<button
								onclick={() => changePeriod('all')}
								class="px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all duration-200 active:scale-95 text-center"
								class:bg-pink-500={selectedPeriod === 'all'}
								class:text-white={selectedPeriod === 'all'}
								class:text-pink-600={selectedPeriod !== 'all'}
								class:hover:bg-pink-200={selectedPeriod !== 'all'}
							>
								All Time
							</button>
							<button
								onclick={() => changePeriod('week')}
								class="px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all duration-200 active:scale-95 text-center"
								class:bg-pink-500={selectedPeriod === 'week'}
								class:text-white={selectedPeriod === 'week'}
								class:text-pink-600={selectedPeriod !== 'week'}
								class:hover:bg-pink-200={selectedPeriod !== 'week'}
							>
								This Week
							</button>
							<button
								onclick={() => changePeriod('month')}
								class="px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all duration-200 active:scale-95 text-center"
								class:bg-pink-500={selectedPeriod === 'month'}
								class:text-white={selectedPeriod === 'month'}
								class:text-pink-600={selectedPeriod !== 'month'}
								class:hover:bg-pink-200={selectedPeriod !== 'month'}
							>
								This Month
							</button>
							<button
								onclick={() => changePeriod('year')}
								class="px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all duration-200 active:scale-95 text-center"
								class:bg-pink-500={selectedPeriod === 'year'}
								class:text-white={selectedPeriod === 'year'}
								class:text-pink-600={selectedPeriod !== 'year'}
								class:hover:bg-pink-200={selectedPeriod !== 'year'}
							>
								This Year
							</button>
						</div>
					</div>
				</div>

				<!-- Mood Statistics Cards -->
				<div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 animate-fade-in-up" style="animation-delay: 0.3s">
					<!-- Most Frequent Mood(s) - Handles Ties so no mood is left over -->
					{#if mostFrequentMoods.length > 0}
						{#each mostFrequentMoods as dominantMoodItem}
							<button
								onclick={() => openMoodListModal(dominantMoodItem)}
								class="bg-pink-500 border-2 border-pink-600 rounded-2xl p-4 text-white transition-all duration-300 hover:-translate-y-1 text-left cursor-pointer"
							>
								<div class="flex items-center space-x-2 mb-2">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0V5.625a1.125 1.125 0 011.125-1.125h2.25c1.052 0 2.125.703 2.125 2.25v0c0 1.125-.872 2.25-2.125 2.25h-2.25m-9 0h2.25c1.052 0 2.125-.703 2.125-2.25v0c0-1.125-.872-2.25-2.125-2.25H9.497m0 14.25V5.625a1.125 1.125 0 011.125-1.125h2.25c1.052 0 2.125.703 2.125 2.25v0c0 1.125-.872 2.25-2.125 2.25h-2.25" />
									</svg>
									<span class="text-xs font-medium">{mostFrequentMoods.length > 1 ? 'Dominant (Tied)' : 'Most Frequent'}</span>
								</div>
								<p class="text-xl font-bold">{dominantMoodItem}</p>
								<p class="text-xs text-pink-100 mt-1">{mostFrequentMoodCount} {mostFrequentMoodCount === 1 ? 'memory' : 'memories'}</p>
							</button>
						{/each}
					{/if}

					<!-- Mood Cards (Only moods with memories > 0) -->
					{#each Object.entries(moodStats) as [moodKey, count]}
						{#if count > 0}
							{@const moodName = moodKey.charAt(0).toUpperCase() + moodKey.slice(1)}
							<button
								onclick={() => openMoodListModal(moodName)}
								class="bg-white border-2 rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 text-left cursor-pointer"
								style="border-color: {getMoodFillColor(moodName)};"
							>
								<div class="flex items-center justify-between mb-2">
									<div class="flex items-center space-x-1.5 min-w-0">
										<span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: {getMoodFillColor(moodName)}"></span>
										<span class="text-xs font-bold text-pink-900 truncate">{moodName}</span>
									</div>
									<span class="text-xs font-black" style="color: {getMoodFillColor(moodName)}">{getMoodPercentage(moodKey)}%</span>
								</div>
								<div class="w-full bg-pink-100 rounded-full h-2 overflow-hidden">
									<div class="h-2 rounded-full transition-all duration-300" style="width: {getMoodPercentage(moodKey)}%; background-color: {getMoodFillColor(moodName)};"></div>
								</div>
								<p class="text-xs text-pink-700 font-medium mt-2">{count} {count === 1 ? 'memory' : 'memories'}</p>
							</button>
						{/if}
					{/each}
				</div>

				<!-- Pie Chart and Mood Distribution -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 animate-fade-in-up" style="animation-delay: 0.4s">
					<!-- Pie Chart -->
					<div class="bg-white border-2 border-pink-300 rounded-2xl p-4 sm:p-5 transition-all duration-300">
						<h2 class="text-xs sm:text-sm font-bold text-pink-600 mb-3 uppercase tracking-wide">Mood Breakdown</h2>
						{#if totalMemories > 0}
							<div class="flex flex-col items-center">
								<!-- SVG Donut Chart -->
								<div class="relative w-44 h-44 sm:w-52 sm:h-52">
									<svg viewBox="0 0 100 100" class="w-full h-full transform -rotate-90">
										{#each getPieChartData() as segment}
											<circle
												cx="50"
												cy="50"
												r="35"
												fill="none"
												stroke={segment.color}
												stroke-width="14"
												stroke-dasharray={segment.strokeDasharray}
												stroke-dashoffset={segment.strokeDashoffset}
												class="transition-all duration-500 cursor-pointer hover:opacity-90 focus:outline-hidden"
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
										<span class="text-xl font-black text-pink-600">{totalMemories}</span>
										<span class="text-[10px] text-pink-400 font-semibold uppercase">Total</span>
									</div>
								</div>

								<!-- Legend with exact counts & percentages -->
								<div class="mt-3 grid grid-cols-2 gap-1.5 w-full">
									{#each getPieChartData() as segment}
										<button
											onclick={() => openMoodListModal(segment.mood)}
											class="flex items-center justify-between p-1.5 rounded-lg bg-pink-50 hover:bg-pink-100 border border-pink-200 transition-all duration-200 text-left group"
										>
											<div class="flex items-center space-x-1.5 min-w-0">
												<div class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: {segment.color}"></div>
												<span class="text-[11px] text-pink-700 capitalize font-bold truncate group-hover:text-pink-600">{segment.mood}</span>
											</div>
											<div class="text-right flex-shrink-0 ml-1">
												<span class="text-[11px] font-extrabold text-pink-600">{segment.count}</span>
												<span class="text-[9px] text-pink-400 ml-0.5">({Math.round(segment.percent)}%)</span>
											</div>
										</button>
									{/each}
								</div>
							</div>
						{:else}
							<p class="text-center text-pink-400 py-8 text-xs">No mood data available for this period</p>
						{/if}
					</div>

					<!-- Mood Bars Chart -->
					<div class="bg-white border-2 border-pink-300 rounded-2xl p-4 sm:p-5 transition-all duration-300">
						<h2 class="text-xs sm:text-sm font-bold text-pink-600 mb-3 uppercase tracking-wide">Mood Distribution</h2>
						<div class="space-y-2.5">
							{#each Object.entries(moodStats) as [mood, count]}
								{#if count > 0}
									<button
										onclick={() => openMoodListModal(mood)}
										class="w-full flex items-center space-x-2.5 p-1 rounded-lg hover:bg-pink-50 transition-colors text-left group"
									>
										<span class="text-xs font-semibold text-pink-700 w-16 capitalize group-hover:font-bold">{mood}</span>
										<div class="flex-1 bg-pink-100 rounded-full h-3">
											<div
												class="h-3 rounded-full transition-all duration-500 {getMoodColor(mood.charAt(0).toUpperCase() + mood.slice(1))}"
												style="width: {getMoodPercentage(mood)}%"
											></div>
										</div>
										<span class="text-xs font-bold text-pink-600 w-10 text-right">{count}</span>
									</button>
								{/if}
							{/each}
							{#if totalMemories === 0}
								<p class="text-center text-pink-400 py-8 text-xs">No mood data available for this period</p>
							{/if}
						</div>
					</div>
				</div>

				<!-- 10 Recent Memories Section -->
				<div class="bg-white border-2 border-pink-300 rounded-2xl p-4 sm:p-5 animate-fade-in-up transition-all duration-300" style="animation-delay: 0.5s">
					<h2 class="text-xs sm:text-sm font-bold text-pink-600 mb-3 uppercase tracking-wide">10 Recent Memories</h2>
					{#if recentTenMemories.length > 0}
						<div class="space-y-2 max-h-80 overflow-y-auto pr-1">
							{#each recentTenMemories as memory}
								<button
									onclick={() => viewMemory(memory)}
									class="w-full flex items-center space-x-2.5 p-2.5 bg-pink-50 border border-pink-200 hover:border-pink-300 rounded-xl transition-all duration-200 text-left cursor-pointer group hover:bg-pink-100"
								>
									<div class="w-3 h-3 rounded-full {getMoodColor(memory.mood_tag)} flex-shrink-0"></div>
									<div class="flex-1 min-w-0">
										<p class="text-xs font-semibold text-pink-700 truncate group-hover:text-pink-600 transition-colors">
											{memory.description || memory.memory_tag || 'Untitled Memory'}
										</p>
										<p class="text-[10px] text-pink-400">{memory.date}</p>
									</div>
									{#if memory.mood_tag}
										<span class="text-[10px] px-2 py-0.5 rounded-full bg-pink-200 text-pink-700 font-bold flex-shrink-0">{memory.mood_tag}</span>
									{/if}
								</button>
							{/each}
						</div>
					{:else}
						<div class="text-center py-6">
							<p class="text-xs font-semibold text-pink-400">No memories recorded yet</p>
						</div>
					{/if}
				</div>
			</div>
		</main>

		<!-- Mood List Modal Popup -->
		{#if showMoodListModal}
			<div
				class="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in overflow-y-auto"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				onclick={(e) => { if (e.target === e.currentTarget) showMoodListModal = false; }}
				onkeydown={(e) => { if (e.key === 'Escape') showMoodListModal = false; }}
			>
				<div
					class="bg-white border-2 border-pink-300 rounded-2xl max-w-md w-full p-4 sm:p-5 relative my-auto"
				>
					<!-- Close Button -->
					<button
						onclick={() => showMoodListModal = false}
						class="absolute top-3.5 right-3.5 p-1 text-pink-400 hover:text-pink-600 hover:bg-pink-100 rounded-lg transition-all duration-200"
						title="Close"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>

					<!-- Modal Header -->
					<div class="text-center mb-4 pr-6">
						<h2 class="text-sm sm:text-base font-bold text-pink-600 flex items-center justify-center gap-2 capitalize">
							<span>Memories Tagged as "{selectedMoodTag}"</span>
						</h2>
						<p class="text-[11px] text-pink-400 mt-0.5">Found {filteredMoodMemories.length} memories</p>
					</div>

					<!-- Memories List -->
					{#if filteredMoodMemories.length > 0}
						<div class="space-y-2 max-h-72 overflow-y-auto pr-1">
							{#each filteredMoodMemories as memory}
								<button
									onclick={() => handleSelectMemoryFromMoodList(memory)}
									class="w-full flex items-center space-x-2.5 p-2.5 bg-pink-50 border border-pink-200 hover:border-pink-300 rounded-xl transition-all duration-200 text-left cursor-pointer group hover:bg-pink-100"
								>
									<div class="w-3 h-3 rounded-full {getMoodColor(memory.mood_tag)} flex-shrink-0"></div>
									<div class="flex-1 min-w-0">
										<p class="text-xs font-semibold text-pink-700 truncate group-hover:text-pink-600 transition-colors">
											{memory.description || memory.memory_tag || 'Untitled Memory'}
										</p>
										<p class="text-[10px] text-pink-400 mt-0.5">{memory.date}</p>
									</div>
									<span class="text-[10px] px-2 py-0.5 rounded-full bg-pink-200 text-pink-700 font-bold flex-shrink-0">
										View Details →
									</span>
								</button>
							{/each}
						</div>
					{:else}
						<div class="text-center py-8 bg-pink-50 rounded-xl border border-pink-200">
							<p class="text-sm font-semibold text-pink-500">No memories tagged with "{selectedMoodTag}" yet.</p>
							<p class="text-xs text-pink-400 mt-1">Start capturing your moments on the dashboard!</p>
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
		animation: fade-in 0.6s ease-out;
	}

	@keyframes slide-down {
		0% {
			opacity: 0;
			transform: translateY(-20px);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-slide-down {
		animation: slide-down 0.5s ease-out;
	}

	@keyframes fade-in-up {
		0% {
			opacity: 0;
			transform: translateY(30px);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fade-in-up {
		animation: fade-in-up 0.6s ease-out forwards;
		opacity: 0;
	}
</style>
