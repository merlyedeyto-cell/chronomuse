<script>
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import { playClickSound } from '$lib/soundEffects.js';
	import { broadcastMemoryEvent, broadcastFriendEvent } from '$lib/realtimeBroadcast.js';
	import AppHeader from '$lib/AppHeader.svelte';
	import AppFooter from '$lib/AppFooter.svelte';

	let user = $state(null);
	let isLoading = $state(false);
	let hasLoadedOnce = $state(false);
	let activeTab = $state('memories'); // 'memories', 'pending_memories', 'sent'
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

	function getMemoryDisplayTitle(memory) {
		if (!memory) return 'Special Memory';
		if (memory.title && memory.title !== 'Untitled Memory' && memory.title !== 'Special Memory') {
			return memory.title;
		}
		if (memory.memory_tag && memory.memory_tag !== 'Untitled Memory' && !memory.memory_tag.startsWith('Shared memory from')) {
			return memory.memory_tag;
		}
		return 'Special Memory';
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
	let fullScreenMediaType = $state('image');

	function openFullScreenImage(url, type = 'image') {
		fullScreenImageUrl = url;
		fullScreenMediaType = type;
		showFullScreenImage = true;
	}

	function closeFullScreenImage() {
		showFullScreenImage = false;
		fullScreenImageUrl = '';
		fullScreenMediaType = 'image';
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

	function getMusicName(url) {
		if (!url) return '';
		try {
			const cleanUrl = url.split('?')[0];
			let filename = cleanUrl.split('/').pop();
			filename = decodeURIComponent(filename);

			filename = filename.replace(/^music_\d+_[a-z0-9]{6,8}_/i, '');
			filename = filename.replace(/^music_\d+_/i, '');
			filename = filename.replace(/^\d+_/i, '');

			if (filename.includes('_')) {
				filename = filename.replace(/_/g, ' ');
			}

			return filename;
		} catch (e) {
			return url;
		}
	}

	let modalAudioElement = $state(/** @type {HTMLAudioElement | null} */ (null));
	let isAudioPlaying = $state(false);
	let audioCurrentTime = $state(0);
	let audioDuration = $state(0);

	function toggleAudioPlay() {
		playClickSound();
		if (!modalAudioElement) return;
		if (isAudioPlaying) {
			modalAudioElement.pause();
		} else {
			modalAudioElement.play().catch(() => {});
		}
	}

	function handleAudioSeek(e) {
		const target = /** @type {HTMLInputElement} */ (e.target);
		const time = parseFloat(target.value);
		if (modalAudioElement) {
			modalAudioElement.currentTime = time;
			audioCurrentTime = time;
		}
	}

	function formatAudioTime(seconds) {
		if (isNaN(seconds) || seconds < 0) return '0:00';
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s < 10 ? '0' : ''}${s}`;
	}

	function handleCardClick(item, e) {
		openMemoryDetails(item, e);
	}

	function openMemoryDetails(item, e) {
		if (e) e.stopPropagation();
		if (modalAudioElement) {
			modalAudioElement.pause();
			isAudioPlaying = false;
			audioCurrentTime = 0;
		}
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

	async function handleRespondSharedMemory(item, action, e) {
		if (e) e.stopPropagation();
		if (!user || !user.id || isResponding) return;
		isResponding = true;

		const backupMemories = [...notifications.shared_memories];

		if (action === 'accept') {
			// Update status in place to 'accepted' so it moves to Shared Memories
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
			}
		} catch (err) {
			notifications.sent_shared_memories = backupSent;
			console.error('Error cancelling shared memory:', err);
		} finally {
			isCancelling = false;
		}
	}
</script>

<svelte:head>
	<title>Notifications & Requests - ChronoMuse</title>
</svelte:head>

<div class="flex flex-col min-h-screen bg-[#fff0f5] animate-fade-in font-sans selection:bg-pink-200">
	<!-- Top Navigation -->
	<AppHeader />

	<!-- Main Content Area -->
	<main class="flex-grow container mx-auto px-4 sm:px-6 py-6 pb-28 max-w-2xl space-y-4">
		<!-- Top Header Card (Notifications & Requests + 3-Pill Switcher) -->
		<div class="bg-white rounded-[32px] p-6 shadow-[0_6px_25px_rgba(244,114,182,0.12)] border border-pink-100/90 animate-fade-in">
			<div class="flex items-center space-x-2.5 mb-1">
				<button
					onclick={() => { playClickSound(); goto('/dashboard'); }}
					class="p-1.5 -ml-1 text-[#f43f8e] hover:text-[#d0256e] hover:bg-pink-50 rounded-xl transition-all active:scale-95 cursor-pointer"
					title="Back to Dashboard"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
					</svg>
				</button>
				<h1 class="text-xl font-black text-[#f43f8e] tracking-tight">
					Notifications & Requests
				</h1>
			</div>
			<p class="text-xs text-pink-400 font-bold ml-8 leading-relaxed">
				Accept memory requests to add them to your calendar, or manage notifications
			</p>

			<!-- 3-Pill Tab Switcher Container -->
			<div class="mt-4 bg-[#fff0f5] p-1.5 rounded-2xl grid grid-cols-3 gap-1.5 border border-pink-100/80">
				<!-- Tab 1: Shared Memories -->
				<button
					type="button"
					onclick={() => { playClickSound(); activeTab = 'memories'; }}
					class="py-2.5 px-2 rounded-2xl text-xs font-black transition-all flex items-center justify-center text-center cursor-pointer active:scale-95"
					class:bg-[#f43f8e]={activeTab === 'memories'}
					class:text-white={activeTab === 'memories'}
					class:shadow-sm={activeTab === 'memories'}
					class:text-pink-600={activeTab !== 'memories'}
					class:hover:text-pink-800={activeTab !== 'memories'}
				>
					<span>Shared Memories ({totalMemoriesCount})</span>
				</button>

				<!-- Tab 2: Pending Memories -->
				<button
					type="button"
					onclick={() => { playClickSound(); activeTab = 'pending_memories'; }}
					class="py-2.5 px-2 rounded-2xl text-xs font-black transition-all flex items-center justify-center text-center relative cursor-pointer active:scale-95"
					class:bg-[#f43f8e]={activeTab === 'pending_memories'}
					class:text-white={activeTab === 'pending_memories'}
					class:shadow-sm={activeTab === 'pending_memories'}
					class:text-pink-600={activeTab !== 'pending_memories'}
					class:hover:text-pink-800={activeTab !== 'pending_memories'}
				>
					<span>Pending Memories ({totalPendingMemoriesCount})</span>
					{#if pendingSharedMemories.length > 0}
						<span class="w-2 h-2 rounded-full bg-rose-500 animate-ping absolute top-1 right-2"></span>
					{/if}
				</button>

				<!-- Tab 3: Shared by You -->
				<button
					type="button"
					onclick={() => { playClickSound(); activeTab = 'sent'; }}
					class="py-2.5 px-2 rounded-2xl text-xs font-black transition-all flex items-center justify-center text-center cursor-pointer active:scale-95"
					class:bg-[#f43f8e]={activeTab === 'sent'}
					class:text-white={activeTab === 'sent'}
					class:shadow-sm={activeTab === 'sent'}
					class:text-pink-600={activeTab !== 'sent'}
					class:hover:text-pink-800={activeTab !== 'sent'}
				>
					<span>Shared by You ({totalSentCount})</span>
				</button>
			</div>
		</div>

		<!-- Main Content Display -->
		{#if isLoading && !hasLoadedOnce}
			<div class="bg-white rounded-[32px] p-12 text-center shadow-[0_6px_25px_rgba(244,114,182,0.12)] border border-pink-100/90 animate-fade-in">
				<div class="w-10 h-10 border-4 border-[#f43f8e] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
				<p class="text-xs text-[#f43f8e] font-black animate-pulse">Loading notifications...</p>
			</div>
		{:else if activeTab === 'memories'}
			<!-- Tab 1: Shared Memories (Saved on Calendar) -->
			{#if acceptedSharedMemories.length === 0}
				<div class="bg-white rounded-[32px] p-10 sm:p-14 text-center shadow-[0_6px_25px_rgba(244,114,182,0.12)] border border-pink-100/90 animate-fade-in">
					<div class="w-16 h-16 rounded-full bg-pink-50 flex items-center justify-center mx-auto mb-3.5 text-pink-300">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10"></circle>
							<path d="m9 12 2 2 4-4"></path>
						</svg>
					</div>
					<h2 class="text-base font-black text-[#f43f8e] mb-1">No Shared Memories Yet</h2>
					<p class="text-xs text-pink-400 font-bold max-w-sm mx-auto leading-relaxed">
						Memories that you accept from friends will be saved on your calendar and appear here.
					</p>
				</div>
			{:else}
				<div class="bg-white rounded-[32px] p-5 sm:p-6 shadow-[0_6px_25px_rgba(244,114,182,0.12)] border border-pink-100/90 animate-fade-in">
					<!-- Section Title Header -->
					<div class="flex items-center space-x-2 text-xs font-black text-[#f43f8e] uppercase tracking-wider mb-4">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-[#f43f8e]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10"></circle>
							<path d="m9 12 2 2 4-4"></path>
						</svg>
						<span>SAVED ON CALENDAR ({acceptedSharedMemories.length})</span>
					</div>

					<div class="space-y-3.5">
						{#each acceptedSharedMemories as item (item.share_id)}
							<div
								role="button"
								tabindex="0"
								onclick={(e) => { playClickSound(); handleCardClick(item, e); }}
								onkeydown={(e) => { if (e.key === 'Enter') { playClickSound(); handleCardClick(item, e); } }}
								class="bg-white rounded-[26px] p-4 sm:p-5 border border-pink-100 shadow-[0_4px_20px_rgba(244,114,182,0.06)] hover:border-pink-200 transition-all duration-200 cursor-pointer space-y-3 group"
							>
								<div class="flex items-center justify-between gap-3">
									<div class="flex items-center space-x-3.5 min-w-0">
										<!-- Avatar -->
										<button
											type="button"
											onclick={(e) => { e.stopPropagation(); playClickSound(); goto(`/profile?id=${item.sender_id}`); }}
											class="w-12 h-12 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 overflow-hidden text-pink-500 font-black text-lg group-hover:scale-105 transition-transform cursor-pointer"
											title="View @{item.sender_username}'s Profile"
										>
											{#if item.sender_avatar_url}
												<img src={item.sender_avatar_url} alt={item.sender_username} class="w-full h-full object-cover" />
											{:else}
												🍒
											{/if}
										</button>

										<div class="min-w-0 flex-grow">
											<div class="flex items-center gap-1.5 flex-wrap">
												<button
													type="button"
													onclick={(e) => { e.stopPropagation(); playClickSound(); goto(`/profile?id=${item.sender_id}`); }}
													class="text-sm font-black text-[#e8367f] group-hover:text-[#d0256e] hover:underline cursor-pointer"
												>
													@{item.sender_username}
												</button>
												<span class="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[11px] font-black px-2.5 py-0.5 rounded-full inline-flex items-center space-x-1">
													<span>✓ Saved to Calendar</span>
												</span>
												{#if item.memory.mood_tag}
													<span class="bg-amber-50 text-amber-600 border border-amber-200 text-[11px] font-black px-2.5 py-0.5 rounded-full">
														{item.memory.mood_tag}
													</span>
												{/if}
											</div>
											<p class="text-xs font-black text-pink-950/80 mt-1 truncate">
												{getMemoryDisplayTitle(item.memory)}
												<span class="text-pink-400 font-bold ml-1">• {formatDate(item.memory.date)}</span>
											</p>
										</div>
									</div>
								</div>

								<!-- Bottom Action Row -->
								<div class="flex items-center justify-between pt-2 border-t border-pink-50">
									<div class="text-[11px] text-pink-400 font-bold flex items-center space-x-1.5">
										<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
											<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
										</svg>
										<span>Tap to preview details</span>
									</div>

									<button
										type="button"
										onclick={(e) => { e.stopPropagation(); playClickSound(); goToCalendarDate(item.memory.date, e); }}
										class="bg-[#f43f8e] hover:bg-[#e0337f] text-white font-black text-xs py-2 px-4 rounded-2xl shadow-sm flex items-center space-x-1.5 active:scale-95 transition-all cursor-pointer"
									>
										<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
										</svg>
										<span>Open on Calendar</span>
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{:else if activeTab === 'pending_memories'}
			<!-- Tab 2: Pending Memories (Incoming Requests) -->
			{#if pendingSharedMemories.length === 0}
				<div class="bg-white rounded-[32px] p-10 sm:p-14 text-center shadow-[0_6px_25px_rgba(244,114,182,0.12)] border border-pink-100/90 animate-fade-in">
					<div class="w-16 h-16 rounded-full bg-pink-50 flex items-center justify-center mx-auto mb-3.5 text-pink-300">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10"></circle>
							<polyline points="12 6 12 12 16 14"></polyline>
						</svg>
					</div>
					<h2 class="text-base font-black text-[#f43f8e] mb-1">No Pending Memories</h2>
					<p class="text-xs text-pink-400 font-bold max-w-sm mx-auto leading-relaxed">
						When friends share memories with you, they will appear here so you can accept them to add to your calendar.
					</p>
				</div>
			{:else}
				<div class="bg-white rounded-[32px] p-5 sm:p-6 shadow-[0_6px_25px_rgba(244,114,182,0.12)] border border-pink-100/90 animate-fade-in">
					<div class="flex items-center space-x-2 text-xs font-black text-[#f43f8e] uppercase tracking-wider mb-4">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-[#f43f8e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
							<circle cx="12" cy="12" r="10"></circle>
							<polyline points="12 6 12 12 16 14"></polyline>
						</svg>
						<span>ACTION REQUIRED: PENDING MEMORIES ({pendingSharedMemories.length})</span>
					</div>

					<div class="space-y-3.5">
						{#each pendingSharedMemories as item (item.share_id)}
							<div
								role="button"
								tabindex="0"
								onclick={(e) => { playClickSound(); handleCardClick(item, e); }}
								onkeydown={(e) => { if (e.key === 'Enter') { playClickSound(); handleCardClick(item, e); } }}
								class="bg-white rounded-[26px] p-4 sm:p-5 border border-pink-100 shadow-[0_4px_20px_rgba(244,114,182,0.06)] hover:border-pink-200 transition-all duration-200 cursor-pointer space-y-3 group"
							>
								<div class="flex items-center justify-between gap-3">
									<div class="flex items-center space-x-3.5 min-w-0">
										<button
											type="button"
											onclick={(e) => { e.stopPropagation(); playClickSound(); goto(`/profile?id=${item.sender_id}`); }}
											class="w-12 h-12 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 overflow-hidden text-pink-500 font-black text-lg group-hover:scale-105 transition-transform cursor-pointer"
											title="View @{item.sender_username}'s Profile"
										>
											{#if item.sender_avatar_url}
												<img src={item.sender_avatar_url} alt={item.sender_username} class="w-full h-full object-cover" />
											{:else}
												🍒
											{/if}
										</button>

										<div class="min-w-0 flex-grow">
											<div class="flex items-center gap-1.5 flex-wrap">
												<button
													type="button"
													onclick={(e) => { e.stopPropagation(); playClickSound(); goto(`/profile?id=${item.sender_id}`); }}
													class="text-sm font-black text-[#e8367f] group-hover:text-[#d0256e] hover:underline cursor-pointer"
												>
													@{item.sender_username}
												</button>
												<span class="bg-pink-50 text-pink-500 border border-pink-200 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
													Shared a memory
												</span>
												{#if item.memory.mood_tag}
													<span class="bg-amber-50 text-amber-600 border border-amber-200 text-[11px] font-black px-2.5 py-0.5 rounded-full">
														{item.memory.mood_tag}
													</span>
												{/if}
											</div>
											<p class="text-xs font-black text-pink-950/80 mt-1 truncate">
												{getMemoryDisplayTitle(item.memory)}
												<span class="text-pink-400 font-bold ml-1">• {formatDate(item.memory.date)}</span>
											</p>
										</div>
									</div>
								</div>

								<!-- Bottom Row: Tap to Preview & Accept / Decline -->
								<div class="flex items-center justify-between pt-2 border-t border-pink-50">
									<div class="text-[11px] text-pink-400 font-bold flex items-center space-x-1.5">
										<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
											<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
										</svg>
										<span>Tap to preview details</span>
									</div>

									<div class="flex items-center space-x-2">
										<button
											type="button"
											onclick={(e) => { e.stopPropagation(); playClickSound(); handleRespondSharedMemory(item, 'accept', e); }}
											class="bg-[#f43f8e] hover:bg-[#e0337f] text-white font-black text-xs py-2 px-3.5 rounded-2xl shadow-sm flex items-center space-x-1.5 active:scale-95 transition-all cursor-pointer"
										>
											<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
											</svg>
											<span>Accept</span>
										</button>

										<button
											type="button"
											onclick={(e) => { e.stopPropagation(); playClickSound(); handleRespondSharedMemory(item, 'decline', e); }}
											class="bg-white border border-pink-200 hover:bg-rose-50 hover:border-rose-200 text-rose-500 font-black text-xs py-2 px-3 rounded-2xl active:scale-95 transition-all cursor-pointer"
										>
											Decline
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{:else if activeTab === 'sent'}
			<!-- Tab 3: Shared by You -->
			{#if sentSharedMemories.length === 0}
				<div class="bg-white rounded-[32px] p-10 sm:p-14 text-center shadow-[0_6px_25px_rgba(244,114,182,0.12)] border border-pink-100/90 animate-fade-in">
					<div class="w-16 h-16 rounded-full bg-pink-50 flex items-center justify-center mx-auto mb-3.5 text-pink-300">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
						</svg>
					</div>
					<h2 class="text-base font-black text-[#f43f8e] mb-1">No Memories Shared Yet</h2>
					<p class="text-xs text-pink-400 font-bold max-w-sm mx-auto leading-relaxed">
						When you share memories with your friends, they will appear here. You can cancel or unshare them anytime!
					</p>
				</div>
			{:else}
				<div class="bg-white rounded-[32px] p-5 sm:p-6 shadow-[0_6px_25px_rgba(244,114,182,0.12)] border border-pink-100/90 animate-fade-in">
					<div class="mb-4">
						<div class="flex items-center space-x-2 text-xs font-black text-[#f43f8e] uppercase tracking-wider">
							<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-[#f43f8e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
							</svg>
							<span>YOUR SHARED MEMORIES WITH FRIENDS ({sentSharedMemories.length})</span>
						</div>
						<p class="text-xs text-pink-400 font-bold mt-0.5">You can cancel or unshare anytime</p>
					</div>

					<div class="space-y-3.5">
						{#each sentSharedMemories as item (item.share_id)}
							<div
								role="button"
								tabindex="0"
								onclick={(e) => { playClickSound(); handleCardClick(item, e); }}
								onkeydown={(e) => { if (e.key === 'Enter') { playClickSound(); handleCardClick(item, e); } }}
								class="bg-white rounded-[26px] p-4 sm:p-5 border border-pink-100 shadow-[0_4px_20px_rgba(244,114,182,0.06)] hover:border-pink-200 transition-all duration-200 cursor-pointer space-y-3 group"
							>
								<div class="flex items-center justify-between gap-3">
									<div class="flex items-center space-x-3.5 min-w-0">
										<!-- Recipient Avatar -->
										<button
											type="button"
											onclick={(e) => { e.stopPropagation(); playClickSound(); goto(`/profile?id=${item.recipient_id}`); }}
											class="w-12 h-12 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 overflow-hidden text-pink-500 font-black text-lg group-hover:scale-105 transition-transform cursor-pointer"
											title="View @{item.recipient_username}'s Profile"
										>
											{#if item.recipient_avatar_url}
												<img src={item.recipient_avatar_url} alt={item.recipient_username} class="w-full h-full object-cover" />
											{:else}
												🍒
											{/if}
										</button>

										<div class="min-w-0 flex-grow">
											<div class="flex items-center gap-1.5 flex-wrap">
												<span class="text-sm font-black text-[#e8367f] group-hover:text-[#d0256e]">
													Shared with @{item.recipient_username}
												</span>
												{#if item.status === 'accepted'}
													<span class="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[11px] font-black px-2.5 py-0.5 rounded-full inline-flex items-center space-x-1">
														<span>✓ Accepted by Friend</span>
													</span>
												{:else}
													<span class="bg-amber-50 text-amber-600 border border-amber-200 text-[11px] font-black px-2.5 py-0.5 rounded-full inline-flex items-center space-x-1">
														<span>⏳ Pending Approval</span>
													</span>
												{/if}
												{#if item.memory.mood_tag}
													<span class="bg-amber-50 text-amber-600 border border-amber-200 text-[11px] font-black px-2.5 py-0.5 rounded-full">
														{item.memory.mood_tag}
													</span>
												{/if}
											</div>
											<p class="text-xs font-black text-pink-950/80 mt-1 truncate">
												{getMemoryDisplayTitle(item.memory)}
												<span class="text-pink-400 font-bold ml-1">• {formatDate(item.memory.date)}</span>
											</p>
										</div>
									</div>
								</div>

								<!-- Bottom Row: Tap to Preview & Cancel Share -->
								<div class="flex items-center justify-between pt-2 border-t border-pink-50">
									<div class="text-[11px] text-pink-400 font-bold flex items-center space-x-1.5">
										<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
											<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
										</svg>
										<span>Tap to preview details</span>
										{#if item.shared_at}
											<span class="text-pink-300">• {formatTimeAgo(item.shared_at)}</span>
										{/if}
									</div>

									<button
										type="button"
										onclick={(e) => { e.stopPropagation(); playClickSound(); promptCancelShare(item, e); }}
										class="bg-white border-2 border-pink-200 hover:border-pink-300 text-[#f43f8e] hover:bg-pink-50 font-black text-xs py-2 px-4 rounded-2xl active:scale-95 transition-all cursor-pointer flex items-center space-x-1.5"
									>
										<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-[#f43f8e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
											<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
										</svg>
										<span>Cancel Share</span>
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</main>

	<!-- Footer -->
	<AppFooter />

	<!-- View Memories Preview Modal (Exact design from Screenshot 4) -->
	{#if showViewMemoryModal && selectedMemoryToView}
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in font-sans"
			onclick={(e) => { if (e.target === e.currentTarget) { playClickSound(); showViewMemoryModal = false; } }}
		>
			<div
				class="bg-white border border-pink-100 rounded-[32px] p-6 shadow-2xl relative max-w-sm sm:max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col animate-pop-in"
				onclick={(e) => e.stopPropagation()}
			>
				<!-- Close Button -->
				<button
					onclick={() => { playClickSound(); showViewMemoryModal = false; }}
					class="absolute top-5 right-5 p-1 text-pink-400 hover:text-pink-600 hover:bg-pink-50 rounded-full transition-all cursor-pointer"
					title="Close"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>

				<!-- Header -->
				<div class="text-center mb-4">
					<h2 class="text-lg font-black text-[#f43f8e]">View Memories</h2>
					<p class="text-xs text-pink-400 font-bold mt-0.5">Your special moments on this date</p>
				</div>

				<!-- Selected Date Pill Banner -->
				<div class="mb-4 p-3.5 bg-[#f43f8e] rounded-2xl text-white shadow-sm flex-shrink-0">
					<div class="flex items-center space-x-3">
						<div class="p-2 bg-white/20 rounded-xl flex items-center justify-center">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-white">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
							</svg>
						</div>
						<div>
							<p class="text-[10px] text-pink-100 uppercase tracking-wider font-extrabold">Selected Date</p>
							<p class="text-sm font-black">{formatFullDate(selectedMemoryToView.memory.date)}</p>
						</div>
					</div>
				</div>

				<!-- Memory Detail Scrollable Card -->
				<div class="flex-1 overflow-y-auto pr-1 -mr-1 space-y-3">
					<div class="p-4 bg-pink-50/30 border border-pink-100 rounded-2xl space-y-3">
						<!-- Shared by Pill Badge & Mood Tag -->
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center flex-wrap gap-1.5">
								<span class="text-xs px-3 py-1 rounded-full bg-pink-100/70 text-[#f43f8e] font-black inline-flex items-center space-x-1.5">
									<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-[#f43f8e]" viewBox="0 0 24 24" fill="currentColor">
										<path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.104.75.75 0 00.424-.674v-.178a6.375 6.375 0 00-5.25-6.262v1.543c1.69.587 3.01 1.956 3.01 3.571h-3.01z" />
									</svg>
									<span>{selectedMemoryToView.sender_username ? `Shared by @${selectedMemoryToView.sender_username}` : `Shared with @${selectedMemoryToView.recipient_username}`}</span>
								</span>

								{#if selectedMemoryToView.memory.mood_tag}
									<span class="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 font-black">
										{selectedMemoryToView.memory.mood_tag}
									</span>
								{/if}

								{#if selectedMemoryToView.memory.memory_tag && selectedMemoryToView.memory.memory_tag !== 'Untitled Memory' && selectedMemoryToView.memory.memory_tag !== 'Special Memory' && !selectedMemoryToView.memory.memory_tag.startsWith('Shared memory from')}
									<span class="text-[11px] px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200 font-black">
										{selectedMemoryToView.memory.memory_tag}
									</span>
								{/if}
							</div>
						</div>

						<!-- Custom Title only if user provided a specific title (e.g. "bshw") -->
						{#if selectedMemoryToView.memory.title && selectedMemoryToView.memory.title !== 'Untitled Memory' && selectedMemoryToView.memory.title !== 'Special Memory' && selectedMemoryToView.memory.title !== selectedMemoryToView.memory.memory_tag}
							<h3 class="text-base font-black text-pink-950">
								{selectedMemoryToView.memory.title}
							</h3>
						{/if}

						<!-- Description -->
						{#if selectedMemoryToView.memory.description}
							<p class="text-xs font-semibold text-pink-900/90 leading-relaxed whitespace-pre-wrap">
								{getCleanDesc(selectedMemoryToView.memory.description)}
							</p>
						{/if}

						<!-- Media Attachment -->
						{#if selectedMemoryToView.memory.photo_video}
							{#if selectedMemoryToView.memory.photo_video_type === 'video' || (typeof selectedMemoryToView.memory.photo_video === 'string' && (selectedMemoryToView.memory.photo_video.endsWith('.mp4') || selectedMemoryToView.memory.photo_video.endsWith('.webm') || selectedMemoryToView.memory.photo_video.endsWith('.mov')))}
								<div class="relative rounded-2xl overflow-hidden bg-black flex flex-col items-center justify-center">
									<video
										src={getMediaUrl(selectedMemoryToView.memory.photo_video)}
										class="w-full max-h-72 object-contain bg-black rounded-2xl"
										controls
										playsinline
										preload="metadata"
										controlslist="nofullscreen nodownload noremoteplayback"
										disablepictureinpicture
										aria-label="Memory video"
									></video>
									<button
										type="button"
										onclick={() => openFullScreenImage(getMediaUrl(selectedMemoryToView.memory.photo_video), 'video')}
										class="absolute top-3 right-3 bg-[#f43f8e]/90 hover:bg-[#f43f8e] text-white text-[11px] font-black px-2.5 py-1 rounded-xl backdrop-blur-xs flex items-center space-x-1.5 transition-all z-10 shadow-sm active:scale-95 cursor-pointer"
										title="Full view"
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 h-3.5">
											<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
										</svg>
										<span>Full view</span>
									</button>
								</div>
							{:else}
								<div
									class="relative rounded-2xl overflow-hidden border border-pink-100 cursor-pointer group"
									onclick={() => openFullScreenImage(getMediaUrl(selectedMemoryToView.memory.photo_video), 'image')}
								>
									<img src={getMediaUrl(selectedMemoryToView.memory.photo_video)} alt="Memory Attachment" class="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300 rounded-2xl" />
								</div>
							{/if}
						{/if}

						<!-- Custom Themed Pink Pill Music Player -->
						{#if selectedMemoryToView.memory.music}
							<div class="bg-pink-50/90 border border-pink-200/90 rounded-2xl p-3 space-y-2">
								<!-- Header: Music Note Icon + Song Title -->
								<div class="flex items-center space-x-2 min-w-0">
									<div class="w-6 h-6 rounded-full bg-[#f43f8e] text-white flex items-center justify-center flex-shrink-0 shadow-xs">
										<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
											<path d="M19.95 2.1a1 1 0 00-.95.1L8 6.4a1 1 0 00-.8 1V17.5a3.5 3.5 0 102 3.14V11.2l9-3.6v6.9a3.5 3.5 0 102 3.14V3a1 1 0 00-.25-.9z" />
										</svg>
									</div>
									<p class="text-xs font-black text-[#e8367f] truncate" title={getMusicName(selectedMemoryToView.memory.music)}>
										{getMusicName(selectedMemoryToView.memory.music)}
									</p>
								</div>

								<!-- Pill Controls Bar -->
								<div class="bg-white rounded-full px-3 py-1.5 border border-pink-200/80 flex items-center space-x-2 shadow-xs">
									<button
										type="button"
										onclick={toggleAudioPlay}
										class="w-7 h-7 rounded-full bg-[#f43f8e] hover:bg-[#e0337f] text-white flex items-center justify-center flex-shrink-0 shadow-xs active:scale-95 transition-all cursor-pointer"
										title={isAudioPlaying ? 'Pause' : 'Play'}
									>
										{#if isAudioPlaying}
											<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
												<path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 01.75.75v12a.75.75 0 01-1.5 0v-12a.75.75 0 01.75-.75zm10.5 0a.75.75 0 01.75.75v12a.75.75 0 01-1.5 0v-12a.75.75 0 01.75-.75z" clip-rule="evenodd" />
											</svg>
										{:else}
											<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor">
												<path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
											</svg>
										{/if}
									</button>

									<span class="text-[10px] font-black text-pink-600 min-w-[28px] text-right tabular-nums">
										{formatAudioTime(audioCurrentTime)}
									</span>

									<!-- Pink Range Slider Track -->
									<input
										type="range"
										min="0"
										max={audioDuration || 100}
										step="0.1"
										value={audioCurrentTime}
										oninput={handleAudioSeek}
										class="flex-1 h-1.5 bg-pink-100 accent-[#f43f8e] rounded-full cursor-pointer"
									/>

									<span class="text-[10px] font-bold text-pink-400 min-w-[28px] tabular-nums">
										{formatAudioTime(audioDuration)}
									</span>

									<audio
										bind:this={modalAudioElement}
										src={getMusicUrl(selectedMemoryToView.memory.music)}
										preload="metadata"
										onloadedmetadata={(e) => { audioDuration = e.currentTarget.duration || 0; }}
										ontimeupdate={(e) => { audioCurrentTime = e.currentTarget.currentTime || 0; }}
										onended={() => { isAudioPlaying = false; audioCurrentTime = 0; }}
										onplay={() => { isAudioPlaying = true; }}
										onpause={() => { isAudioPlaying = false; }}
										crossorigin="anonymous"
										class="hidden"
									></audio>
								</div>
							</div>
						{/if}

						<!-- Timestamp -->
						<div class="pt-2 border-t border-pink-100/60">
							<span class="text-[11px] text-pink-400 font-bold">
								Created: {formatTime(selectedMemoryToView.memory.created_at || selectedMemoryToView.shared_at)}
							</span>
						</div>
					</div>
				</div>

				<!-- Bottom Action Buttons Footer (Slim & sleek, non-bulky) -->
				<div class="mt-4 pt-3 border-t border-pink-100 flex-shrink-0 grid grid-cols-2 gap-2.5">
					{#if selectedMemoryToView.status === 'accepted'}
						<button
							onclick={(e) => { playClickSound(); goToCalendarDate(selectedMemoryToView.memory.date, e); }}
							class="h-10 py-2 px-3 bg-[#10b981] hover:bg-[#059669] text-white rounded-xl active:scale-95 transition-all duration-200 text-xs font-black flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer whitespace-nowrap"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 h-3.5 flex-shrink-0">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
							</svg>
							<span>Open on Calendar</span>
						</button>

						<button
							onclick={() => { playClickSound(); handleOpenChat(selectedMemoryToView.sender_id, selectedMemoryToView.sender_username); }}
							class="h-10 py-2 px-3 bg-white border-2 border-pink-200 hover:border-pink-300 hover:bg-pink-50 text-[#f43f8e] rounded-xl active:scale-95 transition-all duration-200 text-xs font-black flex items-center justify-center space-x-1.5 cursor-pointer whitespace-nowrap"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 h-3.5 flex-shrink-0">
								<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
							</svg>
							<span>Say Thanks in Chat</span>
						</button>
					{:else}
						<button
							onclick={(e) => { playClickSound(); handleRespondSharedMemory(selectedMemoryToView, 'accept', e); }}
							class="h-10 py-2 px-3 bg-[#f43f8e] hover:bg-[#e0337f] active:scale-95 text-white rounded-xl text-xs font-black transition-all duration-200 flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer whitespace-nowrap"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5 flex-shrink-0">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
							</svg>
							<span>Accept Memory</span>
						</button>

						<button
							onclick={(e) => { playClickSound(); handleRespondSharedMemory(selectedMemoryToView, 'decline', e); }}
							class="h-10 py-2 px-3 bg-white border-2 border-pink-200 hover:bg-rose-50 hover:border-rose-300 text-rose-500 active:scale-95 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center justify-center"
						>
							<span>Decline</span>
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Cancel Shared Memory Confirmation Modal -->
	{#if showCancelModal && cancelConfirmItem}
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in font-sans"
			onclick={() => { if (!isCancelling) showCancelModal = false; }}
		>
			<div
				class="bg-white border border-pink-100 rounded-[32px] p-6 max-w-sm w-full animate-pop-in text-center shadow-2xl"
				onclick={(e) => e.stopPropagation()}
			>
				<div class="w-14 h-14 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-3">
					<svg class="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
						<path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.088 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 00-3.273 0C6.39 3.05 6 3.678 6 4.478v.113a49.488 49.488 0 0012 0v-.113c0-.8-.39-1.428-1.091-1.452a51.196 51.196 0 00-3.273 0zM9.75 9.75a.75.75 0 01.75.75v6.75a.75.75 0 01-1.5 0v-6.75a.75.75 0 01.75-.75zm4.5 0a.75.75 0 01.75.75v6.75a.75.75 0 01-1.5 0v-6.75a.75.75 0 01.75-.75z" clip-rule="evenodd" />
					</svg>
				</div>
				<h3 class="text-lg font-black text-pink-950 mb-1.5">Cancel Shared Memory?</h3>
				<p class="text-xs sm:text-sm text-pink-600 mb-6 font-semibold leading-relaxed">
					Are you sure you want to cancel sharing this memory with <strong class="text-[#f43f8e] font-black">@{cancelConfirmItem.recipient_username}</strong>? This will revoke their access to it.
				</p>
				<div class="flex items-center space-x-3">
					<button
						onclick={() => { playClickSound(); showCancelModal = false; }}
						disabled={isCancelling}
						class="w-1/2 py-3 bg-[#fff0f5] text-[#f43f8e] hover:bg-pink-100 text-xs sm:text-sm font-black rounded-2xl transition-all active:scale-95 cursor-pointer disabled:opacity-50"
					>
						Keep Shared
					</button>
					<button
						onclick={() => { playClickSound(); confirmCancelShare(); }}
						disabled={isCancelling}
						class="w-1/2 py-3 bg-rose-500 hover:bg-rose-600 text-white text-xs sm:text-sm font-black rounded-2xl shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
					>
						{isCancelling ? 'Cancelling...' : 'Cancel Share'}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Full-screen Media Modal Lightbox -->
	{#if showFullScreenImage}
		<div 
			class="fixed inset-0 z-[100] bg-pink-100/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-5 select-none animate-fade-in touch-none overflow-hidden font-sans"
			onclick={(e) => { if (e.target === e.currentTarget) closeFullScreenImage(); }}
		>
			<!-- Header Toolbar -->
			<div class="w-full max-w-5xl mx-auto flex items-center justify-between z-20 flex-shrink-0 pt-1">
				<div class="flex items-center space-x-2">
					<span class="text-xs sm:text-sm font-black text-[#f43f8e] bg-white px-3.5 py-1.5 rounded-full shadow-sm border border-pink-100 flex items-center space-x-2">
						<span class="w-2 h-2 rounded-full bg-[#f43f8e]"></span>
						<span>{fullScreenMediaType === 'video' ? 'Video View' : 'Photo View'}</span>
					</span>
				</div>

				<!-- Close Button -->
				<button
					type="button"
					onclick={() => { playClickSound(); closeFullScreenImage(); }}
					class="p-2 text-pink-700 hover:text-pink-900 bg-white border border-pink-200 rounded-full transition-all cursor-pointer active:scale-95 shadow-sm flex items-center justify-center"
					title="Close Full View"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Media Display Box -->
			<div class="relative overflow-hidden rounded-[32px] border border-pink-200 bg-white/80 max-h-[75vh] sm:max-h-[82vh] flex items-center justify-center select-none p-2 sm:p-4 my-auto w-full max-w-5xl mx-auto shadow-2xl">
				{#if fullScreenMediaType === 'video'}
					<video 
						src={fullScreenImageUrl} 
						class="max-w-full max-h-[72vh] sm:max-h-[78vh] object-contain rounded-2xl" 
						controls 
						autoplay 
						playsinline
						controlslist="nofullscreen nodownload noremoteplayback"
						disablepictureinpicture
					></video>
				{:else}
					<img src={fullScreenImageUrl} alt="Full size" class="max-w-full max-h-[72vh] sm:max-h-[78vh] object-contain rounded-2xl" />
				{/if}
			</div>
		</div>
	{/if}
</div>
