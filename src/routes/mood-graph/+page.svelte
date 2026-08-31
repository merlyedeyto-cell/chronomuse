<script>
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import Sidebar from '$lib/Sidebar.svelte';

	let user = $state(null);
	let isLoading = $state(true);
	let moodData = $state([]);
	let selectedPeriod = $state('all'); // Default to all time
	let sidebarOpen = $state(false);

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
	let mostFrequentMood = $state('');

	// Pie chart data
	function getPieChartData() {
		const data = Object.entries(moodStats).filter(([mood, count]) => count > 0);
		let cumulativePercent = 0;
		const segments = [];

		data.forEach(([mood, count]) => {
			const percent = totalMemories > 0 ? (count / totalMemories) * 100 : 0;
			const circumference = 2 * Math.PI * 40; // radius = 40
			const strokeDasharray = `${(percent / 100) * circumference} ${circumference}`;
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

	onMount(() => {
		const storedUser = localStorage.getItem('chronomuse_user');
		if (storedUser) {
			user = JSON.parse(storedUser);
		} else {
			window.location.href = '/';
		}
		isLoading = false;

		// Load mood data
		loadMoodData();
	});

	function loadMoodData() {
		// Fetch mood data from API
		fetch(`${API_ENDPOINTS.getMoodData}?user_id=${user.id}&period=${selectedPeriod}`)
			.then(response => response.json())
			.then(data => {
				if (data.success && data.data) {
					moodData = data.data;
					calculateMoodStats();
				}
			})
			.catch(error => {
				console.error('Error loading mood data:', error);
			});
	}

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
			if (memory.mood_tag && moodStats.hasOwnProperty(memory.mood_tag.toLowerCase())) {
				moodStats[memory.mood_tag.toLowerCase()]++;
			}
		});
		
		totalMemories = moodData.length;
		
		// Find most frequent mood
		const maxMood = Object.entries(moodStats).reduce((a, b) => 
			moodStats[a[0]] > moodStats[b[0]] ? a : b
		);
		mostFrequentMood = maxMood[0] ? maxMood[0].charAt(0).toUpperCase() + maxMood[0].slice(1) : 'N/A';
	}

	function handleLogout() {
		localStorage.removeItem('chronomuse_user');
		window.location.href = '/';
	}

	function handleSidebarLogout() {
		localStorage.removeItem('chronomuse_user');
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
			'Happy': 'bg-yellow-400',
			'Sad': 'bg-blue-400',
			'Excited': 'bg-orange-400',
			'Angry': 'bg-red-400',
			'Calm': 'bg-green-400',
			'Anxious': 'bg-purple-400',
			'Grateful': 'bg-pink-400',
			'Lonely': 'bg-gray-400',
			'Love': 'bg-rose-400',
			'Neutral': 'bg-slate-400'
		};
		return colors[mood] || 'bg-pink-400';
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
</script>

