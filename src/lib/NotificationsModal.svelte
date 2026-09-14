<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { goto } from '$app/navigation';
	import { playClickSound } from '$lib/soundEffects.js';

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
	let activeTab = $state('memories'); // 'memories', 'pending_memories', 'sent'

	let pendingSharedMemories = $derived((notifications.shared_memories || []).filter(m => m.status !== 'accepted'));
	let acceptedSharedMemories = $derived((notifications.shared_memories || []).filter(m => m.status === 'accepted'));
	let sentSharedMemories = $derived(notifications.sent_shared_memories || []);

	let totalPendingMemoriesCount = $derived(pendingSharedMemories.length);
	let totalMemoriesCount = $derived(acceptedSharedMemories.length);
	let totalSentCount = $derived(sentSharedMemories.length);

	$effect(() => {
		if (isOpen) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
		};
	});

	function closeModal() {
		playClickSound();
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

	async function handleRespondSharedMemory(item, action, e) {
		if (e) e.stopPropagation();
		if (!userId || isResponding) return;
		isResponding = true;
		playClickSound();

		const backupMemories = [...notifications.shared_memories];

		if (action === 'accept') {
			notifications.shared_memories = notifications.shared_memories.map(m => 
				m.share_id === item.share_id ? { ...m, status: 'accepted' } : m
			);
		} else {
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
		playClickSound();
		cancelItemTarget = item;
		showCancelConfirmModal = true;
	}

	async function confirmCancelShare() {
		if (!userId || !cancelItemTarget || isCancelling) return;
		playClickSound();
		const item = cancelItemTarget;
		isCancelling = true;
		const backupSent = [...(notifications.sent_shared_memories || [])];
		notifications.sent_shared_memories = (notifications.sent_shared_memories || []).filter(m => m.share_id !== item.share_id);
		showCancelConfirmModal = false;

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
		class="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans"
		onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
	>
		<div class="bg-white rounded-[32px] max-w-lg w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl border border-pink-100 animate-pop-in">
			<!-- Header -->
			<div class="p-5 pb-3 flex items-center justify-between border-b border-pink-50">
				<div>
					<h2 class="text-lg font-black text-[#f43f8e]">Notifications & Requests</h2>
					<p class="text-xs text-pink-400 font-bold">Accept memory requests or manage notifications</p>
				</div>

				<button
					onclick={closeModal}
					class="p-1.5 rounded-full hover:bg-pink-50 text-pink-400 hover:text-pink-600 transition-colors cursor-pointer"
					aria-label="Close"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Filter Tabs (3 Pills) -->
			<div class="px-4 py-2.5 bg-[#fff0f5] border-b border-pink-100/70">
				<div class="grid grid-cols-3 gap-1 bg-white p-1 rounded-2xl border border-pink-100">
					<button
						onclick={() => { playClickSound(); activeTab = 'memories'; }}
						class="py-2 px-1 rounded-xl text-xs font-black transition-all text-center cursor-pointer active:scale-95"
						class:bg-[#f43f8e]={activeTab === 'memories'}
						class:text-white={activeTab === 'memories'}
						class:shadow-xs={activeTab === 'memories'}
						class:text-pink-600={activeTab !== 'memories'}
					>
						Shared ({totalMemoriesCount})
					</button>

					<button
						onclick={() => { playClickSound(); activeTab = 'pending_memories'; }}
						class="py-2 px-1 rounded-xl text-xs font-black transition-all text-center relative cursor-pointer active:scale-95"
						class:bg-[#f43f8e]={activeTab === 'pending_memories'}
						class:text-white={activeTab === 'pending_memories'}
						class:shadow-xs={activeTab === 'pending_memories'}
						class:text-pink-600={activeTab !== 'pending_memories'}
					>
						Pending ({totalPendingMemoriesCount})
						{#if pendingSharedMemories.length > 0}
							<span class="w-2 h-2 rounded-full bg-rose-500 animate-ping absolute top-1 right-2"></span>
						{/if}
					</button>

					<button
						onclick={() => { playClickSound(); activeTab = 'sent'; }}
						class="py-2 px-1 rounded-xl text-xs font-black transition-all text-center cursor-pointer active:scale-95"
						class:bg-[#f43f8e]={activeTab === 'sent'}
						class:text-white={activeTab === 'sent'}
						class:shadow-xs={activeTab === 'sent'}
						class:text-pink-600={activeTab !== 'sent'}
					>
						By You ({totalSentCount})
					</button>
				</div>
			</div>

			<!-- Content List -->
			<div class="p-4 overflow-y-auto space-y-3 flex-1">
				{#if isLoading}
					<div class="space-y-2.5 animate-pulse">
						{#each Array(3) as _}
							<div class="bg-pink-50/50 rounded-2xl p-3.5 border border-pink-100/80 flex items-center justify-between gap-3">
								<div class="flex items-center space-x-2.5 min-w-0 flex-1">
									<div class="w-9 h-9 rounded-full bg-pink-200/70 flex-shrink-0"></div>
									<div class="space-y-1.5 flex-1">
										<div class="h-3 bg-pink-200/70 rounded w-3/4"></div>
										<div class="h-2.5 bg-pink-200/50 rounded w-1/2"></div>
									</div>
								</div>
								<div class="h-6 w-16 bg-pink-200/50 rounded-lg flex-shrink-0"></div>
							</div>
						{/each}
					</div>
				{:else if activeTab === 'memories'}
					{#if acceptedSharedMemories.length === 0}
						<div class="py-10 text-center">
							<div class="w-12 h-12 bg-pink-50 rounded-full flex items-center justify-center mx-auto mb-2.5 text-pink-300">
								<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<circle cx="12" cy="12" r="10"></circle>
									<path d="m9 12 2 2 4-4"></path>
								</svg>
							</div>
							<p class="text-sm font-black text-[#f43f8e]">No shared memories yet</p>
							<p class="text-xs text-pink-400 font-bold mt-0.5">Memories accepted from friends are saved to your calendar.</p>
						</div>
					{:else}
						<div class="space-y-3">
							{#each acceptedSharedMemories as item (item.share_id)}
								<div class="p-4 bg-white border border-pink-100 rounded-2xl shadow-xs space-y-2.5">
									<div class="flex items-center justify-between gap-2">
										<div class="flex items-center space-x-2.5">
											<div class="w-9 h-9 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center overflow-hidden text-pink-500 font-bold text-sm">
												{#if item.sender_avatar_url}
													<img src={item.sender_avatar_url} alt={item.sender_username} class="w-full h-full object-cover" />
												{:else}
													🍒
												{/if}
											</div>
											<div>
												<p class="text-xs font-black text-[#e8367f] flex items-center gap-1.5">
													<span>@{item.sender_username}</span>
													<span class="bg-pink-50 text-[#f43f8e] border border-pink-200 text-[10px] font-black px-2 py-0.5 rounded-full">✓ Saved to Calendar</span>
												</p>
												<p class="text-[11px] font-bold text-pink-950/70">
													{item.memory.memory_tag || item.memory.title || 'Special Memory'}
													<span class="text-pink-400 font-normal ml-1">• {formatDate(item.memory.date)}</span>
												</p>
											</div>
										</div>
									</div>

									<div class="flex items-center justify-end space-x-2 pt-2 border-t border-pink-50">
										<button
											onclick={() => { closeModal(); goto(`/dashboard?date=${item.memory.date}`); }}
											class="px-3 py-1.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-xl text-xs font-black flex items-center space-x-1.5 active:scale-95 transition-all cursor-pointer"
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
					{/if}
				{:else if activeTab === 'pending_memories'}
					{#if pendingSharedMemories.length === 0}
						<div class="py-10 text-center">
							<div class="w-12 h-12 bg-pink-50 rounded-full flex items-center justify-center mx-auto mb-2.5 text-pink-300">
								<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<circle cx="12" cy="12" r="10"></circle>
									<polyline points="12 6 12 12 16 14"></polyline>
								</svg>
							</div>
							<p class="text-sm font-black text-[#f43f8e]">No pending memories</p>
							<p class="text-xs text-pink-400 font-bold mt-0.5">Incoming memory share requests will show up here.</p>
						</div>
					{:else}
						<div class="space-y-3">
							{#each pendingSharedMemories as item (item.share_id)}
								<div class="p-4 bg-white border border-pink-100 rounded-2xl shadow-xs space-y-2.5">
									<div class="flex items-center space-x-2.5">
										<div class="w-9 h-9 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center overflow-hidden text-pink-500 font-bold text-sm">
											{#if item.sender_avatar_url}
												<img src={item.sender_avatar_url} alt={item.sender_username} class="w-full h-full object-cover" />
											{:else}
												🍒
											{/if}
										</div>
										<div>
											<p class="text-xs font-black text-[#e8367f]">@{item.sender_username} <span class="text-pink-400 font-bold">shared a memory</span></p>
											<p class="text-[11px] font-bold text-pink-950/70">{item.memory.memory_tag || item.memory.title || 'Special Memory'} • {formatDate(item.memory.date)}</p>
										</div>
									</div>

									<div class="flex items-center justify-end space-x-2 pt-2 border-t border-pink-50">
										<button
											onclick={(e) => handleRespondSharedMemory(item, 'accept', e)}
											class="px-3 py-1.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white text-xs font-black rounded-xl active:scale-95 transition-all cursor-pointer"
										>
											Accept
										</button>
										<button
											onclick={(e) => handleRespondSharedMemory(item, 'decline', e)}
											class="px-3 py-1.5 bg-white border border-pink-200 hover:bg-rose-50 text-rose-500 text-xs font-black rounded-xl active:scale-95 transition-all cursor-pointer"
										>
											Decline
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{:else if activeTab === 'sent'}
					{#if (notifications.sent_shared_memories || []).length === 0}
						<div class="py-10 text-center">
							<p class="text-sm font-black text-[#f43f8e]">No shared memories</p>
							<p class="text-xs text-pink-400 font-bold mt-0.5">You haven't shared any memories with friends yet.</p>
						</div>
					{:else}
						<div class="space-y-3">
							{#each notifications.sent_shared_memories as item (item.share_id)}
								<div class="p-4 bg-white border border-pink-100 rounded-2xl shadow-xs space-y-2.5">
									<div class="flex items-center justify-between">
										<div class="flex items-center space-x-2.5">
											<div class="w-9 h-9 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center overflow-hidden text-pink-500 font-bold text-sm">
												{#if item.recipient_avatar_url}
													<img src={item.recipient_avatar_url} alt={item.recipient_username} class="w-full h-full object-cover" />
												{:else}
													🍒
												{/if}
											</div>
											<div>
												<p class="text-xs font-black text-[#e8367f]">Shared with @{item.recipient_username}</p>
												<p class="text-[11px] font-bold text-pink-950/70">{item.memory.memory_tag || item.memory.title || 'Special Memory'} • {formatDate(item.memory.date)}</p>
											</div>
										</div>
									</div>

									<div class="flex items-center justify-between pt-2 border-t border-pink-50">
										<span class="text-[11px] text-pink-300 font-bold">{formatTimeAgo(item.shared_at)}</span>
										<button
											onclick={(e) => promptCancelShare(item, e)}
											class="px-3 py-1.5 bg-white border border-pink-200 hover:bg-rose-50 text-[#f43f8e] text-xs font-black rounded-xl active:scale-95 transition-all cursor-pointer"
										>
											Cancel Share
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
