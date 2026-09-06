<script>
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import { broadcastFriendEvent, broadcastMemoryEvent } from '$lib/realtimeBroadcast.js';
	import Sidebar from '$lib/Sidebar.svelte';

	let user = $state(null);
	let isLoading = $state(false);
	let hasLoadedOnce = $state(false);
	let sidebarOpen = $state(false);
	let activeTab = $state('pending_memories'); // 'memories', 'pending_memories', 'sent'
	let autoSyncNotifsInterval = null;

	let notifications = $state({
		shared_memories: [],
		sent_shared_memories: [],
		incoming_requests: [],
		total_notifications_count: 0
	});

	// Memory viewing modal state
	let selectedMemoryToView = $state(/** @type {any} */ (null));
	let showViewMemoryModal = $state(false);

	let isResponding = $state(false);
	let isCancelling = $state(false);
	let cancelConfirmItem = $state(/** @type {any} */ (null));
	let showCancelModal = $state(false);

	let pendingSharedMemories = $derived((notifications.shared_memories || []).filter(m => m.status !== 'accepted'));
	let acceptedSharedMemories = $derived((notifications.shared_memories || []).filter(m => m.status === 'accepted'));
	let sentSharedMemories = $derived(notifications.sent_shared_memories || []);

	let totalPendingMemoriesCount = $derived(pendingSharedMemories.length);
	let totalMemoriesCount = $derived(acceptedSharedMemories.length);
	let totalSentCount = $derived(sentSharedMemories.length);

	onMount(() => {
		const storedUser = localStorage.getItem('chronomuse_user');
		if (storedUser) {
			user = JSON.parse(storedUser);
			fetchNotifications(false);
		} else {
			goto('/');
		}

		const handleRealtimeNotifs = () => {
			fetchNotifications(true);
		};

		const handleAuthOrStorage = () => {
			const currentStored = localStorage.getItem('chronomuse_user');
			if (currentStored) {
				const parsed = JSON.parse(currentStored);
				if (!user || Number(user.id) !== Number(parsed.id)) {
					user = parsed;
					notifications = {
						shared_memories: [],
						sent_shared_memories: [],
						incoming_requests: [],
						total_notifications_count: 0
					};
					fetchNotifications(false);
				}
			} else {
				goto('/');
			}
		};

		window.addEventListener('chronomuse_auth_change', handleAuthOrStorage);
		window.addEventListener('storage', handleAuthOrStorage);
		window.addEventListener('chronomuse_notification_change', handleRealtimeNotifs);
		window.addEventListener('chronomuse_friend_change', handleRealtimeNotifs);
		window.addEventListener('chronomuse_memory_change', handleRealtimeNotifs);

		// Periodic background polling
		autoSyncNotifsInterval = setInterval(() => {
			fetchNotifications(true);
		}, 3000);

		return () => {
			window.removeEventListener('chronomuse_auth_change', handleAuthOrStorage);
			window.removeEventListener('storage', handleAuthOrStorage);
			window.removeEventListener('chronomuse_notification_change', handleRealtimeNotifs);
			window.removeEventListener('chronomuse_friend_change', handleRealtimeNotifs);
			window.removeEventListener('chronomuse_memory_change', handleRealtimeNotifs);
			if (autoSyncNotifsInterval) clearInterval(autoSyncNotifsInterval);
		};
	});

	let fetchAbortController = null;

	async function fetchNotifications(isSilent = false) {
		const currentUser = user || (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('chronomuse_user') || 'null') : null);
		if (!currentUser || !currentUser.id) return;
		user = currentUser;

		if (!isSilent && !hasLoadedOnce) {
			isLoading = true;
		}

		if (fetchAbortController) {
			fetchAbortController.abort();
		}
		fetchAbortController = new AbortController();

		try {
			const res = await fetch(API_ENDPOINTS.getNotifications, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: currentUser.id }),
				signal: fetchAbortController.signal
			});
			const data = await res.json();
			if (data.success && data.data) {
				notifications = data.data;
				if (!hasLoadedOnce) {
					hasLoadedOnce = true;
					if (pendingSharedMemories.length > 0) {
						activeTab = 'pending_memories';
					} else if (acceptedSharedMemories.length > 0) {
						activeTab = 'memories';
					} else if (sentSharedMemories.length > 0) {
						activeTab = 'sent';
					}
				}
			}
		} catch (err) {
			if (err.name === 'AbortError') return;
			console.error('Error fetching notifications:', err);
		} finally {
			isLoading = false;
		}
	}

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
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
		goto('/');
	}

	function formatDate(dateStr) {
		if (!dateStr) return '';
		const d = new Date(dateStr);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatFullDate(dateStr) {
		if (!dateStr) return '';
		const parts = dateStr.split('-');
		if (parts.length === 3) {
			const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
			return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
		}
		const d = new Date(dateStr);
		return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
	}

	function formatTime(timestamp) {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
	}

	function getCleanDesc(desc) {
		if (!desc) return '';
		return desc.replace(/\s*\(Shared by @[^)\r\n]+\)\s*/gi, '').trim();
	}

	function formatTimeAgo(dateStr) {
		if (!dateStr) return '';
		const d = new Date(dateStr);
		const diff = Date.now() - d.getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'Just now';
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	let showFullScreenImage = $state(false);
	let fullScreenImageUrl = $state('');

	function openFullScreenImage(url) {
		fullScreenImageUrl = url;
		showFullScreenImage = true;
	}

	function closeFullScreenImage() {
		showFullScreenImage = false;
		fullScreenImageUrl = '';
	}

	function getMediaUrl(url) {
		if (!url) return '';
		if (url.startsWith('http://') || url.startsWith('https://')) return url;
		if (url.startsWith('/uploads/')) return url;
		if (url.startsWith('http://localhost/chronomuse/')) return url.replace('http://localhost/chronomuse/', '/');
		if (url.startsWith('/chronomuse/')) return url.replace('/chronomuse/', '/');
		return url;
	}

	function getMusicUrl(url) {
		if (!url) return '';
		if (url.startsWith('http://') || url.startsWith('https://')) return url;
		if (url.startsWith('/uploads/')) return url;
		if (url.startsWith('uploads/')) return '/' + url;
		return url;
	}

	function getMoodColor(mood) {
		const colors = {
			'Happy': 'bg-yellow-100 text-yellow-700 border-yellow-300',
			'Sad': 'bg-blue-100 text-blue-700 border-blue-300',
			'Excited': 'bg-orange-100 text-orange-700 border-orange-300',
			'Angry': 'bg-red-100 text-red-700 border-red-300',
			'Calm': 'bg-green-100 text-green-700 border-green-300',
			'Anxious': 'bg-purple-100 text-purple-700 border-purple-300',
			'Grateful': 'bg-pink-100 text-pink-700 border-pink-300',
			'Lonely': 'bg-gray-100 text-gray-700 border-gray-300',
			'Love': 'bg-rose-100 text-rose-700 border-rose-300',
			'Neutral': 'bg-slate-100 text-slate-700 border-slate-300'
		};
		return colors[mood] || 'bg-pink-100 text-pink-700 border-pink-300';
	}

	function handleCardClick(item, e) {
		openMemoryDetails(item, e);
	}

	function openMemoryDetails(item, e) {
		if (e) e.stopPropagation();
		selectedMemoryToView = item;
		showViewMemoryModal = true;
	}

	function goToCalendarDate(date, e) {
		if (e) e.stopPropagation();
		if (!date) return;
		goto(`/dashboard?date=${date}`);
	}

	function handleOpenChat(senderId, senderUsername) {
		goto(`/chat?friend_id=${senderId}&username=${encodeURIComponent(senderUsername)}`);
	}

	async function handleRespondRequest(requestId, action) {
		if (!user || !user.id || isResponding) return;
		isResponding = true;

		// Find target sender
		const reqItem = notifications.incoming_requests.find(r => r.request_id === requestId || r.id === requestId);
		const targetSenderId = reqItem?.sender_id || reqItem?.id;

		// 0ms Optimistic removal
		const backupReqs = [...notifications.incoming_requests];
		notifications.incoming_requests = notifications.incoming_requests.filter(r => r.request_id !== requestId && r.id !== requestId);
		notifications.total_notifications_count = Math.max(0, notifications.total_notifications_count - 1);

		broadcastFriendEvent(user.id, targetSenderId, action === 'accept' ? 'accept_request' : 'decline_request');

		try {
			const res = await fetch(API_ENDPOINTS.respondToFriendRequest, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					request_id: requestId,
					action,
					user_id: user.id
				})
			});
			const data = await res.json();
			if (data.success) {
				fetchNotifications();
				broadcastFriendEvent(user.id, targetSenderId, action === 'accept' ? 'accept_request' : 'decline_request');
			} else {
				notifications.incoming_requests = backupReqs;
				showNotification('Error: ' + (data.error || 'Failed to respond'), 'error');
			}
		} catch (err) {
			notifications.incoming_requests = backupReqs;
			console.error('Error responding to request:', err);
		} finally {
			isResponding = false;
		}
	}

	async function handleRespondSharedMemory(item, action, e) {
		if (e) e.stopPropagation();
		if (!user || !user.id || isResponding) return;
		isResponding = true;

		const backupMemories = [...notifications.shared_memories];

		if (action === 'accept') {
			// Update status in place to 'accepted' so it moves to All & Memories
			notifications.shared_memories = notifications.shared_memories.map(m => 
				m.share_id === item.share_id ? { ...m, status: 'accepted' } : m
			);
			showViewMemoryModal = false;
		} else {
			// Decline removes it
			notifications.shared_memories = notifications.shared_memories.filter(m => m.share_id !== item.share_id);
			notifications.total_notifications_count = Math.max(0, notifications.total_notifications_count - 1);
			showViewMemoryModal = false;
		}

		broadcastMemoryEvent(user.id, item.sender_id, action === 'accept' ? 'shared_memory_accepted' : 'shared_memory_declined', item.memory);

		try {
			const res = await fetch(API_ENDPOINTS.respondToSharedMemory, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					share_id: item.share_id,
					memory_id: item.memory?.id,
					user_id: user.id,
					action
				})
			});
			const data = await res.json();
			if (data.success) {
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_notification_change'));
					window.dispatchEvent(new CustomEvent('chronomuse_memory_change'));
				}
				fetchNotifications();
				broadcastMemoryEvent(user.id, item.sender_id, action === 'accept' ? 'shared_memory_accepted' : 'shared_memory_declined', item.memory);
			} else {
				notifications.shared_memories = backupMemories;
				showNotification('Error: ' + (data.error || 'Failed to process request'), 'error');
			}
		} catch (err) {
			notifications.shared_memories = backupMemories;
			console.error('Error responding to shared memory:', err);
		} finally {
			isResponding = false;
		}
	}

	function promptCancelShare(item, e) {
		if (e) e.stopPropagation();
		cancelConfirmItem = item;
		showCancelModal = true;
	}

	async function confirmCancelShare() {
		if (!cancelConfirmItem || !user || !user.id || isCancelling) return;
		const itemToCancel = cancelConfirmItem;
		isCancelling = true;

		const backupSent = [...(notifications.sent_shared_memories || [])];
		// Optimistic removal
		notifications.sent_shared_memories = (notifications.sent_shared_memories || []).filter(m => m.share_id !== itemToCancel.share_id);
		showCancelModal = false;
		cancelConfirmItem = null;

		broadcastMemoryEvent(user.id, itemToCancel.recipient_id, 'shared_memory_cancelled', itemToCancel.memory);

		try {
			const res = await fetch(API_ENDPOINTS.cancelSharedMemory, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					share_id: itemToCancel.share_id,
					user_id: user.id
				})
			});
			const data = await res.json();
			if (data.success) {
				fetchNotifications();
				broadcastMemoryEvent(user.id, itemToCancel.recipient_id, 'shared_memory_cancelled', itemToCancel.memory);
			} else {
				notifications.sent_shared_memories = backupSent;
				showNotification('Error: ' + (data.error || 'Failed to cancel share'), 'error');
			}
		} catch (err) {
			notifications.sent_shared_memories = backupSent;
			console.error('Error cancelling shared memory:', err);
		} finally {
			isCancelling = false;
		}
	}

	let hasNotifications = $derived(totalPendingMemoriesCount > 0);