{#if isLoading}
	<div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200">
		<div class="text-center">
			<div class="animate-spin rounded-full h-16 w-16 border-b-2 border-pink-500 mx-auto"></div>
			<p class="mt-4 text-pink-700">Loading...</p>
		</div>
	</div>
{:else}
	<div class="flex flex-col min-h-screen bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200 animate-fade-in">
		<!-- Top Navigation -->
		<nav class="bg-white/85 backdrop-blur-md border-b-2 border-pink-300 shadow-lg sticky top-0 z-50 animate-slide-down">
			<div class="container mx-auto px-4 py-3 flex items-center justify-between">
				<div class="flex items-center space-x-3">
					<!-- Hamburger Menu Button - Mobile Only -->
					<button
						onclick={toggleSidebar}
						class="md:hidden p-2 text-pink-500 hover:bg-pink-100 rounded-lg transition-colors"
						aria-label="Toggle menu"
						title="Toggle menu"
					>
						{#if sidebarOpen}
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
								<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
							</svg>
						{/if}
					</button>
					<img src="/logo.png" alt="ChronoMuse" class="w-10 h-10 rounded-md object-contain" />
					<span class="text-lg font-bold text-pink-500">ChronoMuse</span>
				</div>

				<div class="flex items-center space-x-4">
					<span class="text-pink-700 text-sm hidden md:inline">Welcome, <strong>{user?.username}</strong></span>
					<span class="text-pink-700 text-sm md:hidden"><strong>{user?.username}</strong></span>
					<button
						onclick={handleLogout}
						class="px-4 py-2 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-lg hover:from-pink-500 hover:to-pink-700 transition-all duration-200 text-sm font-semibold shadow-md hidden md:block"
					>
						Logout
					</button>
				</div>
			</div>
		</nav>

		<!-- Sidebar -->
		<Sidebar
			bind:isOpen={sidebarOpen}
			on:logout={handleSidebarLogout}
			on:home={handleHome}
			on:moodGraph={handleMoodGraph}
		/>

		<!-- Main Content -->
		<main class="flex-grow px-4 py-8 md:ml-0 overflow-hidden">
			<div class="container mx-auto max-w-6xl">
				<!-- Header -->
				<div class="mb-6 animate-fade-in-up" style="animation-delay: 0.1s">
					<h1 class="text-2xl font-bold text-pink-500 mb-2">Mood Graph</h1>
					<p class="text-sm text-pink-400">Track your emotional journey over time</p>
				</div>

				<!-- Period Selector -->
				<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-lg p-4 mb-6 animate-fade-in-up transition-all duration-300 hover:-translate-y-2 hover:shadow-xl" style="animation-delay: 0.2s">
					<div class="flex items-center justify-between flex-wrap gap-4">
						<div class="flex items-center space-x-2">
							<button
								onclick={() => { selectedPeriod = 'all'; loadMoodData(); }}
								class="px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200"
								class:bg-pink-500={selectedPeriod === 'all'}
								class:text-white={selectedPeriod === 'all'}
								class:bg-white={selectedPeriod !== 'all'}
								class:text-pink-600={selectedPeriod !== 'all'}
								class:hover:bg-pink-100={selectedPeriod !== 'all'}
							>
								All Time
							</button>
							<button
								onclick={() => { selectedPeriod = 'week'; loadMoodData(); }}
								class="px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200"
								class:bg-pink-500={selectedPeriod === 'week'}
								class:text-white={selectedPeriod === 'week'}
								class:bg-white={selectedPeriod !== 'week'}
								class:text-pink-600={selectedPeriod !== 'week'}
								class:hover:bg-pink-100={selectedPeriod !== 'week'}
							>
								Week
							</button>
							<button
								onclick={() => { selectedPeriod = 'month'; loadMoodData(); }}
								class="px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200"
								class:bg-pink-500={selectedPeriod === 'month'}
								class:text-white={selectedPeriod === 'month'}
								class:bg-white={selectedPeriod !== 'month'}
								class:text-pink-600={selectedPeriod !== 'month'}
								class:hover:bg-pink-100={selectedPeriod !== 'month'}
							>
								Month
							</button>
							<button
								onclick={() => { selectedPeriod = 'year'; loadMoodData(); }}
								class="px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200"
								class:bg-pink-500={selectedPeriod === 'year'}
								class:text-white={selectedPeriod === 'year'}
								class:bg-white={selectedPeriod !== 'year'}
								class:text-pink-600={selectedPeriod !== 'year'}
								class:hover:bg-pink-100={selectedPeriod !== 'year'}
							>
								Year
							</button>
						</div>
						<div class="text-sm text-pink-600 font-medium">
							Total Memories: {totalMemories}
						</div>
					</div>
				</div>

				<!-- Mood Statistics Cards -->
				<div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 animate-fade-in-up" style="animation-delay: 0.3s">
					<!-- Most Frequent Mood -->
					<div class="bg-gradient-to-br from-pink-400 to-pink-600 rounded-2xl shadow-lg p-4 text-white transition-all duration-300 hover:-translate-y-2 hover:shadow-xl">
						<div class="flex items-center space-x-2 mb-2">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0V5.625a1.125 1.125 0 011.125-1.125h2.25c1.052 0 2.125.703 2.125 2.25v0c0 1.125-.872 2.25-2.125 2.25h-2.25m-9 0h2.25c1.052 0 2.125-.703 2.125-2.25v0c0-1.125-.872-2.25-2.125-2.25H9.497m0 14.25V5.625a1.125 1.125 0 011.125-1.125h2.25c1.052 0 2.125.703 2.125 2.25v0c0 1.125-.872 2.25-2.125 2.25h-2.25" />
							</svg>
							<span class="text-xs font-medium">Most Frequent</span>
						</div>
						<p class="text-xl font-bold">{mostFrequentMood}</p>
					</div>

					<!-- Happy -->
					<div class="bg-white border-2 border-yellow-300 rounded-2xl shadow-lg p-4 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl">
						<div class="flex items-center justify-between mb-2">
							<span class="text-xs font-medium text-yellow-600">Happy</span>
							<span class="text-xs font-bold text-yellow-600">{getMoodPercentage('happy')}%</span>
						</div>
						<div class="w-full bg-yellow-100 rounded-full h-2">
							<div class="bg-yellow-400 h-2 rounded-full transition-all duration-300" style="width: {getMoodPercentage('happy')}%"></div>
						</div>
						<p class="text-xs text-yellow-600 mt-1">{moodStats.happy} memories</p>
					</div>

					<!-- Sad -->
					<div class="bg-white border-2 border-blue-300 rounded-2xl shadow-lg p-4 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl">
						<div class="flex items-center justify-between mb-2">
							<span class="text-xs font-medium text-blue-600">Sad</span>
							<span class="text-xs font-bold text-blue-600">{getMoodPercentage('sad')}%</span>
						</div>
						<div class="w-full bg-blue-100 rounded-full h-2">
							<div class="bg-blue-400 h-2 rounded-full transition-all duration-300" style="width: {getMoodPercentage('sad')}%"></div>
						</div>
						<p class="text-xs text-blue-600 mt-1">{moodStats.sad} memories</p>
					</div>

					<!-- Excited -->
					<div class="bg-white border-2 border-orange-300 rounded-2xl shadow-lg p-4 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl">
						<div class="flex items-center justify-between mb-2">
							<span class="text-xs font-medium text-orange-600">Excited</span>
							<span class="text-xs font-bold text-orange-600">{getMoodPercentage('excited')}%</span>
						</div>
						<div class="w-full bg-orange-100 rounded-full h-2">
							<div class="bg-orange-400 h-2 rounded-full transition-all duration-300" style="width: {getMoodPercentage('excited')}%"></div>
						</div>
						<p class="text-xs text-orange-600 mt-1">{moodStats.excited} memories</p>
					</div>

					<!-- Calm -->
					<div class="bg-white border-2 border-green-300 rounded-2xl shadow-lg p-4 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl">
						<div class="flex items-center justify-between mb-2">
							<span class="text-xs font-medium text-green-600">Calm</span>
							<span class="text-xs font-bold text-green-600">{getMoodPercentage('calm')}%</span>
						</div>
						<div class="w-full bg-green-100 rounded-full h-2">
							<div class="bg-green-400 h-2 rounded-full transition-all duration-300" style="width: {getMoodPercentage('calm')}%"></div>
						</div>
						<p class="text-xs text-green-600 mt-1">{moodStats.calm} memories</p>
					</div>
				</div>

				<!-- Pie Chart and Mood Distribution -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 animate-fade-in-up" style="animation-delay: 0.4s">
					<!-- Pie Chart -->
					<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-lg p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl">
						<h2 class="text-lg font-bold text-pink-500 mb-4 text-center">Mood Overview</h2>
						{#if totalMemories > 0}
							<div class="flex flex-col items-center">
								<svg viewBox="0 0 100 100" class="w-48 h-48 -rotate-90">
									{#each getPieChartData() as segment, i}
										<circle
											cx="50"
											cy="50"
											r="40"
											fill="transparent"
											stroke={segment.color}
											stroke-width="20"
											stroke-dasharray={segment.strokeDasharray}
											stroke-dashoffset={segment.strokeDashoffset}
											class="transition-all duration-500"
										/>
									{/each}
								</svg>
								<div class="mt-4 grid grid-cols-2 gap-2 w-full">
									{#each getPieChartData() as segment}
										<div class="flex items-center space-x-2">
											<div class="w-3 h-3 rounded-full" style="background-color: {segment.color}"></div>
											<span class="text-xs text-pink-700 capitalize">{segment.mood}</span>
										</div>
									{/each}
								</div>
							</div>
						{:else}
							<p class="text-center text-pink-400 py-8">No mood data available for this period</p>
						{/if}
					</div>

					<!-- Mood Bars Chart -->
					<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-lg p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl">
						<h2 class="text-lg font-bold text-pink-500 mb-4">Mood Distribution</h2>
						<div class="space-y-3">
							{#each Object.entries(moodStats) as [mood, count]}
								{#if count > 0}
									<div class="flex items-center space-x-3">
										<span class="text-sm font-medium text-pink-700 w-20 capitalize">{mood}</span>
										<div class="flex-1 bg-pink-100 rounded-full h-4">
											<div
												class="h-4 rounded-full transition-all duration-500 {getMoodColor(mood.charAt(0).toUpperCase() + mood.slice(1))}"
												style="width: {getMoodPercentage(mood)}%"
											></div>
										</div>
										<span class="text-sm font-bold text-pink-600 w-12 text-right">{count}</span>
									</div>
								{/if}
							{/each}
							{#if totalMemories === 0}
								<p class="text-center text-pink-400 py-8">No mood data available for this period</p>
							{/if}
						</div>
					</div>
				</div>

				<!-- Mood Timeline -->
				<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-lg p-6 animate-fade-in-up transition-all duration-300 hover:-translate-y-2 hover:shadow-xl" style="animation-delay: 0.5s">
					<h2 class="text-lg font-bold text-pink-500 mb-4">Recent Memories</h2>
					{#if moodData.length > 0}
						<div class="space-y-2 max-h-96 overflow-y-auto">
							{#each moodData.slice(0, 10) as memory}
								<div class="flex items-center space-x-3 p-3 bg-pink-50 border border-pink-200 rounded-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:bg-pink-100">
									<div class="w-3 h-3 rounded-full {getMoodColor(memory.mood_tag)}"></div>
									<div class="flex-1">
										<p class="text-sm font-medium text-pink-700">{memory.memory_tag || 'Untitled Memory'}</p>
										<p class="text-xs text-pink-400">{memory.date}</p>
									</div>
									{#if memory.mood_tag}
										<span class="text-xs px-2 py-1 rounded-full bg-pink-200 text-pink-600 font-medium">{memory.mood_tag}</span>
									{/if}
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-center text-pink-400 py-8">No memories with mood tags yet</p>
					{/if}
				</div>
			</div>
		</main>

		<!-- Footer -->
		<footer class="bg-white/85 backdrop-blur-md border-t-2 border-pink-300 animate-fade-in" style="animation-delay: 0.6s">
			<div class="container mx-auto px-4 py-3 text-center">
				<p class="text-xs text-pink-700">
					© 2026 CHRONOMUSE. All rights reserved. Developed by Merlye Deyto
				</p>
			</div>
		</footer>
	</div>
{/if}

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
