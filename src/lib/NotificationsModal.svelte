<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { goto } from '$app/navigation';

	const dispatch = createEventDispatcher();
	let { isOpen = $bindable(false), userId = null } = $props();

	let notifications = $state({
		shared_memories: [],
		sent_shared_memories: [],
		incoming_requests: [],
		total_notifications_count: 0
	});
	let isLoading = $state(false);
	let isCancelling = $state(false);
	let isResponding = $state(false);
	let activeTab = $state('pending_memories'); // 'memories', 'pending_memories', 'sent'

	let pendingSharedMemories = $derived((notifications.shared_memories || []).filter(m => m.status !== 'accepted'));
	let acceptedSharedMemories = $derived((notifications.shared_memories || []).filter(m => m.status === 'accepted'));
	let sentSharedMemories = $derived(notifications.sent_shared_memories || []);

	let totalPendingMemoriesCount = $derived(pendingSharedMemories.length);
	let totalMemoriesCount = $derived(acceptedSharedMemories.length);
	let totalSentCount = $derived(sentSharedMemories.length);

	function closeModal() {
		isOpen = false;
		dispatch('close');
	}

	async function fetchNotifications(isSilent = false) {
		if (!userId) return;
		if (!isSilent && notifications.shared_memories.length === 0 && notifications.sent_shared_memories.length === 0 && notifications.incoming_requests.length === 0) {
			isLoading = true;
		}
		try {
			const res = await fetch(API_ENDPOINTS.getNotifications, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: userId })
			});
			const data = await res.json();
			if (data.success && data.data) {
				notifications = data.data;
				if (!isSilent) {
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
			console.error('Error fetching notifications:', err);
		} finally {
			isLoading = false;
		}
	}

	async function handleRespondRequest(requestId, action) {
		if (!userId || isResponding) return;
		isResponding = true;

		// Optimistic removal
		const backupReqs = [...notifications.incoming_requests];
		notifications.incoming_requests = notifications.incoming_requests.filter(r => r.request_id !== requestId);
		notifications.total_notifications_count = Math.max(0, notifications.total_notifications_count - 1);

		try {
			const res = await fetch(API_ENDPOINTS.respondToFriendRequest, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					request_id: requestId,
					action,
					user_id: userId
				})
			});
			const data = await res.json();
			if (!data.success) {
				notifications.incoming_requests = backupReqs;
			} else {
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new Event('chronomuse_friend_change'));
					window.dispatchEvent(new Event('chronomuse_notification_change'));
				}
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
		if (!userId || isResponding) return;
		isResponding = true;

		const backupMemories = [...notifications.shared_memories];

		if (action === 'accept') {
			// Update status in place to 'accepted' so it moves to Shared Memories
			notifications.shared_memories = notifications.shared_memories.map(m => 
				m.share_id === item.share_id ? { ...m, status: 'accepted' } : m
			);
		} else {
			// Decline removes it
			notifications.shared_memories = notifications.shared_memories.filter(m => m.share_id !== item.share_id);
			notifications.total_notifications_count = Math.max(0, notifications.total_notifications_count - 1);
		}

		try {
			const res = await fetch(API_ENDPOINTS.respondToSharedMemory, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					share_id: item.share_id,
					memory_id: item.memory?.id,
					user_id: userId,
					action
				})
			});
			const data = await res.json();
			if (!data.success) {
				notifications.shared_memories = backupMemories;
			} else {
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new Event('chronomuse_notification_change'));
					window.dispatchEvent(new Event('chronomuse_memory_change'));
				}
			}
		} catch (err) {
			notifications.shared_memories = backupMemories;
			console.error('Error responding to shared memory:', err);
		} finally {
			isResponding = false;
		}
	}

	let showCancelConfirmModal = $state(false);
	let cancelItemTarget = $state(null);

	function promptCancelShare(item, e) {
		if (e) e.stopPropagation();
		cancelItemTarget = item;
		showCancelConfirmModal = true;
	}

	async function confirmCancelShare() {
		if (!userId || !cancelItemTarget || isCancelling) return;
		const item = cancelItemTarget;
		isCancelling = true;
		const backupSent = [...(notifications.sent_shared_memories || [])];
		notifications.sent_shared_memories = (notifications.sent_shared_memories || []).filter(m => m.share_id !== item.share_id);
		showCancelConfirmModal = false;

		import('$lib/realtimeBroadcast.js').then(({ broadcastMemoryEvent }) => {
			broadcastMemoryEvent(userId, item.recipient_id, 'shared_memory_cancelled', item.memory);
		}).catch(() => {});

		try {
			const res = await fetch(API_ENDPOINTS.cancelSharedMemory, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					share_id: item.share_id,
					user_id: userId
				})
			});
			const data = await res.json();
			if (!data.success) {
				notifications.sent_shared_memories = backupSent;
			} else {
				import('$lib/realtimeBroadcast.js').then(({ broadcastMemoryEvent }) => {
					broadcastMemoryEvent(userId, item.recipient_id, 'shared_memory_cancelled', item.memory);
				}).catch(() => {});
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new Event('chronomuse_notification_change'));
					window.dispatchEvent(new Event('chronomuse_memory_change'));
				}
			}
		} catch (err) {
			notifications.sent_shared_memories = backupSent;
		} finally {
			isCancelling = false;
			cancelItemTarget = null;
		}
	}

	function formatDate(dateStr) {
		if (!dateStr) return '';
		const d = new Date(dateStr);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

	function getMoodColor(mood) {
		const colors = {
			'Happy': 'bg-yellow-400 text-yellow-900 border-yellow-300',
			'Sad': 'bg-blue-400 text-blue-900 border-blue-300',
			'Excited': 'bg-orange-400 text-white border-orange-300',
			'Angry': 'bg-red-400 text-white border-red-300',
			'Calm': 'bg-green-400 text-green-900 border-green-300',
			'Anxious': 'bg-purple-400 text-white border-purple-300',
			'Grateful': 'bg-pink-400 text-white border-pink-300',
			'Lonely': 'bg-gray-400 text-white border-gray-300',
			'Love': 'bg-rose-400 text-white border-rose-300',
			'Neutral': 'bg-slate-400 text-white border-slate-300'
		};
		return colors[mood] || 'bg-pink-400 text-white border-pink-300';
	}

	function handleOpenChat(senderId, senderUsername) {
		closeModal();
		goto(`/chat?friend_id=${senderId}&username=${encodeURIComponent(senderUsername)}`);
	}

	function handleViewFriends() {
		closeModal();
		goto('/friends');
	}

	onMount(() => {
		fetchNotifications();

		const handleRealtimeNotifs = () => {
			if (userId) {
				fetchNotifications(true);
			}
		};

		window.addEventListener('chronomuse_notification_change', handleRealtimeNotifs);
		window.addEventListener('chronomuse_friend_change', handleRealtimeNotifs);
		window.addEventListener('chronomuse_memory_change', handleRealtimeNotifs);

		return () => {
			window.removeEventListener('chronomuse_notification_change', handleRealtimeNotifs);
			window.removeEventListener('chronomuse_friend_change', handleRealtimeNotifs);
			window.removeEventListener('chronomuse_memory_change', handleRealtimeNotifs);
		};
	});

	$effect(() => {
		if (isOpen) {
			const hasData = (notifications.shared_memories?.length > 0 || notifications.sent_shared_memories?.length > 0 || notifications.incoming_requests?.length > 0);
			fetchNotifications(hasData);
		}
	});
</script>

{#if isOpen}
	<div
		class="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
	>
		<div class="bg-white/95 backdrop-blur-md border-2 border-pink-300 rounded-3xl shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-pop-in">
			<!-- Header -->
			<div class="p-4 sm:p-5 border-b border-pink-200 bg-gradient-to-r from-pink-500 to-rose-500 text-white flex items-center justify-between">
				<div class="flex items-center space-x-2.5">
					<div class="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
						</svg>
					</div>
					<div>
						<h2 class="text-base sm:text-lg font-bold">Notifications & Shared Memories</h2>
						<p class="text-xs text-pink-100">Memories shared by your friends and updates</p>
					</div>
				</div>

				<button
					onclick={closeModal}
					class="p-1.5 rounded-xl hover:bg-white/20 text-white transition-colors cursor-pointer"
					aria-label="Close"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Filter Tabs -->
			<div class="p-3 bg-pink-50 border-b border-pink-200 flex items-center space-x-1.5 text-xs font-semibold">
				<button
					onclick={() => activeTab = 'memories'}
					class="px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer"
					class:bg-pink-500={activeTab === 'memories'}
					class:text-white={activeTab === 'memories'}
					class:text-pink-600={activeTab !== 'memories'}
					class:hover:bg-pink-100={activeTab !== 'memories'}
				>
					Shared Memories ({totalMemoriesCount})
				</button>
				<button
					onclick={() => activeTab = 'pending_memories'}
					class="px-2.5 sm:px-3 py-1.5 rounded-lg transition-all relative cursor-pointer"
					class:bg-pink-500={activeTab === 'pending_memories'}
					class:text-white={activeTab === 'pending_memories'}
					class:text-pink-600={activeTab !== 'pending_memories'}
					class:hover:bg-pink-100={activeTab !== 'pending_memories'}
				>
					Pending Memories ({totalPendingMemoriesCount})
					{#if pendingSharedMemories.length > 0}
						<span class="w-2 h-2 rounded-full bg-rose-500 animate-ping absolute -top-0.5 -right-0.5"></span>
					{/if}
				</button>
				<button
					onclick={() => activeTab = 'sent'}
					class="px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer"
					class:bg-pink-500={activeTab === 'sent'}
					class:text-white={activeTab === 'sent'}
					class:text-pink-600={activeTab !== 'sent'}
					class:hover:bg-pink-100={activeTab !== 'sent'}
				>
					Shared by You ({totalSentCount})
				</button>
			</div>

			<!-- Content List -->
			<div class="p-4 overflow-y-auto space-y-3 flex-1 scrollbar-thin">
				{#if isLoading}
					<div class="py-12 text-center">
						<div class="animate-spin h-7 w-7 text-pink-500 mx-auto mb-2 border-3 border-pink-200 border-t-pink-500 rounded-full"></div>
						<p class="text-xs text-pink-400 font-medium">Loading notifications...</p>
					</div>
				{:else if activeTab === 'memories'}
					<!-- Accepted Shared Memories -->
					{#if acceptedSharedMemories.length === 0}
						<div class="py-10 text-center">
							<div class="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-2.5 text-pink-400">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
							</div>
							<p class="text-sm font-bold text-pink-700">No shared memories yet</p>
							<p class="text-xs text-pink-400 mt-0.5">Memories accepted from friends are saved to your calendar and listed here.</p>
						</div>
					{:else}
						<div class="space-y-2.5">
							<h3 class="text-xs font-bold text-pink-600 uppercase tracking-wide">Saved on Calendar ({acceptedSharedMemories.length})</h3>
							{#each acceptedSharedMemories as item (item.share_id)}
								<div class="p-3.5 bg-gradient-to-br from-pink-50/90 to-rose-50/60 border border-pink-200 rounded-2xl shadow-xs hover:border-pink-300 transition-all">
									<div class="flex items-start justify-between gap-2 mb-2">
										<div class="flex items-center space-x-2">
											<button
												type="button"
												onclick={() => { closeModal(); goto(`/profile?id=${item.sender_id}`); }}
												class="w-7 h-7 rounded-lg bg-pink-500 text-white font-bold text-xs flex items-center justify-center overflow-hidden hover:scale-105 transition-transform cursor-pointer"
												title="View @{item.sender_username}'s Profile"
											>
												{#if item.sender_avatar_url}
													<img src={item.sender_avatar_url} alt={item.sender_username} class="w-full h-full object-cover" />
												{:else}
													{item.sender_username.charAt(0).toUpperCase()}
												{/if}
											</button>
											<div>
												<p class="text-xs font-bold text-pink-800 flex items-center gap-1 flex-wrap">
													<button
														type="button"
														onclick={() => { closeModal(); goto(`/profile?id=${item.sender_id}`); }}
														class="hover:underline hover:text-pink-900 cursor-pointer"
													>
														@{item.sender_username}
													</button>
													<span class="font-normal text-pink-500">shared a memory with you</span>
												</p>
												<p class="text-[10px] text-pink-400">{formatTimeAgo(item.shared_at)}</p>
											</div>
										</div>

										{#if item.memory.mood_tag}
											<span class="text-[10px] px-2 py-0.5 rounded-full font-bold border {getMoodColor(item.memory.mood_tag)}">
												{item.memory.mood_tag}
											</span>
										{/if}
									</div>

									<!-- Memory Details Card -->
									<div class="p-3 bg-white/90 border border-pink-200 rounded-xl space-y-1.5">
										<div class="flex items-center justify-between text-xs">
											<span class="font-bold text-pink-700">{item.memory.memory_tag || 'Special Memory'}</span>
											<span class="text-[10px] text-pink-400">{formatDate(item.memory.date)}</span>
										</div>

										{#if item.memory.description}
											<p class="text-xs text-pink-900/90 line-clamp-3 leading-relaxed">
												{item.memory.description}
											</p>
										{/if}

										{#if item.memory.photo_video}
											<div class="mt-2 rounded-lg overflow-hidden max-h-40 border border-pink-200">
												{#if item.memory.photo_video_type === 'video'}
													<video src={item.memory.photo_video} controls class="w-full h-auto max-h-40 object-cover"></video>
												{:else}
													<img src={item.memory.photo_video} alt="Memory attachment" class="w-full h-auto max-h-40 object-cover" />
												{/if}
											</div>
										{/if}

										{#if item.memory.music}
											<div class="mt-1.5 p-2 bg-pink-50 rounded-lg flex items-center space-x-2 text-[11px] text-pink-700">
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-pink-500 flex-shrink-0">
													<path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66a.75.75 0 00.564-.724V6.553zm0 0a2.25 2.25 0 00-1.632-2.163l-6.75-1.928A2.25 2.25 0 004.5 4.5v11.25a2.25 2.25 0 001.632 2.163l1.32.377a1.803 1.803 0 00.99-3.467l-2.31-.66A.75.75 0 015.25 13.5V6.75" />
												</svg>
												<span class="truncate">{item.memory.music}</span>
											</div>
										{/if}
									</div>

									<!-- Action Buttons -->
									<div class="mt-2 flex items-center justify-end space-x-2">
										<button
											onclick={() => { closeModal(); goto(`/dashboard?date=${item.memory.date}`); }}
											class="px-2.5 py-1 bg-white border border-pink-300 hover:bg-pink-100 text-pink-600 rounded-lg text-xs font-semibold flex items-center space-x-1 active:scale-95 transition-all shadow-2xs cursor-pointer"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
											</svg>
											<span>Calendar</span>
										</button>
										<button
											onclick={() => handleOpenChat(item.sender_id, item.sender_username)}
											class="px-2.5 py-1 bg-pink-500 hover:bg-pink-600 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 active:scale-95 transition-all shadow-xs cursor-pointer"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
											</svg>
											<span>Say Thanks</span>
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{:else if activeTab === 'pending_memories'}
					<!-- Pending Memories Tab -->
					{#if pendingSharedMemories.length === 0}
						<div class="py-10 text-center">
							<div class="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-2.5 text-pink-400">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
							</div>
							<p class="text-sm font-bold text-pink-700">No pending memories</p>
							<p class="text-xs text-pink-400 mt-0.5">When friends share memories with you, you can accept or decline them here.</p>
						</div>
					{:else}
						<div class="space-y-2">
							<h3 class="text-xs font-bold text-pink-600 uppercase tracking-wide">Memory Share Requests ({pendingSharedMemories.length})</h3>
							{#each pendingSharedMemories as item (item.share_id)}
								<div class="p-3.5 bg-gradient-to-br from-pink-50/90 to-rose-50/60 border border-pink-200 rounded-2xl shadow-xs">
									<div class="flex items-start justify-between gap-2 mb-2">
										<div class="flex items-center space-x-2">
											<button
												type="button"
												onclick={() => { closeModal(); goto(`/profile?id=${item.sender_id}`); }}
												class="w-8 h-8 rounded-lg bg-pink-500 text-white font-bold text-xs flex items-center justify-center overflow-hidden hover:scale-105 transition-transform cursor-pointer"
												title="View @{item.sender_username}'s Profile"
											>
												{#if item.sender_avatar_url}
													<img src={item.sender_avatar_url} alt={item.sender_username} class="w-full h-full object-cover" />
												{:else}
													{item.sender_username.charAt(0).toUpperCase()}
												{/if}
											</button>
											<div>
												<p class="text-xs font-bold text-pink-800 flex items-center gap-1 flex-wrap">
													<button
														type="button"
														onclick={() => { closeModal(); goto(`/profile?id=${item.sender_id}`); }}
														class="hover:underline hover:text-pink-900 cursor-pointer"
													>
														@{item.sender_username}
													</button>
													<span class="font-normal text-pink-500">shared a memory</span>
												</p>
												<p class="text-[10px] text-pink-400">{formatTimeAgo(item.shared_at)}</p>
											</div>
										</div>

										{#if item.memory.mood_tag}
											<span class="text-[10px] px-2 py-0.5 rounded-full font-bold border {getMoodColor(item.memory.mood_tag)}">
												{item.memory.mood_tag}
											</span>
										{/if}
									</div>

									<div class="p-2.5 bg-white/90 border border-pink-200 rounded-xl space-y-1 text-xs">
										<div class="flex items-center justify-between">
											<span class="font-bold text-pink-700 truncate">{item.memory.memory_tag || 'Special Memory'}</span>
											<span class="text-[10px] text-pink-400 flex-shrink-0 ml-1">{formatDate(item.memory.date)}</span>
										</div>
										{#if item.memory.description}
											<p class="text-xs text-pink-900/85 line-clamp-2 leading-relaxed">
												{item.memory.description}
											</p>
										{/if}
									</div>

									<!-- Accept / Decline Buttons -->
									<div class="mt-2.5 flex items-center justify-end space-x-2">
										<button
											onclick={(e) => handleRespondSharedMemory(item, 'accept', e)}
											class="px-3.5 py-1.5 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center space-x-1 cursor-pointer"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
											</svg>
											<span>Accept</span>
										</button>
										<button
											onclick={(e) => handleRespondSharedMemory(item, 'decline', e)}
											class="px-3 py-1.5 bg-pink-100 hover:bg-red-100 text-pink-600 hover:text-red-600 active:scale-95 text-xs font-bold rounded-xl transition-all cursor-pointer"
										>
											Decline
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{:else if activeTab === 'sent'}
					<!-- Shared by You (Sent) -->
					{#if (notifications.sent_shared_memories || []).length === 0}
						<div class="py-10 text-center">
							<p class="text-sm font-bold text-pink-700">No shared memories</p>
							<p class="text-xs text-pink-400 mt-0.5">You haven't shared any memories with friends yet.</p>
						</div>
					{:else}
						<div class="space-y-2">
							<h3 class="text-xs font-bold text-pink-600 uppercase tracking-wide">Memories You Shared With Friends ({totalSentCount})</h3>
							{#each notifications.sent_shared_memories as item (item.share_id)}
								<div class="p-3.5 bg-gradient-to-br from-pink-50/90 to-rose-50/60 border border-pink-200 rounded-2xl shadow-xs hover:border-pink-300 transition-all">
									<div class="flex items-start justify-between gap-2 mb-2">
										<div class="flex items-center space-x-2">
											<button
												type="button"
												onclick={() => { closeModal(); goto(`/profile?id=${item.recipient_id}`); }}
												class="w-7 h-7 rounded-lg bg-gradient-to-tr from-pink-400 to-rose-500 text-white font-bold text-xs flex items-center justify-center overflow-hidden hover:scale-105 transition-transform cursor-pointer"
												title="View @{item.recipient_username}'s Profile"
											>
												{#if item.recipient_avatar_url}
													<img src={item.recipient_avatar_url} alt={item.recipient_username} class="w-full h-full object-cover" />
												{:else}
													{item.recipient_username.charAt(0).toUpperCase()}
												{/if}
											</button>
											<div>
												<p class="text-xs font-bold text-pink-800 flex items-center gap-1 flex-wrap">
													<span class="font-normal text-pink-500">Shared with</span>
													<button
														type="button"
														onclick={() => { closeModal(); goto(`/profile?id=${item.recipient_id}`); }}
														class="hover:underline hover:text-pink-900 cursor-pointer"
													>
														@{item.recipient_username}
													</button>
												</p>
												<p class="text-[10px] text-pink-400">{formatTimeAgo(item.shared_at)}</p>
											</div>
										</div>

										<div class="flex items-center space-x-1.5">
											{#if item.status === 'accepted'}
												<span class="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-0.5">
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-2.5 h-2.5 text-emerald-600">
														<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
													</svg>
													<span>Accepted</span>
												</span>
											{:else}
												<span class="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-0.5">
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-2.5 h-2.5 text-amber-600">
														<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
													</svg>
													<span>Pending</span>
												</span>
											{/if}
											{#if item.memory.mood_tag}
												<span class="text-[9px] px-1.5 py-0.2 rounded-full font-bold border {getMoodColor(item.memory.mood_tag)}">
													{item.memory.mood_tag}
												</span>
											{/if}
										</div>
									</div>

									<!-- Memory Details Card -->
									<div class="p-2.5 bg-white/90 border border-pink-200 rounded-xl space-y-1 text-xs">
										<div class="flex items-center justify-between">
											<span class="font-bold text-pink-700 truncate">{item.memory.memory_tag || item.memory.title || 'Special Memory'}</span>
											<span class="text-[10px] text-pink-400 flex-shrink-0 ml-1">{formatDate(item.memory.date)}</span>
										</div>
										{#if item.memory.description}
											<p class="text-xs text-pink-900/85 line-clamp-2 leading-relaxed">
												{item.memory.description}
											</p>
										{/if}
									</div>

									<!-- Actions (Cancel Share) -->
									<div class="mt-2 flex items-center justify-end space-x-2">
										<button
											onclick={(e) => promptCancelShare(item, e)}
											disabled={isCancelling}
											class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-semibold flex items-center space-x-1 active:scale-95 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
											title="Cancel and revoke access to this shared memory"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-rose-500">
												<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
											</svg>
											<span>Cancel Share</span>
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Cancel Shared Memory Confirmation Modal -->
{#if showCancelConfirmModal && cancelItemTarget}
	<div
		class="fixed inset-0 bg-black/50 backdrop-blur-xs z-[70] flex items-center justify-center p-4 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget) { showCancelConfirmModal = false; cancelItemTarget = null; } }}
	>
		<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center animate-modal-content relative overflow-hidden">
			<div class="w-14 h-14 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-7 h-7">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</div>
			<h3 class="text-base sm:text-lg font-black text-pink-950 mb-1.5">Cancel Shared Memory?</h3>
			<p class="text-xs text-pink-600 mb-6 font-medium leading-relaxed">
				Are you sure you want to cancel sharing this memory with <strong class="text-pink-700">@{cancelItemTarget.recipient_username}</strong>?
			</p>

			<div class="flex items-center space-x-3">
				<button
					type="button"
					onclick={() => { showCancelConfirmModal = false; cancelItemTarget = null; }}
					class="w-1/2 py-2.5 bg-pink-100 text-pink-700 hover:bg-pink-200 rounded-xl font-bold text-xs sm:text-sm transition-all"
				>
					No, Keep
				</button>
				<button
					type="button"
					onclick={confirmCancelShare}
					disabled={isCancelling}
					class="w-1/2 py-2.5 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-1"
				>
					{#if isCancelling}
						<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
						<span>Cancelling...</span>
					{:else}
						<span>Yes, Cancel</span>
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
