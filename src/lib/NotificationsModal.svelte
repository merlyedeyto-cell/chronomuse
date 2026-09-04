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
	let isLoading = $state(true);
	let isCancelling = $state(false);
	let activeTab = $state('memories'); // 'memories', 'requests', 'sent'

	function closeModal() {
		isOpen = false;
		dispatch('close');
	}

	async function fetchNotifications() {
		if (!userId) return;
		isLoading = true;
		try {
			const res = await fetch(API_ENDPOINTS.getNotifications, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: userId })
			});
			const data = await res.json();
			if (data.success && data.data) {
				notifications = data.data;
			}
		} catch (err) {
			console.error('Error fetching notifications:', err);
		} finally {
			isLoading = false;
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
	});

	$effect(() => {
		if (isOpen) {
			fetchNotifications();
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
			<div class="p-3 bg-pink-50 border-b border-pink-200 flex items-center space-x-2 text-xs font-semibold">
				<button
					onclick={() => activeTab = 'memories'}
					class="px-3 py-1.5 rounded-lg transition-all"
					class:bg-pink-500={activeTab === 'memories'}
					class:text-white={activeTab === 'memories'}
					class:text-pink-600={activeTab !== 'memories'}
					class:hover:bg-pink-100={activeTab !== 'memories'}
				>
					Shared Memories ({(notifications.shared_memories || []).length})
				</button>
				<button
					onclick={() => activeTab = 'requests'}
					class="px-3 py-1.5 rounded-lg transition-all"
					class:bg-pink-500={activeTab === 'requests'}
					class:text-white={activeTab === 'requests'}
					class:text-pink-600={activeTab !== 'requests'}
					class:hover:bg-pink-100={activeTab !== 'requests'}
				>
					Memories Pending ({(notifications.incoming_requests || []).length})
				</button>
				<button
					onclick={() => activeTab = 'sent'}
					class="px-3 py-1.5 rounded-lg transition-all"
					class:bg-pink-500={activeTab === 'sent'}
					class:text-white={activeTab === 'sent'}
					class:text-pink-600={activeTab !== 'sent'}
					class:hover:bg-pink-100={activeTab !== 'sent'}
				>
					Shared by You ({(notifications.sent_shared_memories || []).length})
				</button>
			</div>

			<!-- Content List -->
			<div class="p-4 overflow-y-auto space-y-3 flex-1 scrollbar-thin">
				{#if isLoading}
					<div class="py-12 text-center">
						<div class="animate-spin h-7 w-7 text-pink-500 mx-auto mb-2 border-3 border-pink-200 border-t-pink-500 rounded-full"></div>
						<p class="text-xs text-pink-400 font-medium">Loading notifications...</p>
					</div>
				{:else if notifications.total_notifications_count === 0}
					<div class="py-12 text-center">
						<div class="w-14 h-14 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-3 text-pink-400">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-7 h-7">
								<path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
							</svg>
						</div>
						<p class="text-sm font-bold text-pink-700">No notifications yet</p>
						<p class="text-xs text-pink-400 mt-1">When friends share memories or send requests, they'll appear here.</p>
					</div>
				{:else}
					<!-- Friend Requests -->
					{#if activeTab === 'requests' && notifications.incoming_requests.length > 0}
						<div class="space-y-2">
							<h3 class="text-xs font-bold text-pink-600 uppercase tracking-wide">Friend Requests</h3>
							{#each notifications.incoming_requests as req}
								<div class="p-3 bg-pink-50/80 border border-pink-200 rounded-2xl flex items-center justify-between shadow-xs">
									<div class="flex items-center space-x-2.5">
										<button
											type="button"
											onclick={() => { closeModal(); goto(`/profile?id=${req.sender_id}`); }}
											class="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-400 to-pink-600 text-white font-bold text-xs flex items-center justify-center overflow-hidden hover:scale-105 transition-transform cursor-pointer"
											title="View @{req.sender_username}'s Profile"
										>
											{#if req.sender_avatar_url}
												<img src={req.sender_avatar_url} alt={req.sender_username} class="w-full h-full object-cover" />
											{:else}
												{req.sender_username.charAt(0).toUpperCase()}
											{/if}
										</button>
										<div>
											<button
												type="button"
												onclick={() => { closeModal(); goto(`/profile?id=${req.sender_id}`); }}
												class="text-xs font-bold text-pink-700 hover:underline hover:text-pink-900 cursor-pointer text-left block"
											>
												@{req.sender_username}
											</button>
											<p class="text-[10px] text-pink-400">Sent a friend request • {formatTimeAgo(req.created_at)}</p>
										</div>
									</div>

									<div class="flex items-center space-x-1.5 flex-shrink-0">
										<button
											onclick={() => { closeModal(); goto(`/profile?id=${req.sender_id}`); }}
											class="px-2.5 py-1.5 bg-white border border-pink-300 text-pink-600 hover:bg-pink-100 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
										>
											Profile
										</button>
										<button
											onclick={handleViewFriends}
											class="px-3 py-1.5 bg-pink-500 hover:bg-pink-600 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
										>
											Respond
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}

					<!-- Shared Memories -->
					{#if activeTab === 'memories' && notifications.shared_memories.length > 0}
						<div class="space-y-2">
							<h3 class="text-xs font-bold text-pink-600 uppercase tracking-wide">Shared Memories From Friends</h3>
							{#each notifications.shared_memories as item}
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
											onclick={() => { closeModal(); goto(`/profile?id=${item.sender_id}`); }}
											class="px-2.5 py-1 bg-white border border-pink-300 hover:bg-pink-100 text-pink-600 rounded-lg text-xs font-semibold flex items-center space-x-1 active:scale-95 transition-all shadow-2xs cursor-pointer"
										>
											<span>Profile</span>
										</button>
										<button
											onclick={() => handleOpenChat(item.sender_id, item.sender_username)}
											class="px-2.5 py-1 bg-pink-500 hover:bg-pink-600 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 active:scale-95 transition-all shadow-xs cursor-pointer"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
											</svg>
											<span>Say Thanks in Chat</span>
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}

					<!-- Shared by You (Sent) -->
					{#if activeTab === 'sent'}
						{#if (notifications.sent_shared_memories || []).length === 0}
							<div class="py-8 text-center">
								<p class="text-sm font-bold text-pink-700">No shared memories</p>
								<p class="text-xs text-pink-400 mt-1">You haven't shared any memories with friends yet.</p>
							</div>
						{:else}
							<div class="space-y-2">
								<h3 class="text-xs font-bold text-pink-600 uppercase tracking-wide">Memories You Shared With Friends</h3>
								{#each notifications.sent_shared_memories as item}
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
													<span class="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
														✓ Accepted
													</span>
												{:else}
													<span class="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-amber-50 text-amber-700 border border-amber-200">
														Pending
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

										<!-- Actions (Profile & Cancel Share) -->
										<div class="mt-2 flex items-center justify-end space-x-2">
											<button
												onclick={() => { closeModal(); goto(`/profile?id=${item.recipient_id}`); }}
												class="px-2.5 py-1 bg-white border border-pink-300 hover:bg-pink-100 text-pink-600 rounded-lg text-xs font-semibold flex items-center space-x-1 active:scale-95 transition-all shadow-2xs cursor-pointer"
											>
												<span>Profile</span>
											</button>
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
