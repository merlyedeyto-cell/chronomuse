<script>
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import AppHeader from '$lib/AppHeader.svelte';
	import AppFooter from '$lib/AppFooter.svelte';
	import ViewMemoryModal from '$lib/ViewMemoryModal.svelte';
	import MoodTrendLineGraph from '$lib/MoodTrendLineGraph.svelte';
	import { playClickSound } from '$lib/soundEffects.js';
	import { broadcastMemoryEvent } from '$lib/realtimeBroadcast.js';
	import {
		ArrowLeft, Heart, PieChart, Clock, X, Calculator, BarChart3
	} from 'lucide-svelte';

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

	async function viewMemory(memory) {
		selectedMemoryDate = memory.date || memory.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
		const sameDateMemories = moodData.filter(m => (m.date || m.created_at?.split('T')[0]) === selectedMemoryDate);
		memoriesForDate = sameDateMemories.length > 0 ? sameDateMemories : [memory];
		showViewMemoryModal = true;

		// Fetch fresh full memory records including comments, reactions, and uploads
		if (user?.id && selectedMemoryDate) {
			try {
				const response = await fetch(`${API_ENDPOINTS.getMemoriesByDate}?date=${selectedMemoryDate}&user_id=${user.id}`, { cache: 'no-store' });
				const data = await response.json();
				if (data.success && Array.isArray(data.data) && data.data.length > 0) {
					memoriesForDate = data.data;
				}
			} catch (e) {}
		}
	}

	async function handleDeleteMemory(event) {
		const { memoryId } = event.detail || {};
		if (!memoryId) return;

		try {
			const response = await fetch(API_ENDPOINTS.deleteMemory, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ memory_id: memoryId })
			});
			const data = await response.json();

			if (data.success) {
				// Remove memory from all local state arrays
				allMemoriesRaw = allMemoriesRaw.filter(m => String(m.id) !== String(memoryId));
				moodData = moodData.filter(m => String(m.id) !== String(memoryId));
				filteredMoodMemories = filteredMoodMemories.filter(m => String(m.id) !== String(memoryId));
				memoriesForDate = memoriesForDate.filter(m => String(m.id) !== String(memoryId));

				// Update cached mood data in localStorage
				if (user?.id) {
					try {
						localStorage.setItem(`chronomuse_mood_cache_${user.id}_all`, JSON.stringify(allMemoriesRaw));
					} catch (e) {}
				}

				// Recalculate mood stats
				calculateMoodStats();

				// If no more memories for this date, close the ViewMemoryModal
				if (memoriesForDate.length === 0) {
					showViewMemoryModal = false;
				}

				// If no more memories for this mood, close the mood list modal
				if (filteredMoodMemories.length === 0) {
					showMoodListModal = false;
				}

				// Notify other windows/tabs & dashboard
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_memory_change'));
					window.dispatchEvent(new CustomEvent('chronomuse_pinned_change'));
				}
			} else {
				console.error('Failed to delete memory:', data.error);
			}
		} catch (error) {
			console.error('Error deleting memory from mood graph:', error);
		}
	}

	function handleUpdateMemory(event) {
		const { memoryId, description, moodTag, memoryTag } = event.detail || {};
		if (!memoryId) return;
		updateMemoryInDatabase(memoryId, { description, mood_tag: moodTag, memory_tag: memoryTag });
	}

	function handleUpdateMemoryWithFiles(event) {
		const { memory, formData, description, moodTag, memoryTag } = event.detail || {};
		if (!memory?.id) return;
		updateMemoryWithFilesInDatabase(memory, formData, { description, mood_tag: moodTag, memory_tag: memoryTag });
	}

	async function updateMemoryInDatabase(memoryId, updateData) {
		try {
			const response = await fetch(API_ENDPOINTS.updateMemory, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ memory_id: memoryId, ...updateData })
			});
			const data = await response.json();

			if (data.success) {
				const updater = m => (String(m.id) === String(memoryId) ? { ...m, ...updateData } : m);
				allMemoriesRaw = allMemoriesRaw.map(updater);
				moodData = moodData.map(updater);
				filteredMoodMemories = filteredMoodMemories.map(updater);
				memoriesForDate = memoriesForDate.map(updater);

				if (user?.id) {
					try {
						localStorage.setItem(`chronomuse_mood_cache_${user.id}_all`, JSON.stringify(allMemoriesRaw));
					} catch (e) {}
				}

				calculateMoodStats();

				if (data.shared_with && data.shared_with.length > 0) {
					for (const fid of data.shared_with) {
						broadcastMemoryEvent(user.id, fid, 'shared_memory_update', data.data);
					}
				}

				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_memory_change'));
				}
			}
		} catch (error) {
			console.error('Error updating memory:', error);
		}
	}

	async function updateMemoryWithFilesInDatabase(memory, formData, updateData) {
		try {
			const response = await fetch(API_ENDPOINTS.updateMemory, {
				method: 'POST',
				body: formData
			});
			const data = await response.json();

			if (data.success) {
				const updatedFields = {
					...updateData,
					photo_video: data.data?.photo_video || memory.photo_video,
					photo_video_type: data.data?.photo_video_type || memory.photo_video_type,
					music: data.data?.music || memory.music
				};
				const updater = m => (String(m.id) === String(memory.id) ? { ...m, ...updatedFields } : m);
				allMemoriesRaw = allMemoriesRaw.map(updater);
				moodData = moodData.map(updater);
				filteredMoodMemories = filteredMoodMemories.map(updater);
				memoriesForDate = memoriesForDate.map(updater);

				if (user?.id) {
					try {
						localStorage.setItem(`chronomuse_mood_cache_${user.id}_all`, JSON.stringify(allMemoriesRaw));
					} catch (e) {}
				}

				calculateMoodStats();

				if (data.shared_with && data.shared_with.length > 0) {
					for (const fid of data.shared_with) {
						broadcastMemoryEvent(user.id, fid, 'shared_memory_update', data.data);
					}
				}

				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_memory_change'));
				}
			}
		} catch (error) {
			console.error('Error updating memory with files:', error);
		}
	}

	async function handleRefreshMemories() {
		if (selectedMemoryDate && user?.id) {
			try {
				const response = await fetch(`${API_ENDPOINTS.getMemoriesByDate}?date=${selectedMemoryDate}&user_id=${user.id}`, { cache: 'no-store' });
				const data = await response.json();
				if (data.success && Array.isArray(data.data)) {
					memoriesForDate = data.data;
				}
			} catch (e) {}
		}
		loadMoodData(true);
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

	let showPositiveRatioModal = $state(false);

	// Computed Metrics
	let totalLoggedMoods = $derived(
		Object.values(moodStats).reduce((sum, count) => sum + count, 0)
	);

	let positiveCount = $derived(
		(moodStats.happy || 0) + (moodStats.excited || 0) + (moodStats.grateful || 0) + (moodStats.love || 0) + (moodStats.calm || 0)
	);

	let negativeCount = $derived(
		(moodStats.sad || 0) + (moodStats.angry || 0) + (moodStats.anxious || 0) + (moodStats.lonely || 0)
	);

	let neutralCount = $derived(moodStats.neutral || 0);

	let positivePercentage = $derived(
		totalLoggedMoods > 0 ? Math.round((positiveCount / totalLoggedMoods) * 100) : 0
	);

	let uniqueMoodsCount = $derived(
		Object.values(moodStats).filter(c => c > 0).length
	);

	let activeMoodsSorted = $derived(
		Object.entries(moodStats)
			.filter(([_, count]) => count > 0)
			.sort((a, b) => b[1] - a[1])
			.map(([mood, count]) => ({
				moodKey: mood,
				moodName: mood.charAt(0).toUpperCase() + mood.slice(1),
				count,
				percent: totalLoggedMoods > 0 ? Math.round((count / totalLoggedMoods) * 100) : 0,
				color: getMoodFillColor(mood.charAt(0).toUpperCase() + mood.slice(1))
			}))
	);

	// Pie chart data
	function getPieChartData() {
		const data = Object.entries(moodStats).filter(([mood, count]) => count > 0);
		let cumulativePercent = 0;
		const segments = [];
		const radius = 35;
		const circumference = 2 * Math.PI * radius; // ~219.911

		data.forEach(([mood, count]) => {
			const percent = totalLoggedMoods > 0 ? (count / totalLoggedMoods) * 100 : 0;
			const segmentLength = (percent / 100) * circumference;
			const strokeDasharray = `${segmentLength} ${circumference}`;
			const strokeDashoffset = -((cumulativePercent / 100) * circumference);
			const color = getMoodFillColor(mood.charAt(0).toUpperCase() + mood.slice(1));

			segments.push({
				mood: mood.charAt(0).toUpperCase() + mood.slice(1),
				rawMood: mood,
				count,
				percent: Math.round(percent),
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
			if (typeof document !== 'undefined' && document.hidden) return;
			checkNotifications();
		}, 60000);

		return () => {
			if (autoSyncNotifsInterval) clearInterval(autoSyncNotifsInterval);
			window.removeEventListener('chronomuse_memory_change', handleRealtimeUpdate);
			window.removeEventListener('chronomuse_friend_change', handleRealtimeUpdate);
			window.removeEventListener('chronomuse_notification_change', handleRealtimeUpdate);
			window.removeEventListener('chronomuse_chat_change', handleRealtimeUpdate);
			window.removeEventListener('chronomuse_auth_change', handleAuthChange);
		};
	});

	$effect(() => {
		if (showMoodListModal || showViewMemoryModal || showPositiveRatioModal) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
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
		if (totalLoggedMoods === 0) return 0;
		return Math.round((moodStats[mood.toLowerCase()] / totalLoggedMoods) * 100);
	}

	let positiveMoodsLogged = $derived(
		['happy', 'excited', 'grateful', 'calm', 'love']
			.filter(m => (moodStats[m] || 0) > 0)
			.map(m => ({
				key: m,
				name: m.charAt(0).toUpperCase() + m.slice(1),
				count: moodStats[m],
				color: getMoodFillColor(m.charAt(0).toUpperCase() + m.slice(1))
			}))
	);

	let negativeMoodsLogged = $derived(
		['sad', 'angry', 'anxious', 'lonely']
			.filter(m => (moodStats[m] || 0) > 0)
			.map(m => ({
				key: m,
				name: m.charAt(0).toUpperCase() + m.slice(1),
				count: moodStats[m],
				color: getMoodFillColor(m.charAt(0).toUpperCase() + m.slice(1))
			}))
	);

	let neutralMoodsLogged = $derived(
		(moodStats.neutral || 0) > 0
			? [{ key: 'neutral', name: 'Neutral', count: moodStats.neutral, color: getMoodFillColor('Neutral') }]
			: []
	);

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
	<main class="flex-grow container mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8 pb-24 sm:pb-28 max-w-6xl xl:max-w-7xl">
		<!-- Header Banner -->
		<div class="bg-white border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 mb-4 sm:mb-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] animate-fade-in-up">
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
				<div>
					<div class="flex items-center space-x-2 mb-0.5">
						<button
							onclick={() => goto('/dashboard')}
							class="w-7 h-7 rounded-xl bg-pink-50 hover:bg-pink-100 text-[#f43f8e] border border-pink-100 flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer shadow-2xs"
							title="Back to Dashboard"
						>
							<ArrowLeft class="w-3.5 h-3.5" strokeWidth={2.5} />
						</button>
						<h1 class="text-sm sm:text-base font-black text-[#f43f8e]">Mood Graph & Analytics</h1>
					</div>
					<p class="text-[11px] text-pink-400 font-bold ml-9">Track your emotional journey, trends, and memory distribution</p>
				</div>

				<!-- Period Selector -->
				<div class="grid grid-cols-4 sm:flex items-center gap-1 bg-[#fdf2f6] p-1 rounded-2xl border border-pink-100 shadow-2xs w-full sm:w-auto">
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

		<!-- 2-Column Bento Grid on Desktop, Sequential Flow on Mobile -->
		<div class="w-full flex flex-col lg:grid lg:grid-cols-12 gap-4 sm:gap-5 lg:items-start">
			
			<!-- LEFT COLUMN: Analytics & Metrics Hub (7 Columns on Desktop) -->
			<div class="contents lg:block lg:col-span-7 xl:col-span-7 lg:space-y-4">
				
				<!-- 3 Top Metric Hero Cards (One row across all screen sizes) -->
				<div class="order-1 w-full grid grid-cols-3 gap-2 sm:gap-3 animate-fade-in-up" style="animation-delay: 0.1s">
					<!-- Dominant Mood Card (Col 1) -->
					<div
						class="col-span-1 bg-gradient-to-br from-[#f43f8e] to-[#e0337f] border border-pink-400/40 rounded-2xl p-2.5 sm:p-3.5 md:p-4 text-white shadow-[0_4px_14px_rgba(244,63,142,0.22)] flex flex-col justify-between relative overflow-hidden group cursor-pointer active:scale-[0.99] transition-all"
						onclick={() => mostFrequentMoods.length > 0 && openMoodListModal(mostFrequentMoods[0])}
						role="button"
						tabindex="0"
						onkeydown={(e) => { if (e.key === 'Enter' && mostFrequentMoods.length > 0) openMoodListModal(mostFrequentMoods[0]); }}
					>
						<div class="mb-1.5 sm:mb-2 opacity-90">
							<span class="text-[9px] sm:text-[10px] md:text-[11px] font-bold uppercase tracking-wider truncate block">
								{mostFrequentMoods.length > 1 ? 'Dominant (Tied)' : 'Dominant Mood'}
							</span>
						</div>
						<div>
							<p class="text-sm sm:text-base md:text-lg font-black leading-tight truncate">
								{mostFrequentMoods.length > 0 ? mostFrequentMoods.join(', ') : 'None'}
							</p>
							<p class="text-[9px] sm:text-[10px] md:text-[11px] text-pink-100 font-medium mt-0.5 sm:mt-1 truncate">
								{mostFrequentMoodCount} {mostFrequentMoodCount === 1 ? 'memory' : 'memories'} logged
							</p>
						</div>
					</div>

					<!-- Total Memories & Diversity (Col 2) -->
					<div class="col-span-1 bg-white/95 border border-pink-100/90 rounded-2xl p-2.5 sm:p-3.5 md:p-4 shadow-[0_2px_12px_rgba(244,114,182,0.06)] flex flex-col justify-between">
						<div class="mb-1.5 sm:mb-2 text-pink-500">
							<span class="text-[9px] sm:text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-pink-400 truncate block">Total Entries</span>
						</div>
						<div>
							<p class="text-sm sm:text-base md:text-lg font-black text-pink-950 leading-tight">
								{totalMemories}
							</p>
							<p class="text-[9px] sm:text-[10px] md:text-[11px] text-pink-500 font-bold mt-0.5 sm:mt-1 truncate">
								{uniqueMoodsCount} distinct {uniqueMoodsCount === 1 ? 'emotion' : 'emotions'}
							</p>
						</div>
					</div>

					<!-- Positive Mood Ratio (Col 3 - Clickable for details) -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						onclick={() => { playClickSound(); showPositiveRatioModal = true; }}
						class="col-span-1 bg-white/95 border border-pink-100/90 rounded-2xl p-2.5 sm:p-3.5 md:p-4 shadow-[0_2px_12px_rgba(244,114,182,0.06)] flex flex-col justify-between cursor-pointer hover:border-pink-300 hover:shadow-md transition-all active:scale-[0.99] group select-none"
						title="Click to view positive ratio breakdown & formula"
					>
						<div class="mb-1.5 sm:mb-2 text-pink-500">
							<span class="text-[9px] sm:text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-pink-400 group-hover:text-[#f43f8e] transition-colors truncate block">Positive Ratio</span>
						</div>
						<div>
							<div class="flex items-baseline space-x-1">
								<p class="text-sm sm:text-base md:text-lg font-black text-[#f43f8e] leading-tight">
									{positivePercentage}%
								</p>
								<span class="text-[9px] sm:text-[10px] text-pink-400 font-bold hidden xs:inline sm:inline">positive</span>
							</div>
							<div class="w-full bg-pink-50 rounded-full h-1 sm:h-1.5 mt-1.5 sm:mt-2 overflow-hidden">
								<div class="h-full rounded-full bg-gradient-to-r from-pink-400 to-[#f43f8e] transition-all duration-500" style="width: {positivePercentage}%"></div>
							</div>
						</div>
					</div>
				</div>

				<!-- Unified Visual Analytics Card: Donut Chart + Distribution Bars -->
				<div class="order-2 w-full bg-white border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] animate-fade-in-up" style="animation-delay: 0.15s">
					<div class="flex items-center justify-between mb-4 pb-2.5 border-b border-pink-50">
						<div class="flex items-center space-x-2">
							<div class="w-6 h-6 rounded-lg sm:rounded-xl bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
								<PieChart class="w-3.5 h-3.5" strokeWidth={2.2} />
							</div>
							<div>
								<h2 class="text-xs sm:text-sm font-black text-pink-950">Mood Breakdown & Distribution</h2>
								<p class="text-[10px] sm:text-[11px] text-pink-400 font-bold">Interactive emotional spread</p>
							</div>
						</div>
						{#if totalLoggedMoods > 0}
							<span class="text-[10px] text-pink-500 bg-pink-50 px-2.5 py-0.5 rounded-full font-bold border border-pink-100">
								{activeMoodsSorted.length} Active Tags
							</span>
						{/if}
					</div>

					{#if totalLoggedMoods > 0}
						<div class="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5 items-center">
							<!-- Donut Chart on Left of the card (5 Cols) -->
							<div class="md:col-span-5 flex flex-col items-center justify-center py-1">
								<div class="relative w-36 h-36 sm:w-40 sm:h-40 my-1">
									<svg viewBox="0 0 100 100" class="w-full h-full transform -rotate-90 drop-shadow-xs outline-none focus:outline-none select-none" style="outline: none !important; -webkit-tap-highlight-color: transparent !important;">
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
												class="transition-all duration-300 cursor-pointer hover:opacity-85 hover:stroke-[15] outline-none focus:outline-none focus:ring-0 select-none"
												style="outline: none !important; -webkit-tap-highlight-color: transparent !important; -webkit-focus-ring-color: transparent !important;"
												role="button"
												tabindex="0"
												aria-label={`View ${segment.mood} memories`}
												onclick={() => openMoodListModal(segment.mood)}
												onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openMoodListModal(segment.mood); }}
											/>
										{/each}
									</svg>
									<!-- Center text -->
									<div class="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none select-none">
										<span class="text-xl sm:text-2xl font-black text-[#f43f8e]">{totalLoggedMoods}</span>
										<span class="text-[9px] text-pink-400 font-bold uppercase tracking-wider">{totalLoggedMoods === 1 ? 'Mood Log' : 'Mood Logs'}</span>
									</div>
								</div>
								<p class="text-[10px] sm:text-[11px] text-pink-400 font-medium text-center mt-1">Tap a slice to see tagged memories</p>
							</div>

							<!-- Ranked Progress Bars on Right of the card (7 Cols) -->
							<div class="md:col-span-7 space-y-2 max-h-64 overflow-y-auto pr-1">
								{#each activeMoodsSorted as item}
									<button
										onclick={() => openMoodListModal(item.moodName)}
										class="w-full flex items-center space-x-2.5 p-2 rounded-xl hover:bg-pink-50/80 border border-pink-50 hover:border-pink-100 transition-all text-left group cursor-pointer active:scale-99"
									>
										<span class="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-2xs" style="background-color: {item.color}"></span>
										<span class="text-xs font-bold text-pink-950 w-20 truncate group-hover:text-[#f43f8e] transition-colors">{item.moodName}</span>
										<div class="flex-1 bg-pink-50 rounded-full h-2 overflow-hidden">
											<div
												class="h-2 rounded-full transition-all duration-500"
												style="width: {item.percent}%; background-color: {item.color};"
											></div>
										</div>
										<div class="text-right flex-shrink-0 min-w-[42px]">
											<span class="text-xs font-black text-[#f43f8e]">{item.count}</span>
											<span class="text-[9px] text-pink-400 ml-0.5 font-bold">({item.percent}%)</span>
										</div>
									</button>
								{/each}
							</div>
						</div>
					{:else}
						<div class="text-center py-10 bg-pink-50/40 rounded-2xl border border-dashed border-pink-200">
							<p class="text-sm font-black text-pink-900 mb-1">No Mood Data Available</p>
							<p class="text-xs text-pink-400 font-medium">Record moments in your dashboard or calendar to generate graphs.</p>
						</div>
					{/if}
				</div>
			</div>

			<!-- RIGHT COLUMN: Recent Memories + Mood Timeline Trend (5 Columns on Desktop) -->
			<div class="contents lg:block lg:col-span-5 xl:col-span-5 lg:space-y-4">
				<!-- Recent Memories Card (Displays 3 items, scrollable for more) -->
				<div class="order-4 w-full bg-white border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-[0_4px_20px_rgba(244,114,182,0.08)] flex flex-col animate-fade-in-up" style="animation-delay: 0.2s">
					<!-- Stream Header -->
					<div class="flex items-center justify-between mb-3 pb-2.5 border-b border-pink-50">
						<div class="flex items-center space-x-2">
							<div class="w-6 h-6 rounded-lg sm:rounded-xl bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
								<Clock class="w-3.5 h-3.5" strokeWidth={2.2} />
							</div>
							<div>
								<h2 class="text-xs sm:text-sm font-black text-pink-950">Recent Memories</h2>
								<p class="text-[10px] text-pink-400 font-bold">Latest emotional entries</p>
							</div>
						</div>
						<span class="text-[10px] text-pink-500 bg-pink-50 px-2.5 py-0.5 rounded-full font-bold border border-pink-100">
							{recentTenMemories.length} entries
						</span>
					</div>

					<!-- Stream List: Max height sized for exactly 3 items, scrollable for more -->
					{#if recentTenMemories.length > 0}
						<div class="space-y-2 max-h-[175px] overflow-y-auto pr-1">
							{#each recentTenMemories as memory}
								{@const moodName = (memory.mood_tag || '').charAt(0).toUpperCase() + (memory.mood_tag || '').slice(1)}
								<button
									onclick={() => viewMemory(memory)}
									class="w-full flex items-center space-x-2.5 p-2.5 bg-[#fdf2f6]/60 border border-pink-100/80 hover:border-pink-300 rounded-2xl transition-all duration-200 text-left cursor-pointer group hover:bg-[#fff5f8] active:scale-[0.99] shadow-2xs"
								>
									<!-- Mood Indicator Dot Accent -->
									<div class="w-3 h-3 rounded-full flex-shrink-0 shadow-2xs" style="background-color: {getMoodFillColor(moodName)}"></div>
									
									<div class="flex-1 min-w-0">
										<p class="text-xs font-bold text-pink-950 truncate group-hover:text-[#f43f8e] transition-colors leading-snug">
											{memory.description || memory.memory_tag || 'Untitled Memory'}
										</p>
										<div class="flex items-center space-x-2 mt-0.5">
											<span class="text-[10px] text-pink-400 font-medium">{memory.date}</span>
											{#if memory.shared_by}
												<span class="text-[9px] text-pink-400/80 font-medium">· Shared by @{memory.shared_by}</span>
											{/if}
										</div>
									</div>

									{#if memory.mood_tag}
										<span
											class="text-[9px] px-2 py-0.5 rounded-full font-bold border flex-shrink-0 transition-colors"
											style="background-color: {getMoodFillColor(moodName)}15; color: {getMoodFillColor(moodName)}; border-color: {getMoodFillColor(moodName)}30;"
										>
											{moodName}
										</span>
									{/if}
								</button>
							{/each}
						</div>
					{:else}
						<div class="text-center py-8 bg-pink-50/40 rounded-2xl border border-dashed border-pink-200">
							<p class="text-xs font-bold text-pink-400">No memories recorded yet</p>
							<p class="text-[10px] text-pink-300 mt-0.5">Start journaling to see your timeline here</p>
						</div>
					{/if}
				</div>

				<!-- Mood Timeline Trend Line Graph in Right Column (Appears directly below Donut Chart on mobile view) -->
				<div class="order-3 w-full">
					<MoodTrendLineGraph
						{moodData}
						{selectedPeriod}
						onSelectMemory={viewMemory}
						onSelectDate={(date, memories) => {
							selectedMemoryDate = date;
							memoriesForDate = memories;
							showViewMemoryModal = true;
						}}
					/>
				</div>
			</div>
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
					<X class="w-3.5 h-3.5" strokeWidth={2.5} />
				</button>

				<!-- Modal Header -->
				<div class="text-center mb-3 pr-6">
					<div class="w-3.5 h-3.5 rounded-full mx-auto mb-1.5 shadow-xs" style="background-color: {getMoodFillColor(selectedMoodTag)}"></div>
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
			on:deleteMemory={handleDeleteMemory}
			on:updateMemory={handleUpdateMemory}
			on:updateMemoryWithFiles={handleUpdateMemoryWithFiles}
			on:refresh={handleRefreshMemories}
		/>
	{/if}

	<!-- Positive Ratio Explanation Modal -->
	{#if showPositiveRatioModal}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans"
			onclick={(e) => { if (e.target === e.currentTarget) showPositiveRatioModal = false; }}
		>
			<div class="bg-white border border-pink-100 rounded-3xl shadow-2xl max-w-sm sm:max-w-md w-full p-4 sm:p-5 space-y-3.5 animate-modal-content max-h-[90vh] overflow-y-auto">
				<!-- Header -->
				<div class="flex items-center justify-between border-b border-pink-100/80 pb-2.5">
					<div class="flex items-center space-x-2">
						<div class="w-8 h-8 rounded-xl bg-pink-50 text-[#f43f8e] border border-pink-100 flex items-center justify-center shadow-2xs">
							<Heart class="w-4 h-4 text-[#f43f8e]" fill="currentColor" />
						</div>
						<div>
							<h3 class="text-sm font-black text-pink-950">Positive Ratio</h3>
							<p class="text-[10px] text-pink-400 font-bold">Calculation & Breakdown</p>
						</div>
					</div>
					<button
						onclick={() => { playClickSound(); showPositiveRatioModal = false; }}
						aria-label="Close"
						class="w-7 h-7 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] flex items-center justify-center transition-all cursor-pointer active:scale-95"
					>
						<X class="w-3.5 h-3.5" strokeWidth={2.5} />
					</button>
				</div>

				<!-- Ratio Score Hero -->
				<div class="p-3.5 bg-gradient-to-br from-pink-50/80 via-white to-pink-50/40 border border-pink-100 rounded-2xl text-center space-y-1.5 shadow-2xs">
					<span class="text-[9px] font-black uppercase tracking-wider text-pink-400 bg-white px-2.5 py-0.5 rounded-full border border-pink-100 inline-block shadow-2xs">
						YOUR SCORE ({selectedPeriod === 'all' ? 'All Time' : selectedPeriod === 'week' ? 'Past 7 Days' : selectedPeriod === 'month' ? 'Past 30 Days' : 'Past Year'})
					</span>
					
					<p class="text-3xl sm:text-4xl font-black text-[#f43f8e] tracking-tight">{positivePercentage}%</p>
					
					<!-- Segmented ratio bar -->
					{#if totalLoggedMoods > 0}
						<div class="w-full h-2.5 bg-pink-100/60 rounded-full overflow-hidden flex shadow-inner my-1.5 border border-pink-100">
							{#if positiveCount > 0}
								<div
									class="bg-gradient-to-r from-emerald-400 to-emerald-500 h-full transition-all duration-500"
									style="width: {(positiveCount / totalLoggedMoods) * 100}%"
									title="Positive: {positiveCount} logs"
								></div>
							{/if}
							{#if neutralCount > 0}
								<div
									class="bg-gradient-to-r from-slate-300 to-slate-400 h-full transition-all duration-500"
									style="width: {(neutralCount / totalLoggedMoods) * 100}%"
									title="Neutral: {neutralCount} logs"
								></div>
							{/if}
							{#if negativeCount > 0}
								<div
									class="bg-gradient-to-r from-rose-400 to-rose-500 h-full transition-all duration-500"
									style="width: {(negativeCount / totalLoggedMoods) * 100}%"
									title="Negative: {negativeCount} logs"
								></div>
							{/if}
						</div>
					{/if}

					<p class="text-[11px] text-pink-900/90 font-bold leading-relaxed px-2">
						{#if positivePercentage >= 70}
							Outstanding! You're keeping high positive energy and appreciation.
						{:else if positivePercentage >= 50}
							Good balance! You maintain a positive outlook overall.
						{:else if totalLoggedMoods > 0}
							Reflecting and acknowledging every emotion helps build resilience.
						{:else}
							Log more memories to generate your positivity ratio score.
						{/if}
					</p>
				</div>

				<!-- Formula Card -->
				<div class="p-3 bg-pink-50/40 border border-pink-100 rounded-2xl space-y-2">
					<div class="flex items-center justify-between text-[10px] font-extrabold text-pink-950">
						<span class="flex items-center gap-1.5">
							<Calculator class="w-3.5 h-3.5 text-[#f43f8e]" strokeWidth={2.2} />
							<span>Formula Used</span>
						</span>
						<span class="text-[9px] text-[#f43f8e] font-black uppercase bg-white px-2 py-0.5 rounded-full border border-pink-100 shadow-2xs">Calculation</span>
					</div>

					<div class="p-2 bg-white rounded-xl border border-pink-100 text-center font-mono text-[11px] font-extrabold text-pink-900 shadow-2xs">
						(Positive Moods ÷ Total Moods) × 100%
					</div>

					<div class="flex items-center justify-center gap-1.5 text-[11px] font-bold text-pink-800 bg-white/70 py-1.5 px-2 rounded-xl border border-pink-100">
						<span>( <strong class="text-emerald-600">{positiveCount}</strong> ÷ <strong class="text-pink-950">{totalLoggedMoods}</strong> ) × 100%</span>
						<span>=</span>
						<span class="text-[#f43f8e] font-black">{positivePercentage}%</span>
					</div>
				</div>

				<!-- Moods Breakdown -->
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-black text-pink-950 flex items-center gap-1.5">
							<BarChart3 class="w-3.5 h-3.5 text-[#f43f8e]" strokeWidth={2.2} />
							<span>Moods Breakdown</span>
						</span>
						<span class="text-[10px] text-pink-500 font-bold bg-pink-50 px-2 py-0.5 rounded-full border border-pink-100">
							{totalLoggedMoods} {totalLoggedMoods === 1 ? 'total log' : 'total logs'}
						</span>
					</div>

					<div class="space-y-1.5">
						<!-- Positive Category Card -->
						<div class="p-2.5 bg-emerald-50/50 border border-emerald-100/90 rounded-2xl space-y-1.5 shadow-2xs">
							<div class="flex items-center justify-between">
								<span class="font-black text-emerald-900 text-xs flex items-center gap-1.5">
									<span class="w-2 h-2 rounded-full bg-emerald-500 shadow-2xs"></span>
									<span>Positive Moods</span>
								</span>
								<span class="font-black text-emerald-900 text-xs bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-200">
									{positiveCount} {positiveCount === 1 ? 'log' : 'logs'} ({positivePercentage}%)
								</span>
							</div>

							{#if positiveMoodsLogged.length > 0}
								<div class="flex flex-wrap gap-1 pt-0.5">
									{#each positiveMoodsLogged as item}
										<div class="inline-flex items-center space-x-1.5 px-2 py-0.5 bg-white border border-emerald-200 rounded-full text-[10px] font-bold text-emerald-900 shadow-2xs">
											<span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background-color: {item.color}"></span>
											<span>{item.name}</span>
											<span class="text-emerald-700 font-black">({item.count})</span>
										</div>
									{/each}
								</div>
							{:else}
								<p class="text-[10px] text-emerald-600/70 font-medium italic">No positive moods logged in this period</p>
							{/if}
						</div>

						<!-- Neutral Category Card -->
						<div class="p-2.5 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-1.5 shadow-2xs">
							<div class="flex items-center justify-between">
								<span class="font-black text-slate-800 text-xs flex items-center gap-1.5">
									<span class="w-2 h-2 rounded-full bg-slate-400 shadow-2xs"></span>
									<span>Neutral Moods</span>
								</span>
								<span class="font-black text-slate-900 text-xs bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
									{neutralCount} {neutralCount === 1 ? 'log' : 'logs'} ({totalLoggedMoods > 0 ? Math.round((neutralCount / totalLoggedMoods) * 100) : 0}%)
								</span>
							</div>

							{#if neutralMoodsLogged.length > 0}
								<div class="flex flex-wrap gap-1 pt-0.5">
									{#each neutralMoodsLogged as item}
										<div class="inline-flex items-center space-x-1.5 px-2 py-0.5 bg-white border border-slate-200 rounded-full text-[10px] font-bold text-slate-800 shadow-2xs">
											<span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background-color: {item.color}"></span>
											<span>{item.name}</span>
											<span class="text-slate-600 font-black">({item.count})</span>
										</div>
									{/each}
								</div>
							{:else}
								<p class="text-[10px] text-slate-500 font-medium italic">No neutral moods logged in this period</p>
							{/if}
						</div>

						<!-- Negative Category Card -->
						<div class="p-2.5 bg-rose-50/50 border border-rose-100/90 rounded-2xl space-y-1.5 shadow-2xs">
							<div class="flex items-center justify-between">
								<span class="font-black text-rose-900 text-xs flex items-center gap-1.5">
									<span class="w-2 h-2 rounded-full bg-rose-500 shadow-2xs"></span>
									<span>Negative Moods</span>
								</span>
								<span class="font-black text-rose-900 text-xs bg-rose-100/80 px-2 py-0.5 rounded-full border border-rose-200">
									{negativeCount} {negativeCount === 1 ? 'log' : 'logs'} ({totalLoggedMoods > 0 ? Math.round((negativeCount / totalLoggedMoods) * 100) : 0}%)
								</span>
							</div>

							{#if negativeMoodsLogged.length > 0}
								<div class="flex flex-wrap gap-1 pt-0.5">
									{#each negativeMoodsLogged as item}
										<div class="inline-flex items-center space-x-1.5 px-2 py-0.5 bg-white border border-rose-200 rounded-full text-[10px] font-bold text-rose-900 shadow-2xs">
											<span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background-color: {item.color}"></span>
											<span>{item.name}</span>
											<span class="text-rose-700 font-black">({item.count})</span>
										</div>
									{/each}
								</div>
							{:else}
								<p class="text-[10px] text-rose-500/70 font-medium italic">No negative moods logged in this period</p>
							{/if}
						</div>
					</div>
				</div>

				<!-- Footer Button -->
				<div class="border-t border-pink-100/80 pt-2.5">
					<button
						type="button"
						onclick={() => { playClickSound(); showPositiveRatioModal = false; }}
						class="w-full py-2.5 bg-gradient-to-r from-[#f43f8e] to-[#e0337f] hover:from-[#e0337f] hover:to-[#d02470] text-white font-black text-xs rounded-xl shadow-[0_4px_12px_rgba(244,63,142,0.25)] transition-all cursor-pointer active:scale-98 text-center"
					>
						Got it!
					</button>
				</div>
			</div>
		</div>
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

	:global(svg),
	:global(svg *),
	:global(circle),
	:global(circle:focus),
	:global(circle:active),
	:global(path),
	:global(path:focus) {
		outline: none !important;
		-webkit-tap-highlight-color: transparent !important;
		-webkit-focus-ring-color: transparent !important;
		box-shadow: none !important;
	}
</style>
