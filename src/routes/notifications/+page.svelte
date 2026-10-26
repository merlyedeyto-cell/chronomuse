<script>
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import { playClickSound } from '$lib/soundEffects.js';
	import { broadcastMemoryEvent, broadcastFriendEvent } from '$lib/realtimeBroadcast.js';
	import AppHeader from '$lib/AppHeader.svelte';
	import AppFooter from '$lib/AppFooter.svelte';
	import {
		ArrowLeft, CheckCircle2, Clock,
		Send, X, Music, Pause, Play, Trash2
	} from 'lucide-svelte';

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

		const handleWindowFocus = () => {
			fetchNotifications(true);
		};

		window.addEventListener('focus', handleWindowFocus);

		// Fallback background polling
		autoSyncNotifsInterval = setInterval(() => {
			if (typeof document !== 'undefined' && document.hidden) return;
			fetchNotifications(true);
		}, 45000);

		return () => {
			window.removeEventListener('focus', handleWindowFocus);
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

	function isVideo(url) {
		if (!url) return false;
		if (typeof url !== 'string') return false;
		const clean = url.split('?')[0].toLowerCase();
		return clean.endsWith('.mp4') || clean.endsWith('.webm') || clean.endsWith('.mov') || clean.endsWith('.mkv') || clean.endsWith('.avi') || url.includes('/video/') || url.startsWith('data:video/');
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
		if (modalAudioElement.paused) {
			modalAudioElement.play().then(() => {
				isAudioPlaying = true;
			}).catch((err) => {
				console.error('Audio play error:', err);
				isAudioPlaying = false;
			});
		} else {
			modalAudioElement.pause();
			isAudioPlaying = false;
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
			modalAudioElement.currentTime = 0;
		}
		isAudioPlaying = false;
		audioCurrentTime = 0;
		audioDuration = 0;
		selectedMemoryToView = item;
		showViewMemoryModal = true;
	}

	function closeViewMemoryModal() {
		playClickSound();
		if (modalAudioElement) {
			modalAudioElement.pause();
			modalAudioElement.currentTime = 0;
		}
		isAudioPlaying = false;
		audioCurrentTime = 0;
		audioDuration = 0;
		showViewMemoryModal = false;
		selectedMemoryToView = null;
	}

	function goToCalendarDate(date, e) {
		if (e) e.stopPropagation();
		closeViewMemoryModal();
		if (!date) return;
		goto(`/dashboard?date=${date}`);
	}

	function handleOpenChat(senderId, senderUsername) {
		closeViewMemoryModal();
		goto(`/chat?friend_id=${senderId}&username=${encodeURIComponent(senderUsername)}`);
	}

	function handleSayThanks(item) {
		closeViewMemoryModal();
		if (!item) return;
		const dateStr = item?.memory?.date || '';
		let formattedDate = dateStr;
		if (dateStr && dateStr.includes('-')) {
			const [y, m, d] = dateStr.split('-');
			const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
			formattedDate = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		}
		const memoryReplyData = {
			sender_id: item.sender_id,
			sender_username: item.sender_username,
			memory_id: item.memory?.id || item.share_id,
			memory_date: formattedDate,
			memory_raw_date: dateStr
		};
		if (typeof window !== 'undefined') {
			sessionStorage.setItem('chronomuse_memory_reply', JSON.stringify(memoryReplyData));
		}
		goto(`/chat?friend_id=${item.sender_id}&username=${encodeURIComponent(item.sender_username)}&memory_reply=1`);
	}

	async function handleRespondSharedMemory(item, action, e) {
		if (e) e.stopPropagation();
		if (!user || !user.id || isResponding) return;
		isResponding = true;

		const backupMemories = [...notifications.shared_memories];

		if (action === 'accept') {
			notifications.shared_memories = notifications.shared_memories.map(m => 
				m.share_id === item.share_id ? { ...m, status: 'accepted' } : m
			);
			showViewMemoryModal = false;
		} else {
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
	<main class="flex-grow container mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8 pb-24 max-w-3xl lg:max-w-4xl xl:max-w-5xl space-y-3.5 sm:space-y-4">
		<!-- Top Header Card (Notifications & Requests + 3-Pill Switcher) -->
		<div class="bg-white rounded-2xl p-3.5 sm:p-4 shadow-xs border border-pink-100/90 animate-fade-in">
			<div class="flex items-center space-x-2 mb-0.5">
				<button
					onclick={() => { playClickSound(); goto('/dashboard'); }}
					class="p-1 -ml-1 text-[#f43f8e] hover:text-[#d0256e] hover:bg-pink-50 rounded-lg transition-all active:scale-95 cursor-pointer"
					title="Back to Dashboard"
				>
					<ArrowLeft class="w-4 h-4" strokeWidth={2.5} />
				</button>
				<h1 class="text-base sm:text-lg font-black text-[#f43f8e] tracking-tight">
					Notifications & Requests
				</h1>
			</div>
			<p class="text-[11px] text-pink-400 font-medium ml-6 leading-tight">
				Accept memory requests to add them to your calendar, or manage notifications
			</p>

			<!-- 3-Pill Tab Switcher Container (Sleek single-line fit) -->
			<div class="mt-3 bg-[#fff0f5] p-1 rounded-xl grid grid-cols-3 gap-1 border border-pink-100/80">
				<!-- Tab 1: Shared Memories -->
				<button
					type="button"
					onclick={() => { playClickSound(); activeTab = 'memories'; }}
					class="py-1.5 px-1 rounded-lg text-[11px] font-black transition-all flex items-center justify-center text-center cursor-pointer active:scale-95 whitespace-nowrap"
					class:bg-[#f43f8e]={activeTab === 'memories'}
					class:text-white={activeTab === 'memories'}
					class:shadow-xs={activeTab === 'memories'}
					class:text-pink-600={activeTab !== 'memories'}
					class:hover:text-pink-800={activeTab !== 'memories'}
				>
					<span>Shared ({totalMemoriesCount})</span>
				</button>

				<!-- Tab 2: Pending Memories -->
				<button
					type="button"
					onclick={() => { playClickSound(); activeTab = 'pending_memories'; }}
					class="py-1.5 px-1 rounded-lg text-[11px] font-black transition-all flex items-center justify-center text-center relative cursor-pointer active:scale-95 whitespace-nowrap"
					class:bg-[#f43f8e]={activeTab === 'pending_memories'}
					class:text-white={activeTab === 'pending_memories'}
					class:shadow-xs={activeTab === 'pending_memories'}
					class:text-pink-600={activeTab !== 'pending_memories'}
					class:hover:text-pink-800={activeTab !== 'pending_memories'}
				>
					<span>Pending ({totalPendingMemoriesCount})</span>
					{#if pendingSharedMemories.length > 0}
						<span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping absolute top-1 right-1.5"></span>
					{/if}
				</button>

				<!-- Tab 3: Shared by You -->
				<button
					type="button"
					onclick={() => { playClickSound(); activeTab = 'sent'; }}
					class="py-1.5 px-1 rounded-lg text-[11px] font-black transition-all flex items-center justify-center text-center cursor-pointer active:scale-95 whitespace-nowrap"
					class:bg-[#f43f8e]={activeTab === 'sent'}
					class:text-white={activeTab === 'sent'}
					class:shadow-xs={activeTab === 'sent'}
					class:text-pink-600={activeTab !== 'sent'}
					class:hover:text-pink-800={activeTab !== 'sent'}
				>
					<span>By You ({totalSentCount})</span>
				</button>
			</div>
		</div>

		<!-- Main Content Display -->
		{#if isLoading && !hasLoadedOnce}
			<div class="space-y-2.5 animate-pulse">
				{#each Array(4) as _}
					<div class="bg-white rounded-2xl p-4 border border-pink-100 flex items-center justify-between gap-3 shadow-2xs">
						<div class="flex items-center space-x-3 min-w-0 flex-1">
							<div class="w-10 h-10 rounded-full bg-pink-200/70 flex-shrink-0"></div>
							<div class="space-y-1.5 flex-1">
								<div class="h-3.5 bg-pink-200/70 rounded w-3/4"></div>
								<div class="h-2.5 bg-pink-200/50 rounded w-1/2"></div>
							</div>
						</div>
						<div class="h-7 w-20 bg-pink-100/80 rounded-xl flex-shrink-0"></div>
					</div>
				{/each}
			</div>
		{:else if activeTab === 'memories'}
			<!-- Tab 1: Shared Memories (Saved on Calendar) -->
			{#if acceptedSharedMemories.length === 0}
				<div class="bg-white rounded-2xl p-8 text-center shadow-xs border border-pink-100/90 animate-fade-in">
					<div class="w-12 h-12 rounded-full bg-pink-50 flex items-center justify-center mx-auto mb-2.5 text-pink-300">
						<CheckCircle2 class="w-6 h-6" />
					</div>
					<h2 class="text-sm font-black text-[#f43f8e] mb-0.5">No Shared Memories Yet</h2>
					<p class="text-[11px] text-pink-400 font-medium max-w-xs mx-auto leading-relaxed">
						Memories that you accept from friends will be saved on your calendar and appear here.
					</p>
				</div>
			{:else}
				<div class="bg-white rounded-2xl p-3.5 sm:p-4 shadow-xs border border-pink-100/90 animate-fade-in">
					<!-- Section Title Header -->
					<div class="text-[11px] font-black text-[#f43f8e] uppercase tracking-wider mb-3">
						<span>SAVED ON CALENDAR ({acceptedSharedMemories.length})</span>
					</div>

					<div class="space-y-2.5">
						{#each acceptedSharedMemories as item (item.share_id)}
							<div
								role="button"
								tabindex="0"
								onclick={(e) => { playClickSound(); handleCardClick(item, e); }}
								onkeydown={(e) => { if (e.key === 'Enter') { playClickSound(); handleCardClick(item, e); } }}
								class="bg-white rounded-xl p-3 border border-pink-100 shadow-xs hover:border-pink-200 transition-all duration-200 cursor-pointer space-y-2 group"
							>
								<div class="flex items-center justify-between gap-2.5">
									<div class="flex items-center space-x-2.5 min-w-0">
										<!-- Avatar -->
										<button
											type="button"
											onclick={(e) => { e.stopPropagation(); playClickSound(); goto(`/profile?id=${item.sender_id}`); }}
											class="w-9 h-9 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 overflow-hidden text-pink-500 font-black text-sm group-hover:scale-105 transition-transform cursor-pointer"
											title="View @{item.sender_username}'s Profile"
										>
											{#if item.sender_avatar_url}
												<img src={item.sender_avatar_url} alt={item.sender_username} class="w-full h-full object-cover" />
											{:else}
												{(item.sender_username || 'U').charAt(0).toUpperCase()}
											{/if}
										</button>

										<div class="min-w-0 flex-grow">
											<div class="flex items-center gap-1.5 flex-wrap">
												<button
													type="button"
													onclick={(e) => { e.stopPropagation(); playClickSound(); goto(`/profile?id=${item.sender_id}`); }}
													class="text-xs font-black text-[#e8367f] group-hover:text-[#d0256e] hover:underline cursor-pointer"
												>
													@{item.sender_username}
												</button>
												<span class="bg-pink-50 text-[#f43f8e] border border-pink-200 text-[10px] font-black px-2 py-0.5 rounded-full inline-flex items-center space-x-1">
													<span>Saved to Calendar</span>
												</span>
												{#if item.memory.mood_tag}
													<span class="bg-amber-50 text-amber-600 border border-amber-200 text-[10px] font-black px-2 py-0.5 rounded-full">
														{item.memory.mood_tag}
													</span>
												{/if}
											</div>
											<p class="text-[11px] font-bold text-pink-950/80 mt-0.5 truncate">
												{getMemoryDisplayTitle(item.memory)}
												<span class="text-pink-400 font-normal ml-1">• {formatDate(item.memory.date)}</span>
											</p>
										</div>
									</div>
								</div>

								<!-- Bottom Action Row -->
								<div class="flex items-center justify-between pt-1.5 border-t border-pink-50">
									<div class="text-[10px] text-pink-400 font-bold whitespace-nowrap">
										<span>Tap to preview details</span>
									</div>

									<button
										type="button"
										onclick={(e) => { e.stopPropagation(); playClickSound(); goToCalendarDate(item.memory.date, e); }}
										class="h-7.5 py-1 px-3 bg-[#f43f8e] hover:bg-[#e0337f] text-white font-black text-[11px] rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer whitespace-nowrap"
									>
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
				<div class="bg-white rounded-2xl p-8 text-center shadow-xs border border-pink-100/90 animate-fade-in">
					<div class="w-12 h-12 rounded-full bg-pink-50 flex items-center justify-center mx-auto mb-2.5 text-pink-300">
						<Clock class="w-6 h-6" />
					</div>
					<h2 class="text-sm font-black text-[#f43f8e] mb-0.5">No Pending Memories</h2>
					<p class="text-[11px] text-pink-400 font-medium max-w-xs mx-auto leading-relaxed">
						When friends share memories with you, they will appear here so you can accept them to add to your calendar.
					</p>
				</div>
			{:else}
				<div class="bg-white rounded-2xl p-3.5 sm:p-4 shadow-xs border border-pink-100/90 animate-fade-in">
					<div class="text-[11px] font-black text-[#f43f8e] uppercase tracking-wider mb-3">
						<span>ACTION REQUIRED: PENDING ({pendingSharedMemories.length})</span>
					</div>

					<div class="space-y-2.5">
						{#each pendingSharedMemories as item (item.share_id)}
							<div
								role="button"
								tabindex="0"
								onclick={(e) => { playClickSound(); handleCardClick(item, e); }}
								onkeydown={(e) => { if (e.key === 'Enter') { playClickSound(); handleCardClick(item, e); } }}
								class="bg-white rounded-xl p-3 border border-pink-100 shadow-xs hover:border-pink-200 transition-all duration-200 cursor-pointer space-y-2 group"
							>
								<div class="flex items-center justify-between gap-2.5">
									<div class="flex items-center space-x-2.5 min-w-0">
										<button
											type="button"
											onclick={(e) => { e.stopPropagation(); playClickSound(); goto(`/profile?id=${item.sender_id}`); }}
											class="w-9 h-9 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 overflow-hidden text-pink-500 font-black text-sm group-hover:scale-105 transition-transform cursor-pointer"
											title="View @{item.sender_username}'s Profile"
										>
											{#if item.sender_avatar_url}
												<img src={item.sender_avatar_url} alt={item.sender_username} class="w-full h-full object-cover" />
											{:else}
												{(item.sender_username || 'U').charAt(0).toUpperCase()}
											{/if}
										</button>

										<div class="min-w-0 flex-grow">
											<div class="flex items-center gap-1.5 flex-wrap">
												<button
													type="button"
													onclick={(e) => { e.stopPropagation(); playClickSound(); goto(`/profile?id=${item.sender_id}`); }}
													class="text-xs font-black text-[#e8367f] group-hover:text-[#d0256e] hover:underline cursor-pointer"
												>
													@{item.sender_username}
												</button>
												<span class="bg-pink-50 text-pink-500 border border-pink-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
													Shared a memory
												</span>
												{#if item.memory.mood_tag}
													<span class="bg-amber-50 text-amber-600 border border-amber-200 text-[10px] font-black px-2 py-0.5 rounded-full">
														{item.memory.mood_tag}
													</span>
												{/if}
											</div>
											<p class="text-[11px] font-bold text-pink-950/80 mt-0.5 truncate">
												{getMemoryDisplayTitle(item.memory)}
												<span class="text-pink-400 font-normal ml-1">• {formatDate(item.memory.date)}</span>
											</p>
										</div>
									</div>
								</div>

								<!-- Bottom Row: Tap to Preview & Accept / Decline -->
								<div class="flex items-center justify-between pt-1.5 border-t border-pink-50">
									<div class="text-[10px] text-pink-400 font-bold whitespace-nowrap">
										<span>Tap to preview</span>
									</div>

									<div class="flex items-center space-x-1.5">
										<button
											type="button"
											onclick={(e) => { e.stopPropagation(); playClickSound(); handleRespondSharedMemory(item, 'accept', e); }}
											class="h-7.5 py-1 px-2.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white font-black text-[11px] rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer whitespace-nowrap"
										>
											Accept
										</button>

										<button
											type="button"
											onclick={(e) => { e.stopPropagation(); playClickSound(); handleRespondSharedMemory(item, 'decline', e); }}
											class="h-7.5 py-1 px-2.5 bg-white border border-pink-200 hover:bg-rose-50 hover:border-rose-200 text-rose-500 font-black text-[11px] rounded-xl active:scale-95 transition-all cursor-pointer whitespace-nowrap"
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
				<div class="bg-white rounded-2xl p-8 text-center shadow-xs border border-pink-100/90 animate-fade-in">
					<div class="w-12 h-12 rounded-full bg-pink-50 flex items-center justify-center mx-auto mb-2.5 text-pink-300">
						<Send class="w-6 h-6" strokeWidth={2} />
					</div>
					<h2 class="text-sm font-black text-[#f43f8e] mb-0.5">No Memories Shared Yet</h2>
					<p class="text-[11px] text-pink-400 font-medium max-w-xs mx-auto leading-relaxed">
						When you share memories with your friends, they will appear here. You can cancel or unshare them anytime!
					</p>
				</div>
			{:else}
				<div class="bg-white rounded-2xl p-3.5 sm:p-4 shadow-xs border border-pink-100/90 animate-fade-in">
					<div class="mb-3">
						<div class="text-[11px] font-black text-[#f43f8e] uppercase tracking-wider">
							<span>YOUR SHARED MEMORIES ({sentSharedMemories.length})</span>
						</div>
						<p class="text-[11px] text-pink-400 font-medium mt-0.5">You can cancel or unshare anytime</p>
					</div>

					<div class="space-y-2.5">
						{#each sentSharedMemories as item (item.share_id)}
							<div
								role="button"
								tabindex="0"
								onclick={(e) => { playClickSound(); handleCardClick(item, e); }}
								onkeydown={(e) => { if (e.key === 'Enter') { playClickSound(); handleCardClick(item, e); } }}
								class="bg-white rounded-xl p-3 border border-pink-100 shadow-xs hover:border-pink-200 transition-all duration-200 cursor-pointer space-y-2 group"
							>
								<div class="flex items-center justify-between gap-2.5">
									<div class="flex items-center space-x-2.5 min-w-0">
										<!-- Recipient Avatar -->
										<button
											type="button"
											onclick={(e) => { e.stopPropagation(); playClickSound(); goto(`/profile?id=${item.recipient_id}`); }}
											class="w-9 h-9 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 overflow-hidden text-pink-500 font-black text-sm group-hover:scale-105 transition-transform cursor-pointer"
											title="View @{item.recipient_username}'s Profile"
										>
											{#if item.recipient_avatar_url}
												<img src={item.recipient_avatar_url} alt={item.recipient_username} class="w-full h-full object-cover" />
											{:else}
												{(item.recipient_username || 'U').charAt(0).toUpperCase()}
											{/if}
										</button>

										<div class="min-w-0 flex-grow">
											<div class="flex items-center gap-1.5 flex-wrap">
												<span class="text-xs font-black text-[#e8367f] group-hover:text-[#d0256e]">
													Shared with @{item.recipient_username}
												</span>
												{#if item.status === 'accepted'}
													<span class="bg-pink-50 text-[#f43f8e] border border-pink-200 text-[10px] font-black px-2 py-0.5 rounded-full inline-flex items-center space-x-1">
														<span>Accepted</span>
													</span>
												{:else}
													<span class="bg-amber-50 text-amber-600 border border-amber-200 text-[10px] font-black px-2 py-0.5 rounded-full inline-flex items-center space-x-1">
														<span>Pending</span>
													</span>
												{/if}
												{#if item.memory.mood_tag}
													<span class="bg-amber-50 text-amber-600 border border-amber-200 text-[10px] font-black px-2 py-0.5 rounded-full">
														{item.memory.mood_tag}
													</span>
												{/if}
											</div>
											<p class="text-[11px] font-bold text-pink-950/80 mt-0.5 truncate">
												{getMemoryDisplayTitle(item.memory)}
												<span class="text-pink-400 font-normal ml-1">• {formatDate(item.memory.date)}</span>
											</p>
										</div>
									</div>
								</div>

								<!-- Bottom Row: Tap to Preview & Cancel Share -->
								<div class="flex items-center justify-between pt-1.5 border-t border-pink-50">
									<div class="text-[10px] text-pink-400 font-bold whitespace-nowrap">
										<span>Tap to preview</span>
										{#if item.shared_at}
											<span class="text-pink-300">• {formatTimeAgo(item.shared_at)}</span>
										{/if}
									</div>

									<button
										type="button"
										onclick={(e) => { e.stopPropagation(); playClickSound(); promptCancelShare(item, e); }}
										class="h-7.5 py-1 px-3 bg-white border border-pink-200 hover:border-pink-300 text-[#f43f8e] hover:bg-pink-50 font-black text-[11px] rounded-xl active:scale-95 transition-all cursor-pointer whitespace-nowrap"
									>
										Cancel Share
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

	<!-- View Memories Preview Modal (Slim & proportionate) -->
	{#if showViewMemoryModal && selectedMemoryToView}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans"
			onclick={(e) => { if (e.target === e.currentTarget) closeViewMemoryModal(); }}
		>
			<div
				class="bg-white border border-pink-100 rounded-2xl p-4 sm:p-5 shadow-2xl relative max-w-xs sm:max-w-sm w-full max-h-[88vh] overflow-hidden flex flex-col animate-pop-in"
				onclick={(e) => e.stopPropagation()}
			>
				<!-- Close Button -->
				<button
					onclick={closeViewMemoryModal}
					class="absolute top-3.5 right-3.5 p-1 text-pink-400 hover:text-pink-600 hover:bg-pink-50 rounded-full transition-all cursor-pointer"
					title="Close"
				>
					<X class="w-4 h-4" strokeWidth={2.5} />
				</button>

				<!-- Header -->
				<div class="text-center mb-3">
					<h2 class="text-base font-black text-[#f43f8e]">View Memories</h2>
					<p class="text-[11px] text-pink-400 font-medium mt-0.5">Your special moments on this date</p>
				</div>

				<!-- Selected Date Pill Banner -->
				<div class="mb-3 p-2.5 bg-[#f43f8e] rounded-xl text-white shadow-xs flex-shrink-0">
					<div>
						<p class="text-[9px] text-pink-100 uppercase tracking-wider font-extrabold">Selected Date</p>
						<p class="text-xs font-black">{formatFullDate(selectedMemoryToView.memory.date)}</p>
					</div>
				</div>

				<!-- Memory Detail Scrollable Card -->
				<div class="flex-1 overflow-y-auto pr-1 -mr-1 space-y-2.5">
					<div class="p-3 bg-pink-50/30 border border-pink-100 rounded-xl space-y-2">
						<!-- Shared by Pill Badge & Mood Tag -->
						<div class="flex items-center justify-between gap-1.5">
							<div class="flex items-center flex-wrap gap-1">
								<span class="text-[10px] px-2.5 py-0.5 rounded-full bg-pink-100/70 text-[#f43f8e] font-black inline-flex items-center">
									<span>{selectedMemoryToView.sender_username ? `Shared by @${selectedMemoryToView.sender_username}` : `Shared with @${selectedMemoryToView.recipient_username}`}</span>
								</span>

								{#if selectedMemoryToView.memory.mood_tag}
									<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 font-black">
										{selectedMemoryToView.memory.mood_tag}
									</span>
								{/if}

								{#if selectedMemoryToView.memory.memory_tag && selectedMemoryToView.memory.memory_tag !== 'Untitled Memory' && selectedMemoryToView.memory.memory_tag !== 'Special Memory' && !selectedMemoryToView.memory.memory_tag.startsWith('Shared memory from')}
									<span class="text-[10px] px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200 font-black">
										{selectedMemoryToView.memory.memory_tag}
									</span>
								{/if}
							</div>
						</div>

						<!-- Custom Title only if user provided a specific title (e.g. "bshw") -->
						{#if selectedMemoryToView.memory.title && selectedMemoryToView.memory.title !== 'Untitled Memory' && selectedMemoryToView.memory.title !== 'Special Memory' && selectedMemoryToView.memory.title !== selectedMemoryToView.memory.memory_tag}
							<h3 class="text-sm font-black text-pink-950">
								{selectedMemoryToView.memory.title}
							</h3>
						{/if}

						<!-- Description -->
						{#if selectedMemoryToView.memory.description}
							<p class="text-[11px] sm:text-xs font-semibold text-pink-900/90 leading-relaxed whitespace-pre-wrap">
								{getCleanDesc(selectedMemoryToView.memory.description)}
							</p>
						{/if}

						<!-- Media Attachment -->
						{#if selectedMemoryToView.memory.photo_video}
							{#if isVideo(selectedMemoryToView.memory.photo_video)}
								<div class="rounded-xl overflow-hidden border border-pink-200/80 bg-black/5 shadow-xs">
									<!-- svelte-ignore a11y_media_has_caption -->
									<video src={getMediaUrl(selectedMemoryToView.memory.photo_video)} controls class="w-full max-h-48 object-contain rounded-xl"></video>
								</div>
							{:else}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div 
									class="rounded-xl overflow-hidden border border-pink-200/80 shadow-xs cursor-pointer group"
									onclick={() => openFullScreenImage(getMediaUrl(selectedMemoryToView.memory.photo_video), 'image')}
								>
									<img src={getMediaUrl(selectedMemoryToView.memory.photo_video)} alt="Memory Attachment" class="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300 rounded-xl" />
								</div>
							{/if}
						{/if}

						<!-- Custom Themed Pink Pill Music Player -->
						{#if selectedMemoryToView.memory.music}
							<div class="bg-pink-50/90 border border-pink-200/90 rounded-xl p-2.5 space-y-1.5">
								<div class="flex items-center space-x-1.5 min-w-0">
									<div class="w-5 h-5 rounded-full bg-[#f43f8e] text-white flex items-center justify-center flex-shrink-0 shadow-xs">
										<Music class="w-2.5 h-2.5" />
									</div>
									<p class="text-[11px] font-black text-[#e8367f] truncate" title={getMusicName(selectedMemoryToView.memory.music)}>
										{getMusicName(selectedMemoryToView.memory.music)}
									</p>
								</div>

								<div class="bg-white rounded-full px-2.5 py-1 border border-pink-200/80 flex items-center space-x-1.5 shadow-xs">
									<button
										type="button"
										onclick={toggleAudioPlay}
										class="w-6 h-6 rounded-full bg-[#f43f8e] hover:bg-[#e0337f] text-white flex items-center justify-center flex-shrink-0 shadow-xs active:scale-95 transition-all cursor-pointer"
										title={isAudioPlaying ? 'Pause' : 'Play'}
									>
										{#if isAudioPlaying}
											<Pause class="w-3 h-3 fill-current" />
										{:else}
											<Play class="w-3 h-3 translate-x-0.5 fill-current" />
										{/if}
									</button>

									<span class="text-[9px] font-black text-pink-600 min-w-[24px] text-right tabular-nums">
										{formatAudioTime(audioCurrentTime)}
									</span>

									<input
										type="range"
										min="0"
										max={audioDuration || 100}
										step="0.1"
										value={audioCurrentTime}
										oninput={handleAudioSeek}
										class="flex-1 h-1 bg-pink-100 accent-[#f43f8e] rounded-full cursor-pointer"
									/>

									<span class="text-[9px] font-bold text-pink-400 min-w-[24px] tabular-nums">
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
										onerror={() => { isAudioPlaying = false; }}
										crossorigin="anonymous"
										class="hidden"
									></audio>
								</div>
							</div>
						{/if}

						<!-- Timestamp -->
						<div class="pt-1.5 border-t border-pink-100/60">
							<span class="text-[10px] text-pink-400 font-bold">
								Created: {formatTime(selectedMemoryToView.memory.created_at || selectedMemoryToView.shared_at)}
							</span>
						</div>
					</div>
				</div>

				<!-- Bottom Action Buttons Footer (Slim & sleek) -->
				<div class="mt-3 pt-2.5 border-t border-pink-100 flex-shrink-0 grid grid-cols-2 gap-2">
					{#if selectedMemoryToView.status === 'accepted'}
						<button
							onclick={(e) => { playClickSound(); goToCalendarDate(selectedMemoryToView.memory.date, e); }}
							class="h-8 py-1.5 px-3 bg-[#10b981] hover:bg-[#059669] text-white rounded-xl active:scale-95 transition-all duration-200 text-[11px] font-black shadow-xs cursor-pointer whitespace-nowrap text-center"
						>
							<span>Open on Calendar</span>
						</button>

						<button
							onclick={() => { playClickSound(); handleSayThanks(selectedMemoryToView); }}
							class="h-8 py-1.5 px-3 bg-white border border-pink-200 hover:border-pink-300 hover:bg-pink-50 text-[#f43f8e] rounded-xl active:scale-95 transition-all duration-200 text-[11px] font-black cursor-pointer whitespace-nowrap text-center"
						>
							<span>Say Thanks</span>
						</button>
					{:else}
						<button
							onclick={(e) => { playClickSound(); handleRespondSharedMemory(selectedMemoryToView, 'accept', e); }}
							class="h-8 py-1.5 px-3 bg-[#f43f8e] hover:bg-[#e0337f] active:scale-95 text-white rounded-xl text-[11px] font-black transition-all duration-200 shadow-xs cursor-pointer whitespace-nowrap"
						>
							Accept
						</button>

						<button
							onclick={(e) => { playClickSound(); handleRespondSharedMemory(selectedMemoryToView, 'decline', e); }}
							class="h-8 py-1.5 px-2.5 bg-white border border-pink-200 hover:bg-rose-50 hover:border-rose-300 text-rose-500 active:scale-95 rounded-xl text-[11px] font-black transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center justify-center"
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
			role="dialog"
			aria-modal="true"
			aria-labelledby="cancel-shared-title"
			tabindex="-1"
			onkeydown={(e) => { if (e.key === 'Escape' && !isCancelling) showCancelModal = false; }}
			class="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in font-sans"
			onclick={(e) => { if (e.target === e.currentTarget && !isCancelling) showCancelModal = false; }}
		>
			<div class="bg-white border border-pink-100 rounded-2xl p-5 max-w-xs w-full animate-pop-in text-center shadow-2xl">
				<div class="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-2.5">
					<Trash2 class="w-6 h-6" />
				</div>
				<h3 id="cancel-shared-title" class="text-base font-black text-pink-950 mb-1">Cancel Shared Memory?</h3>
				<p class="text-xs text-pink-600 mb-5 font-semibold leading-relaxed">
					Are you sure you want to cancel sharing this memory with <strong class="text-[#f43f8e] font-black">@{cancelConfirmItem.recipient_username}</strong>?
				</p>
				<div class="flex items-center space-x-2.5">
					<button
						type="button"
						onclick={() => { playClickSound(); showCancelModal = false; }}
						disabled={isCancelling}
						class="w-1/2 py-2.5 bg-[#fff0f5] text-[#f43f8e] hover:bg-pink-100 text-xs font-black rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50"
					>
						Keep
					</button>
					<button
						type="button"
						onclick={() => { playClickSound(); confirmCancelShare(); }}
						disabled={isCancelling}
						class="w-1/2 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-black rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
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
			role="dialog"
			aria-modal="true"
			aria-label="Media preview"
			tabindex="-1"
			onkeydown={(e) => { if (e.key === 'Escape') closeFullScreenImage(); }}
			class="fixed inset-0 z-[100] bg-pink-100/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-4 select-none animate-fade-in touch-none overflow-hidden font-sans"
			onclick={(e) => { if (e.target === e.currentTarget) closeFullScreenImage(); }}
		>
			<!-- Header Toolbar -->
			<div class="w-full max-w-4xl mx-auto flex items-center justify-between z-20 flex-shrink-0 pt-1">
				<div class="flex items-center space-x-2">
					<span class="text-xs font-black text-[#f43f8e] bg-white px-3 py-1 rounded-full shadow-xs border border-pink-100 flex items-center space-x-1.5">
						<span class="w-2 h-2 rounded-full bg-[#f43f8e]"></span>
						<span>{fullScreenMediaType === 'video' ? 'Video View' : 'Photo View'}</span>
					</span>
				</div>

				<!-- Close Button -->
				<button
					type="button"
					aria-label="Close full preview"
					onclick={() => { playClickSound(); closeFullScreenImage(); }}
					class="p-1.5 text-pink-700 hover:text-pink-900 bg-white border border-pink-200 rounded-full transition-all cursor-pointer active:scale-95 shadow-xs flex items-center justify-center"
					title="Close Full View"
				>
					<X class="w-4 h-4" strokeWidth={2.5} />
				</button>
			</div>

			<!-- Media Display Box -->
			<div class="relative overflow-hidden rounded-2xl border border-pink-200 bg-white/80 max-h-[75vh] sm:max-h-[82vh] flex items-center justify-center select-none p-2 sm:p-3 my-auto w-full max-w-4xl mx-auto shadow-xl">
				{#if fullScreenMediaType === 'video'}
					<video 
						src={fullScreenImageUrl} 
						class="max-w-full max-h-[72vh] sm:max-h-[78vh] object-contain rounded-xl" 
						controls 
						autoplay 
						playsinline
						controlslist="nofullscreen nodownload noremoteplayback"
						disablepictureinpicture
					>
						<track kind="captions" />
					</video>
				{:else}
					<img src={fullScreenImageUrl} alt="Full size" class="max-w-full max-h-[72vh] sm:max-h-[78vh] object-contain rounded-xl" />
				{/if}
			</div>
		</div>
	{/if}
</div>