</script>

<svelte:head>
	<title>Notifications & Requests - ChronoMuse</title>
</svelte:head>

<div class="flex flex-col min-h-screen bg-gradient-to-br from-pink-100 via-pink-200 to-pink-300 animate-fade-in font-sans">
	<!-- Top Navigation -->
	<nav class="bg-white/85 backdrop-blur-md border-b-2 border-pink-300 shadow-lg sticky top-0 z-50 animate-slide-down">
			<div class="container mx-auto px-4 py-3 flex items-center justify-between">
				<div class="flex items-center space-x-3 min-w-0">
					<!-- Hamburger Menu Button -->
					<button
						onclick={toggleSidebar}
						class="p-1.5 sm:p-2 text-pink-500 hover:bg-pink-100 rounded-lg transition-colors flex-shrink-0 active:scale-95 relative"
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
						{#if hasNotifications}
							<span class="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white animate-pulse"></span>
						{/if}
					</button>
					<img src="/logo.png" alt="ChronoMuse" class="w-9 h-9 sm:w-10 sm:h-10 rounded-md object-contain flex-shrink-0" />
					<span class="text-base sm:text-lg font-bold text-pink-500 truncate">ChronoMuse</span>
				</div>

				<div class="flex items-center space-x-2 sm:space-x-4 flex-shrink-0 ml-2">
					<button
						onclick={() => goto('/profile')}
						class="hidden md:block text-pink-700 hover:text-pink-900 transition-colors font-medium cursor-pointer text-left active:scale-95"
						title="View Profile"
					>
						<span class="text-sm">Welcome, <strong>{user?.username}</strong></span>
					</button>
					<button
						onclick={() => goto('/settings')}
						class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-pink-100 hover:bg-pink-200 border border-pink-300 text-pink-600 shadow-2xs flex items-center justify-center transition-all cursor-pointer active:scale-95 flex-shrink-0"
						title="Settings"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
					</button>
				</div>
			</div>
		</nav>

		<!-- Sidebar Component -->
		<Sidebar bind:isOpen={sidebarOpen} on:logout={handleLogout} />

		<!-- Main Content -->
		<main class="flex-grow container mx-auto px-3 sm:px-4 py-6 sm:py-8 max-w-4xl">
			<!-- Header Banner -->
			<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-4 mb-5 animate-fade-in-up">
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
							<h1 class="text-base sm:text-lg font-extrabold text-pink-600 flex items-center space-x-2">
								<span>Notifications & Requests</span>
								{#if totalPendingMemoriesCount > 0}
									<span class="text-xs bg-pink-500 text-white px-2 py-0.5 rounded-full font-bold">
										{totalPendingMemoriesCount}
									</span>
								{/if}
							</h1>
						</div>
						<p class="text-xs text-pink-400 ml-7 sm:ml-8">Accept memory requests to add them to your calendar, or manage notifications</p>
					</div>

					<!-- Navigation Tabs -->
					<div class="w-full sm:w-auto grid grid-cols-3 sm:flex items-center gap-1 sm:space-x-1 bg-pink-100/80 p-1 rounded-xl border border-pink-200">
						<button
							onclick={() => activeTab = 'memories'}
							class="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center space-x-1 active:scale-95 text-center relative cursor-pointer"
							class:bg-pink-500={activeTab === 'memories'}
							class:text-white={activeTab === 'memories'}
							class:shadow-sm={activeTab === 'memories'}
							class:text-pink-600={activeTab !== 'memories'}
							class:hover:bg-pink-200={activeTab !== 'memories'}
						>
							<span>Shared Memories ({totalMemoriesCount})</span>
						</button>

						<button
							onclick={() => activeTab = 'pending_memories'}
							class="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center space-x-1 active:scale-95 text-center relative cursor-pointer"
							class:bg-pink-500={activeTab === 'pending_memories'}
							class:text-white={activeTab === 'pending_memories'}
							class:shadow-sm={activeTab === 'pending_memories'}
							class:text-pink-600={activeTab !== 'pending_memories'}
							class:hover:bg-pink-200={activeTab !== 'pending_memories'}
						>
							<span>Pending Memories ({totalPendingMemoriesCount})</span>
							{#if pendingSharedMemories.length > 0}
								<span class="w-2 h-2 rounded-full bg-rose-500 animate-ping absolute -top-0.5 -right-0.5"></span>
							{/if}
						</button>

						<button
							onclick={() => activeTab = 'sent'}
							class="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center space-x-1 active:scale-95 text-center cursor-pointer"
							class:bg-pink-500={activeTab === 'sent'}
							class:text-white={activeTab === 'sent'}
							class:shadow-sm={activeTab === 'sent'}
							class:text-pink-600={activeTab !== 'sent'}
							class:hover:bg-pink-200={activeTab !== 'sent'}
						>
							<span>Shared by You ({totalSentCount})</span>
						</button>
					</div>
				</div>
			</div>

			<!-- Tab Contents -->
			{#if isLoading && !hasLoadedOnce}
				<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-12 text-center animate-fade-in">
					<div class="w-10 h-10 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
					<p class="text-xs text-pink-500 font-semibold animate-pulse">Loading notifications...</p>
				</div>
			{:else if activeTab === 'memories'}
				{#if acceptedSharedMemories.length === 0}
					<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-10 text-center animate-fade-in">
						<div class="w-14 h-14 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-3 text-pink-400">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-7 h-7">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</div>
						<h2 class="text-base font-bold text-pink-700">No Shared Memories Yet</h2>
						<p class="text-xs text-pink-400 mt-1 max-w-sm mx-auto">
							Memories that you accept from friends will be saved on your calendar and appear here.
						</p>
					</div>
				{:else}
					<div class="space-y-4 animate-fade-in">
						<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-4 sm:p-5">
							<h2 class="text-xs sm:text-sm font-bold text-pink-600 mb-3 uppercase tracking-wide flex items-center space-x-1.5">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-500">
									<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<span>Saved on Calendar ({acceptedSharedMemories.length})</span>
							</h2>

							<div class="space-y-3">
								{#each acceptedSharedMemories as item (item.share_id)}
									<div
										role="button"
										tabindex="0"
										onclick={(e) => handleCardClick(item, e)}
										onkeydown={(e) => { if (e.key === 'Enter') handleCardClick(item, e); }}
										class="p-3.5 sm:p-4 bg-white hover:bg-pink-50/50 border border-pink-200 hover:border-pink-300 rounded-2xl shadow-xs transition-all duration-200 cursor-pointer group hover:shadow-md"
									>
										<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
											<div class="flex items-center space-x-3 min-w-0">
												<button
													type="button"
													onclick={(e) => { e.stopPropagation(); goto(`/profile?id=${item.sender_id}`); }}
													class="w-11 h-11 rounded-xl bg-gradient-to-tr from-pink-400 to-rose-500 text-white font-bold text-base flex items-center justify-center flex-shrink-0 shadow-xs group-hover:scale-105 transition-transform overflow-hidden cursor-pointer"
													title="View @{item.sender_username}'s Profile"
												>
													{#if item.sender_avatar_url}
														<img src={item.sender_avatar_url} alt={item.sender_username} class="w-full h-full object-cover" />
													{:else}
														{item.sender_username.charAt(0).toUpperCase()}
													{/if}
												</button>
												<div class="min-w-0 flex-grow">
													<div class="flex items-center gap-1.5 flex-wrap">
														<button
															type="button"
															onclick={(e) => { e.stopPropagation(); goto(`/profile?id=${item.sender_id}`); }}
															class="text-sm font-bold text-pink-700 hover:underline hover:text-pink-900 cursor-pointer"
														>
															@{item.sender_username}
														</button>
														<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
															<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3 text-emerald-600">
																<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
															</svg>
															<span>Saved to Calendar</span>
														</span>
														{#if item.memory.mood_tag}
															<span class="text-[10px] px-2 py-0.5 rounded-full font-bold border {getMoodColor(item.memory.mood_tag)}">
																{item.memory.mood_tag}
															</span>
														{/if}
													</div>

													<p class="text-xs text-pink-900 font-semibold mt-1 truncate">
														{item.memory.memory_tag || 'Special Memory'}
														<span class="text-pink-400 font-normal ml-1">• {formatDate(item.memory.date)}</span>
													</p>

													<p class="text-[11px] text-pink-400 mt-0.5 flex items-center space-x-1 group-hover:text-pink-600 transition-colors">
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 text-pink-400 group-hover:text-pink-500">
															<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
															<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
														</svg>
														<span>Tap to preview details</span>
													</p>
												</div>
											</div>

											<div class="flex items-center space-x-2 self-end sm:self-center flex-shrink-0">
												<button
													type="button"
													onclick={(e) => goToCalendarDate(item.memory.date, e)}
													class="px-3.5 py-1.5 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
												>
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
														<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
													</svg>
													<span>Open on Calendar</span>
												</button>
											</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					</div>
				{/if}
			{:else if activeTab === 'pending_memories'}
				<!-- Tab 2: Pending Memories Tab -->
				{#if pendingSharedMemories.length === 0}
					<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-10 text-center animate-fade-in">
						<div class="w-14 h-14 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-3 text-pink-400">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-7 h-7">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</div>
						<h2 class="text-base font-bold text-pink-700">No Pending Memories</h2>
						<p class="text-xs text-pink-400 mt-1 max-w-sm mx-auto">
							When friends share memories with you, they will appear here so you can accept them to add to your calendar.
						</p>
					</div>
				{:else}
					<div class="space-y-4 animate-fade-in">
						<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-4 sm:p-5">
							<h2 class="text-xs sm:text-sm font-bold text-pink-600 mb-3 uppercase tracking-wide flex items-center space-x-1.5">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-500">
									<path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
								</svg>
								<span>Action Required: Memory Share Requests ({pendingSharedMemories.length})</span>
							</h2>

							<div class="space-y-3">
								{#each pendingSharedMemories as item (item.share_id)}
									<div
										role="button"
										tabindex="0"
										onclick={(e) => handleCardClick(item, e)}
										onkeydown={(e) => { if (e.key === 'Enter') handleCardClick(item, e); }}
										class="p-3.5 sm:p-4 bg-white hover:bg-pink-50/50 border border-pink-200 hover:border-pink-300 rounded-2xl shadow-xs transition-all duration-200 cursor-pointer group hover:shadow-md"
									>
										<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
											<div class="flex items-center space-x-3 min-w-0">
												<button
													type="button"
													onclick={(e) => { e.stopPropagation(); goto(`/profile?id=${item.sender_id}`); }}
													class="w-11 h-11 rounded-xl bg-gradient-to-tr from-pink-400 to-rose-500 text-white font-bold text-base flex items-center justify-center flex-shrink-0 shadow-xs group-hover:scale-105 transition-transform overflow-hidden cursor-pointer"
													title="View @{item.sender_username}'s Profile"
												>
													{#if item.sender_avatar_url}
														<img src={item.sender_avatar_url} alt={item.sender_username} class="w-full h-full object-cover" />
													{:else}
														{item.sender_username.charAt(0).toUpperCase()}
													{/if}
												</button>
												<div class="min-w-0 flex-grow">
													<div class="flex items-center gap-1.5 flex-wrap">
														<button
															type="button"
															onclick={(e) => { e.stopPropagation(); goto(`/profile?id=${item.sender_id}`); }}
															class="text-sm font-bold text-pink-700 hover:underline hover:text-pink-900 cursor-pointer"
														>
															@{item.sender_username}
														</button>
														<span class="text-[11px] text-pink-500 font-medium">shared a memory</span>
														{#if item.memory.mood_tag}
															<span class="text-[10px] px-2 py-0.5 rounded-full font-bold border {getMoodColor(item.memory.mood_tag)}">
																{item.memory.mood_tag}
															</span>
														{/if}
													</div>

													<p class="text-xs text-pink-900 font-semibold mt-1 truncate">
														{item.memory.memory_tag || 'Special Memory'}
														<span class="text-pink-400 font-normal ml-1">• {formatDate(item.memory.date)}</span>
													</p>

													<p class="text-[11px] text-pink-400 mt-0.5 flex items-center space-x-1 group-hover:text-pink-600 transition-colors">
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 text-pink-400 group-hover:text-pink-500">
															<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
															<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
														</svg>
														<span>Tap to preview details</span>
													</p>
												</div>
											</div>

											<!-- Accept / Decline Buttons -->
											<div class="flex items-center space-x-1.5 self-end sm:self-center flex-shrink-0">
												<button
													type="button"
													onclick={(e) => handleRespondSharedMemory(item, 'accept', e)}
													class="px-3.5 py-1.5 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center space-x-1 cursor-pointer"
													title="Accept and add memory to my calendar"
												>
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
														<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
													</svg>
													<span>Accept</span>
												</button>

												<button
													type="button"
													onclick={(e) => handleRespondSharedMemory(item, 'decline', e)}
													class="px-3 py-1.5 bg-pink-100 hover:bg-red-100 text-pink-600 hover:text-red-600 active:scale-95 rounded-xl text-xs font-bold transition-all cursor-pointer"
													title="Decline memory share request"
												>
													Decline
												</button>
											</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					</div>
				{/if}
			{:else if activeTab === 'sent'}
				<!-- Tab 3: Sent / Shared by You Tab -->
				{#if sentSharedMemories.length === 0}
					<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-10 text-center animate-fade-in">
						<div class="w-14 h-14 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-3 text-pink-400">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-7 h-7">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
							</svg>
						</div>
						<h2 class="text-base font-bold text-pink-700">No Memories Shared Yet</h2>
						<p class="text-xs text-pink-400 mt-1 max-w-sm mx-auto">
							When you share memories with your friends, they will appear here. You can cancel or unshare them anytime if you change your mind!
						</p>
					</div>
				{:else}
					<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-4 sm:p-5 animate-fade-in">
						<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3.5">
							<h2 class="text-xs sm:text-sm font-bold text-pink-600 uppercase tracking-wide flex items-center space-x-1.5">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-500">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
								</svg>
								<span>Your Shared Memories with Friends ({sentSharedMemories.length})</span>
							</h2>
							<span class="text-[11px] text-pink-400 font-medium">You can cancel or unshare anytime</span>
						</div>

						<div class="space-y-3">
							{#each sentSharedMemories as item (item.share_id)}
								<div
									role="button"
									tabindex="0"
									onclick={(e) => handleCardClick(item, e)}
									onkeydown={(e) => { if (e.key === 'Enter') handleCardClick(item, e); }}
									class="p-3.5 sm:p-4 bg-white hover:bg-pink-50/50 border border-pink-200 hover:border-pink-300 rounded-2xl shadow-xs transition-all duration-200 cursor-pointer group hover:shadow-md"
								>
									<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
										<div class="flex items-center space-x-3 min-w-0">
											<button
												type="button"
												onclick={(e) => { e.stopPropagation(); goto(`/profile?id=${item.recipient_id}`); }}
												class="w-11 h-11 rounded-xl bg-gradient-to-tr from-pink-400 to-rose-500 text-white font-bold text-base flex items-center justify-center flex-shrink-0 shadow-xs group-hover:scale-105 transition-transform overflow-hidden cursor-pointer"
												title="View @{item.recipient_username}'s Profile"
											>
												{#if item.recipient_avatar_url}
													<img src={item.recipient_avatar_url} alt={item.recipient_username} class="w-full h-full object-cover" />
												{:else}
													{item.recipient_username.charAt(0).toUpperCase()}
												{/if}
											</button>
											<div class="min-w-0 flex-grow">
												<div class="flex items-center gap-1.5 flex-wrap">
													<span class="text-xs text-pink-500 font-medium">Shared with</span>
													<button
														type="button"
														onclick={(e) => { e.stopPropagation(); goto(`/profile?id=${item.recipient_id}`); }}
														class="text-sm font-bold text-pink-700 hover:underline hover:text-pink-900 cursor-pointer"
													>
														@{item.recipient_username}
													</button>
													{#if item.status === 'accepted'}
														<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
															<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3 text-emerald-600">
																<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
															</svg>
															<span>Accepted by Friend</span>
														</span>
													{:else}
														<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
															<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 text-amber-600">
																<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
															</svg>
															<span>Pending Approval</span>
														</span>
													{/if}
													{#if item.memory.mood_tag}
														<span class="text-[10px] px-2 py-0.5 rounded-full font-bold border {getMoodColor(item.memory.mood_tag)}">
															{item.memory.mood_tag}
														</span>
													{/if}
												</div>

												<p class="text-xs text-pink-900 font-semibold mt-1 truncate">
													{item.memory.memory_tag || item.memory.title || 'Special Memory'}
													<span class="text-pink-400 font-normal ml-1">• {formatDate(item.memory.date)}</span>
												</p>

												<p class="text-[11px] text-pink-400 mt-0.5 flex items-center space-x-1 group-hover:text-pink-600 transition-colors">
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 text-pink-400 group-hover:text-pink-500">
														<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
														<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
													</svg>
													<span>Tap to preview details</span>
													{#if item.shared_at}
														<span class="text-pink-300">• {formatTimeAgo(item.shared_at)}</span>
													{/if}
												</p>
											</div>
										</div>

										<!-- Actions (Cancel Share) -->
										<div class="flex items-center space-x-2 self-end sm:self-center flex-shrink-0">
											<button
												type="button"
												onclick={(e) => promptCancelShare(item, e)}
												class="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 border border-rose-200 active:scale-95 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs"
												title="Cancel and unshare this memory"
											>
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 h-3.5 text-rose-500">
													<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
												</svg>
												<span>Cancel Share</span>
											</button>
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		</main>

		<!-- Footer -->
		<footer class="bg-white/85 backdrop-blur-md border-t-2 border-pink-300 animate-fade-in mt-auto" style="animation-delay: 0.4s">
			<div class="container mx-auto px-2 sm:px-4 py-2.5 sm:py-3 text-center flex items-center justify-center">
				<p class="text-[10px] sm:text-xs text-pink-700 whitespace-nowrap font-medium tracking-tight sm:tracking-normal">
					© 2026 CHRONOMUSE. All rights reserved. Developed by Merlye Deyto
				</p>
			</div>
		</footer>

		<!-- Full Memory Preview Modal (Exact replica of Calendar ViewMemoryModal) -->
		{#if showViewMemoryModal && selectedMemoryToView}
			<!-- Backdrop Overlay -->
			<div
				class="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in"
				onclick={(e) => { if (e.target === e.currentTarget) showViewMemoryModal = false; }}
			>
				<!-- Modal Container -->
				<div
					class="bg-white border-2 border-pink-300 rounded-2xl shadow-xl p-4 sm:p-5 relative max-w-sm sm:max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col animate-pop-in"
					onclick={(e) => e.stopPropagation()}
				>
					<!-- Close Button -->
					<button
						onclick={() => showViewMemoryModal = false}
						class="absolute top-3.5 right-3.5 p-1.5 text-pink-400 hover:text-pink-600 hover:bg-pink-100 rounded-lg transition-all duration-200 cursor-pointer"
						title="Close"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>

					<!-- Header -->
					<div class="text-center mb-4">
						<h2 class="text-base sm:text-lg font-bold text-pink-600">View Memories</h2>
						<p class="text-[11px] sm:text-xs text-pink-400 mt-0.5">Your special moments on this date</p>
					</div>

					<!-- Selected Date Card -->
					<div class="mb-3 p-3 bg-gradient-to-r from-pink-400 via-rose-400 to-pink-400 rounded-xl shadow-xs text-white flex-shrink-0">
						<div class="flex items-center space-x-2.5">
							<div class="p-1.5 bg-white/25 rounded-lg">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-white">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
								</svg>
							</div>
							<div>
								<p class="text-[10px] text-pink-100 uppercase tracking-wide font-medium">Selected Date</p>
								<p class="text-xs sm:text-sm font-bold">{formatFullDate(selectedMemoryToView.memory.date)}</p>
							</div>
						</div>
					</div>

					<!-- Memory Content - Scrollable List -->
					<div class="flex-1 overflow-y-auto pr-1 -mr-1 space-y-3">
						<div class="p-4 bg-pink-50/70 border-2 border-pink-200/80 rounded-xl space-y-3 hover:border-pink-300 transition-all duration-200">
							<!-- Header row: Shared by badge & mood tag & memory tag -->
							<div class="flex items-center justify-between gap-2 border-b border-pink-100 pb-2.5">
								<div class="flex items-center flex-wrap gap-1.5 min-w-0">
									<button
										type="button"
										onclick={() => { showViewMemoryModal = false; goto(`/profile?id=${selectedMemoryToView.sender_id || selectedMemoryToView.recipient_id}`); }}
										class="text-[11px] px-2.5 py-0.5 rounded-full bg-gradient-to-r from-pink-400 to-rose-400 hover:from-pink-500 hover:to-rose-500 text-white font-bold shadow-xs inline-flex items-center space-x-1 cursor-pointer hover:scale-102 transition-transform"
										title="View Profile"
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 text-pink-100 flex-shrink-0">
											<path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a5.97 5.97 0 00-.942 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
										</svg>
										<span>{selectedMemoryToView.sender_username ? `Shared by @${selectedMemoryToView.sender_username}` : `Shared with @${selectedMemoryToView.recipient_username}`}</span>
									</button>

									{#if selectedMemoryToView.memory.mood_tag}
										<span class="text-[10px] px-2.5 py-0.5 rounded-full border {getMoodColor(selectedMemoryToView.memory.mood_tag)} font-bold whitespace-nowrap shadow-xs">
											{selectedMemoryToView.memory.mood_tag}
										</span>
									{/if}

									{#if selectedMemoryToView.memory.memory_tag && selectedMemoryToView.memory.memory_tag !== 'Untitled Memory' && selectedMemoryToView.memory.memory_tag !== 'Special Memory' && !selectedMemoryToView.memory.memory_tag.startsWith('Shared memory from')}
										<span class="text-[10px] px-2.5 py-0.5 rounded-full bg-pink-100 text-pink-700 border border-pink-300 font-bold whitespace-nowrap shadow-xs">
											{selectedMemoryToView.memory.memory_tag}
										</span>
									{/if}
								</div>
							</div>

							<!-- Memory Title if provided -->
							{#if selectedMemoryToView.memory.title && selectedMemoryToView.memory.title !== 'Untitled Memory'}
								<h3 class="text-sm sm:text-base font-bold text-pink-800">
									{selectedMemoryToView.memory.title}
								</h3>
							{/if}

							<!-- Description Body -->
							{#if selectedMemoryToView.memory.description}
								<p class="text-xs sm:text-sm font-medium text-pink-900 leading-relaxed whitespace-pre-wrap">{getCleanDesc(selectedMemoryToView.memory.description)}</p>
							{/if}

							<!-- Photo / Video Attachment -->
							{#if selectedMemoryToView.memory.photo_video}
								{#if selectedMemoryToView.memory.photo_video_type === 'video' || (typeof selectedMemoryToView.memory.photo_video === 'string' && (selectedMemoryToView.memory.photo_video.endsWith('.mp4') || selectedMemoryToView.memory.photo_video.endsWith('.webm')))}
									<div class="relative rounded-lg overflow-hidden border-2 border-pink-200">
										<video src={getMediaUrl(selectedMemoryToView.memory.photo_video)} class="w-full h-44 object-cover" controls aria-label="Memory video"></video>
									</div>
								{:else}
									<div
										class="relative rounded-lg overflow-hidden border-2 border-pink-200 cursor-pointer hover:border-pink-400 transition-all duration-200"
										onclick={() => openFullScreenImage(getMediaUrl(selectedMemoryToView.memory.photo_video))}
									>
										<img src={getMediaUrl(selectedMemoryToView.memory.photo_video)} alt="Memory Attachment" class="w-full h-44 object-cover hover:scale-105 transition-transform duration-300" />
										<div class="absolute inset-0 bg-black/0 hover:bg-black/10 transition-all duration-200 flex items-center justify-center pointer-events-none">
											<span class="text-white text-xs font-medium opacity-0 hover:opacity-100 bg-black/50 px-2.5 py-1 rounded-full">Click to enlarge</span>
										</div>
									</div>
								{/if}
							{/if}

							<!-- Music Audio Player Attachment -->
							{#if selectedMemoryToView.memory.music}
								<div class="rounded-lg overflow-hidden border border-pink-200 bg-gradient-to-r from-pink-50 to-pink-100 p-2.5">
									<div class="flex items-center space-x-1.5 mb-1.5">
										<div class="w-6 h-6 rounded-full bg-gradient-to-r from-pink-400 to-pink-600 flex items-center justify-center">
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5 text-white">
												<path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
											</svg>
										</div>
										<span class="text-[11px] font-semibold text-pink-600">Memory Music</span>
									</div>
									<div class="custom-audio-player">
										<audio src={getMusicUrl(selectedMemoryToView.memory.music)} controls preload="metadata" class="w-full" crossorigin="anonymous"></audio>
									</div>
								</div>
							{/if}

							<!-- Footer Timestamp -->
							<div class="flex items-center justify-between pt-1.5 border-t border-pink-200">
								<span class="text-[10px] text-pink-400">
									Created: {formatTime(selectedMemoryToView.memory.created_at || selectedMemoryToView.shared_at)}
								</span>
							</div>
						</div>
					</div>

					<!-- Bottom Action Buttons Footer -->
					<div class="mt-3 pt-3 border-t border-pink-200 flex-shrink-0">
						{#if selectedMemoryToView.status === 'accepted'}
							<div class="flex items-center space-x-2">
								<button
									onclick={(e) => goToCalendarDate(selectedMemoryToView.memory.date, e)}
									class="flex-1 py-2.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl active:scale-95 transition-all duration-200 text-xs sm:text-sm font-bold shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
										<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
									</svg>
									<span>Open on Calendar</span>
								</button>

								<button
									onclick={() => handleOpenChat(selectedMemoryToView.sender_id, selectedMemoryToView.sender_username)}
									class="py-2.5 px-3 bg-white border-2 border-pink-300 text-pink-600 hover:bg-pink-50 rounded-xl active:scale-95 transition-all duration-200 text-xs sm:text-sm font-bold flex items-center justify-center space-x-1.5 cursor-pointer"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
										<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
									</svg>
									<span>Say Thanks in Chat</span>
								</button>
							</div>
						{:else}
							<div class="flex items-center space-x-2">
								<button
									onclick={(e) => handleRespondSharedMemory(selectedMemoryToView, 'accept', e)}
									class="flex-1 py-2.5 px-3 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-all duration-200 flex items-center justify-center space-x-1.5 cursor-pointer"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4">
										<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
									</svg>
									<span>Accept Memory</span>
								</button>

								<button
									onclick={(e) => handleRespondSharedMemory(selectedMemoryToView, 'decline', e)}
									class="py-2.5 px-4 bg-pink-100 hover:bg-red-100 text-pink-600 hover:text-red-600 active:scale-95 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer"
								>
									Decline
								</button>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- Cancel Shared Memory Confirmation Modal -->
		{#if showCancelModal && cancelConfirmItem}
			<div
				class="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in"
				onclick={() => { if (!isCancelling) showCancelModal = false; }}
			>
				<div
					class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl p-6 max-w-sm w-full animate-modal-content text-center"
					onclick={(e) => e.stopPropagation()}
				>
					<div class="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs">
						<svg class="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
							<path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.088 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 00-3.273 0C6.39 3.05 6 3.678 6 4.478v.113a49.488 49.488 0 0012 0v-.113c0-.8-.39-1.428-1.091-1.452a51.196 51.196 0 00-3.273 0zM9.75 9.75a.75.75 0 01.75.75v6.75a.75.75 0 01-1.5 0v-6.75a.75.75 0 01.75-.75zm4.5 0a.75.75 0 01.75.75v6.75a.75.75 0 01-1.5 0v-6.75a.75.75 0 01.75-.75z" clip-rule="evenodd" />
						</svg>
					</div>
					<h3 class="text-lg font-bold text-pink-950 mb-1.5">Cancel Shared Memory?</h3>
					<p class="text-xs sm:text-sm text-pink-600 mb-6 leading-relaxed">
						Are you sure you want to cancel sharing this memory with <strong class="text-pink-900 font-bold">@{cancelConfirmItem.recipient_username}</strong>? This will revoke their access to it from their calendar.
					</p>
					<div class="flex items-center space-x-3">
						<button
							onclick={() => showCancelModal = false}
							disabled={isCancelling}
							class="w-1/2 py-2.5 bg-pink-100 text-pink-700 hover:bg-pink-200 text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50 shadow-xs"
						>
							Keep Shared
						</button>
						<button
							onclick={confirmCancelShare}
							disabled={isCancelling}
							class="w-1/2 py-2.5 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white text-sm font-bold rounded-xl shadow-md shadow-rose-200 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
						>
							{isCancelling ? 'Cancelling...' : 'Cancel Share'}
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Full-screen Image Modal Lightbox -->
		{#if showFullScreenImage}
			<div 
				class="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4 animate-fade-in"
				onclick={closeFullScreenImage}
			>
				<button
					onclick={closeFullScreenImage}
					class="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all cursor-pointer"
					title="Close Full Screen"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
				<img src={fullScreenImageUrl} alt="Full screen preview" class="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
			</div>
		{/if}
	</div>

<style>
	@keyframes fade-in {
		0% { opacity: 0; }
		100% { opacity: 1; }
	}
	.animate-fade-in {
		animation: fade-in 0.25s ease-out;
	}

	@keyframes pop-in {
		0% { transform: scale(0.95); opacity: 0; }
		100% { transform: scale(1); opacity: 1; }
	}
	.animate-pop-in {
		animation: pop-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.custom-audio-player audio {
		width: 100%;
		height: 36px;
		border-radius: 9999px;
	}
	.custom-audio-player audio::-webkit-media-controls-panel {
		background-color: #fce7f3;
		border-radius: 9999px;
	}
	.custom-audio-player audio::-webkit-media-controls-play-button {
		background-color: #ec4899;
		border-radius: 50%;
	}
	.custom-audio-player audio::-webkit-media-controls-current-time-display,
	.custom-audio-player audio::-webkit-media-controls-time-remaining-display {
		color: #be185d;
		font-size: 10px;
		font-weight: 600;
	}
</style>
