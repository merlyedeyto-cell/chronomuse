<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { broadcastFriendEvent } from '$lib/realtimeBroadcast.js';
	import { X, UserPlus, CheckCircle, AlertCircle, Search } from 'lucide-svelte';

	const dispatch = createEventDispatcher();

	let { open = false } = $props();
	let isOpen = $state(false);
	let isClosing = $state(false);
	let isLoading = $state(false);
	let addingFriendUserId = $state(null);
	let cancelingFriendUserId = $state(null);
	let errorMessage = $state('');
	let successMessage = $state('');

	let friendUsername = $state('');
	let searchResults = $state([]);
	let isSearching = $state(false);
	let hasSearched = $state(false);
	let searchDebounceTimer = null;

	let pendingRequests = $state([]);
	let sentRequests = $state([]);
	let isResponding = $state(false);

	// Suggested Users / Discover People state (20 per batch lazy load)
	let suggestedUsers = $state([]);
	let suggestedPage = $state(1);
	let hasMoreSuggested = $state(true);
	let isLoadingSuggested = $state(false);

	$effect(() => {
		isOpen = open;
		if (isOpen) {
			document.body.style.overflow = 'hidden';
			fetchPendingRequests().then(() => {
				loadSuggestedUsers(1, false);
			});
		} else {
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
		};
	});

	// Gesture Drag Animation
	// Gesture Drag Animation State (Mobile Touch & Pointer Optimized)
	let isDragging = $state(false);
	let dragStartY = 0;
	let dragTranslateY = $state(0);
	let dragStartTime = 0;
	let activePointerId = null;

	function handlePointerDown(e) {
		if (isClosing) return;
		if (e.target.closest('button, input, textarea, a, select')) return;
		if (e.button !== undefined && e.button !== 0) return;

		dragStartY = e.clientY;
		dragTranslateY = 0;
		dragStartTime = Date.now();
		isDragging = true;
		activePointerId = e.pointerId;

		try {
			if (e.currentTarget && e.currentTarget.setPointerCapture) {
				e.currentTarget.setPointerCapture(e.pointerId);
			}
		} catch (err) {}
	}

	function handlePointerMove(e) {
		if (!isDragging || isClosing) return;
		if (activePointerId !== null && e.pointerId !== activePointerId) return;

		const deltaY = e.clientY - dragStartY;
		if (deltaY > 0) {
			dragTranslateY = deltaY;
		} else {
			dragTranslateY = deltaY * 0.35;
		}
	}

	function handlePointerUp(e) {
		if (!isDragging) return;
		if (activePointerId !== null && e.pointerId !== activePointerId) return;

		isDragging = false;
		if (activePointerId !== null) {
			try {
				if (e.currentTarget && e.currentTarget.releasePointerCapture) {
					e.currentTarget.releasePointerCapture(activePointerId);
				}
			} catch (err) {}
			activePointerId = null;
		}

		const elapsedTime = Date.now() - dragStartTime;
		const velocity = dragTranslateY / Math.max(elapsedTime, 1);

		if (dragTranslateY > 85 || (velocity > 0.3 && dragTranslateY > 30)) {
			handleClose();
		} else {
			dragTranslateY = 0;
		}
	}

	function handlePointerCancel(e) {
		if (isDragging) {
			isDragging = false;
			activePointerId = null;
			dragTranslateY = 0;
		}
	}

	function handleClose() {
		if (isClosing) return;
		isClosing = true;
		setTimeout(() => {
			isOpen = false;
			isClosing = false;
			dragTranslateY = 0;
			errorMessage = '';
			successMessage = '';
			friendUsername = '';
			searchResults = [];
			hasSearched = false;
			document.body.style.overflow = '';
			dispatch('close');
		}, 200);
	}

	function getCurrentUser() {
		const currentUser = localStorage.getItem('chronomuse_user');
		return currentUser ? JSON.parse(currentUser) : null;
	}

	let searchAbortController = null;

	function handleSearchInput() {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		if (searchAbortController) searchAbortController.abort();

		const query = friendUsername.trim();
		if (!query) {
			searchResults = [];
			hasSearched = false;
			isSearching = false;
			return;
		}
		isSearching = true;
		searchDebounceTimer = setTimeout(() => {
			performUserSearch(query);
		}, 300);
	}

	async function performUserSearch(query) {
		const user = getCurrentUser();
		if (!user || !user.id || !query) return;
		if (searchAbortController) {
			searchAbortController.abort();
		}
		searchAbortController = new AbortController();

		isSearching = true;
		hasSearched = true;
		errorMessage = '';
		successMessage = '';

		try {
			const res = await fetch(API_ENDPOINTS.searchUsers, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					query: query
				}),
				signal: searchAbortController.signal
			});
			const data = await res.json();
			if (data.success && data.data) {
				searchResults = data.data.users || [];
			} else {
				searchResults = [];
			}
		} catch (err) {
			if (err.name === 'AbortError') return;
			console.error('Search error in modal:', err);
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	async function loadSuggestedUsers(pageToLoad = 1, isAppend = false) {
		const user = getCurrentUser();
		if (!user || !user.id || isLoadingSuggested) return;

		isLoadingSuggested = true;

		try {
			const res = await fetch(API_ENDPOINTS.getSuggestedUsers, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					page: pageToLoad,
					limit: 20
				})
			});
			const data = await res.json();
			if (data.success && data.data) {
				const newUsers = data.data.users || [];
				if (isAppend) {
					suggestedUsers = [...suggestedUsers, ...newUsers];
				} else {
					suggestedUsers = newUsers;
				}
				suggestPageUpdate(pageToLoad, data.data.has_more);
			}
		} catch (err) {
			console.error('Error loading suggested users:', err);
		} finally {
			isLoadingSuggested = false;
		}
	}

	function suggestPageUpdate(page, hasMore) {
		suggestedPage = page;
		hasMoreSuggested = Boolean(hasMore);
	}

	function handleLoadMoreSuggested() {
		if (hasMoreSuggested && !isLoadingSuggested) {
			loadSuggestedUsers(suggestedPage + 1, true);
		}
	}

	function handleViewUserProfile(userId) {
		handleClose();
		setTimeout(() => {
			goto(`/profile?id=${userId}`);
		}, 300);
	}

	async function sendFriendRequestToUser(targetUser) {
		if (!targetUser || !targetUser.id || addingFriendUserId === targetUser.id) return;
		addingFriendUserId = targetUser.id;
		errorMessage = '';
		successMessage = '';

		const user = getCurrentUser();
		if (!user || !user.id) {
			addingFriendUserId = null;
			errorMessage = 'Please log in first.';
			return;
		}

		const previousRel = targetUser.relationship;
		targetUser.relationship = 'request_sent';

		// Also update inside suggestedUsers if present
		suggestedUsers = suggestedUsers.map(su => su.id === targetUser.id ? { ...su, relationship: 'request_sent' } : su);

		try {
			if (typeof broadcastFriendEvent === 'function') {
				broadcastFriendEvent(user.id, targetUser.id, 'friend_request');
			}
		} catch (e) {}

		try {
			const res = await fetch(API_ENDPOINTS.addFriend, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					friend_username: targetUser.username,
					user_id: user.id,
					sender_id: user.id,
					receiver_id: targetUser.id
				})
			});
			const data = await res.json();
			if (data.error) {
				targetUser.relationship = previousRel;
				suggestedUsers = suggestedUsers.map(su => su.id === targetUser.id ? { ...su, relationship: previousRel } : su);
				errorMessage = data.error;
			} else {
				successMessage = data.message || `Friend request sent to @${targetUser.username}!`;
				targetUser.request_id = data.request_id || null;
				suggestedUsers = suggestedUsers.map(su => su.id === targetUser.id ? { ...su, relationship: 'request_sent', request_id: data.request_id || su.request_id } : su);
				fetchPendingRequests();
				dispatch('addFriend', data);
				try {
					if (typeof broadcastFriendEvent === 'function') {
						broadcastFriendEvent(user.id, targetUser.id, 'friend_request');
					}
				} catch (e) {}
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_friend_change'));
				}
				setTimeout(() => {
					successMessage = '';
				}, 3000);
			}
		} catch (error) {
			targetUser.relationship = previousRel;
			suggestedUsers = suggestedUsers.map(su => su.id === targetUser.id ? { ...su, relationship: previousRel } : su);
			errorMessage = 'An error occurred. Please try again.';
			console.error('Add friend error:', error);
		} finally {
			addingFriendUserId = null;
		}
	}

	async function handleCancelFriendRequestFromSearch(targetUser) {
		const user = getCurrentUser();
		if (!user || !user.id || !targetUser || !targetUser.id || cancelingFriendUserId === targetUser.id) return;
		cancelingFriendUserId = targetUser.id;
		const previousRel = targetUser.relationship;
		const previousReqId = targetUser.request_id;
		targetUser.relationship = 'none';
		targetUser.request_id = null;

		suggestedUsers = suggestedUsers.map(su => su.id === targetUser.id ? { ...su, relationship: 'none', request_id: null } : su);
		try {
			if (typeof broadcastFriendEvent === 'function') {
				broadcastFriendEvent(user.id, targetUser.id, 'cancel_request');
			}
		} catch (e) {}

		try {
			const res = await fetch(API_ENDPOINTS.cancelFriendRequest, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					request_id: previousReqId || null,
					friend_id: targetUser.id
				})
			});
			const data = await res.json();
			if (data.success) {
				fetchPendingRequests();
				try {
					if (typeof broadcastFriendEvent === 'function') {
						broadcastFriendEvent(user.id, targetUser.id, 'cancel_request');
					}
				} catch (e) {}
			} else {
				targetUser.relationship = previousRel;
				targetUser.request_id = previousReqId;
				suggestedUsers = suggestedUsers.map(su => su.id === targetUser.id ? { ...su, relationship: previousRel, request_id: previousReqId } : su);
			}
		} catch (err) {
			targetUser.relationship = previousRel;
			targetUser.request_id = previousReqId;
			suggestedUsers = suggestedUsers.map(su => su.id === targetUser.id ? { ...su, relationship: previousRel, request_id: previousReqId } : su);
			console.error('Cancel friend request error:', err);
		} finally {
			cancelingFriendUserId = null;
		}
	}

	async function fetchPendingRequests() {
		const user = getCurrentUser();
		if (!user || !user.id) return;

		try {
			const res = await fetch(API_ENDPOINTS.getFriendRequests, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id })
			});
			const data = await res.json();
			if (data.success && data.data) {
				pendingRequests = data.data.requests || [];
				sentRequests = data.data.sent_requests || [];
			}
		} catch (error) {
			console.error('Error fetching friend requests:', error);
		}
	}

	async function handleRespond(requestId, action) {
		const user = getCurrentUser();
		if (!user || !user.id || isResponding) return;

		isResponding = true;
		errorMessage = '';
		successMessage = '';

		const backupPending = [...pendingRequests];
		pendingRequests = pendingRequests.filter(r => r.id !== requestId);

		try {
			const res = await fetch(API_ENDPOINTS.respondToFriendRequest, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					request_id: requestId,
					action: action,
					user_id: user.id
				})
			});
			const data = await res.json();
			if (data.success) {
				successMessage = data.message || `Friend request ${action}ed!`;
				fetchPendingRequests();
				loadSuggestedUsers(1, false);
				dispatch('friendStatusChanged');
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_friend_change'));
				}
				setTimeout(() => {
					successMessage = '';
				}, 3000);
			} else {
				pendingRequests = backupPending;
				errorMessage = data.error || 'Failed to respond to request';
			}
		} catch (error) {
			pendingRequests = backupPending;
			errorMessage = 'An error occurred. Please try again.';
			console.error('Respond error:', error);
		} finally {
			isResponding = false;
		}
	}

	async function handleCancelSentRequest(requestId) {
		const user = getCurrentUser();
		if (!user || !user.id || isResponding) return;

		isResponding = true;
		errorMessage = '';
		successMessage = '';

		const backupSent = [...sentRequests];
		const targetReq = sentRequests.find(r => r.id === requestId);
		sentRequests = sentRequests.filter(r => r.id !== requestId);

		if (targetReq?.receiver_id) {
			broadcastFriendEvent(user.id, targetReq.receiver_id, 'cancel_request');
		}

		try {
			const res = await fetch(API_ENDPOINTS.cancelFriendRequest, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					request_id: requestId
				})
			});
			const data = await res.json();
			if (data.success) {
				fetchPendingRequests();
				loadSuggestedUsers(1, false);
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_friend_change'));
				}
			} else {
				sentRequests = backupSent;
				errorMessage = data.error || 'Failed to cancel request';
			}
		} catch (err) {
			sentRequests = backupSent;
			errorMessage = 'An error occurred. Please try again.';
			console.error('Cancel request error:', err);
		} finally {
			isResponding = false;
		}
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center font-sans pointer-events-auto select-none"
		style="opacity: {isClosing ? 0 : Math.max(0.1, 1 - (dragTranslateY / 380))}; transition: {isDragging ? 'none' : 'opacity 0.25s ease'};"
		onclick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
		onkeydown={(e) => { if (e.key === 'Escape') handleClose(); }}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<div
			class="bg-gradient-to-b from-[#fff5f8] via-[#fff0f5] to-white border-t-2 border-x border-pink-200/90 rounded-t-[32px] sm:rounded-t-[38px] p-4 sm:p-6 pb-6 relative w-full max-w-xl sm:max-w-2xl md:max-w-3xl max-h-[96vh] sm:max-h-[92vh] h-[93vh] sm:h-[89vh] md:h-[88vh] overflow-hidden flex flex-col shadow-[0_-12px_45px_rgba(244,63,142,0.22)]"
			style="transform: translateY({isClosing ? '100%' : `${dragTranslateY}px`}); transition: {isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease'}; opacity: {isClosing ? 0 : 1}; will-change: transform;"
		>
			<!-- Pull / Drag Handle Bar Touch Area -->
			<div
				class="w-full pt-1 pb-2 -mt-1.5 mb-1.5 flex items-center justify-center cursor-grab active:cursor-grabbing select-none flex-shrink-0 touch-none"
				style="touch-action: none; -webkit-user-select: none;"
				aria-hidden="true"
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerUp}
				onpointercancel={handlePointerCancel}
			>
				<div class="py-1 px-8 flex items-center justify-center">
					<div
						class="h-1.5 rounded-full transition-all duration-200 {isDragging ? 'w-24 bg-[#f43f8e] scale-110 shadow-sm' : 'w-14 sm:w-16 bg-pink-300/80 hover:bg-pink-400 hover:w-20'}"
					></div>
				</div>
			</div>

			<!-- Close Button -->
			<button
				onclick={handleClose}
				class="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 w-8 h-8 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 z-10"
				title="Close"
			>
				<X class="w-4 h-4" />
			</button>

			<!-- Header -->
			<div class="text-center mb-3 pr-10 pl-10 flex-shrink-0">
				<div class="w-10 h-10 bg-gradient-to-tr from-[#f43f8e] to-[#ec4899] rounded-2xl flex items-center justify-center mx-auto mb-1.5 text-white shadow-xs">
					<UserPlus class="w-5 h-5" />
				</div>
				<h2 class="text-base sm:text-lg font-black text-pink-950 mb-0.5">Find & Add Friends</h2>
				<p class="text-[11px] text-pink-400 font-bold">Search or discover registered users to connect on ChronoMuse</p>
			</div>

			<!-- Success Message -->
			{#if successMessage}
				<div class="mb-3.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center space-x-2">
					<CheckCircle class="w-4 h-4 text-emerald-600 flex-shrink-0" />
					<span>{successMessage}</span>
				</div>
			{/if}

			<!-- Error Message -->
			{#if errorMessage}
				<div class="mb-3.5 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-bold flex items-center space-x-2">
					<AlertCircle class="w-4 h-4 text-rose-600 flex-shrink-0" />
					<span>{errorMessage}</span>
				</div>
			{/if}

			<!-- Search Bar -->
			<div class="mb-3.5">
				<label for="modal_friend_username" class="block text-[11px] font-black text-[#f43f8e] mb-1">Search by Username</label>
				<div class="relative">
					<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-pink-400">
						<Search class="w-3.5 h-3.5" />
					</div>
					<input
						id="modal_friend_username"
						type="text"
						bind:value={friendUsername}
						oninput={handleSearchInput}
						placeholder="Type friend's username..."
						class="w-full pl-8.5 pr-8 py-2 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-xs font-bold text-pink-950 placeholder:text-pink-300 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 focus:border-[#f43f8e] focus:bg-white transition-all shadow-2xs"
					/>
					{#if friendUsername}
						<button
							type="button"
							onclick={() => { friendUsername = ''; searchResults = []; hasSearched = false; }}
							class="absolute right-2.5 top-2 p-1 text-pink-400 hover:text-pink-600 rounded-full cursor-pointer"
							title="Clear search"
						>
							<X class="w-3.5 h-3.5" />
						</button>
					{/if}
				</div>
			</div>

			<!-- Search Results List -->
			{#if isSearching}
				<div class="space-y-2 mb-4 animate-pulse">
					{#each Array(2) as _}
						<div class="p-2.5 bg-white border border-pink-100 rounded-2xl flex items-center justify-between gap-2 shadow-2xs">
							<div class="flex items-center space-x-2.5 min-w-0 flex-1">
								<div class="w-9 h-9 rounded-full bg-pink-200/70 flex-shrink-0"></div>
								<div class="space-y-1.5 flex-1">
									<div class="h-3.5 bg-pink-200/70 rounded w-1/2"></div>
									<div class="h-2.5 bg-pink-200/50 rounded w-1/3"></div>
								</div>
							</div>
							<div class="h-7 w-16 bg-pink-100/80 rounded-xl flex-shrink-0"></div>
						</div>
					{/each}
				</div>
			{:else if searchResults.length > 0}
				<div class="mb-4 space-y-2">
					<div class="flex items-center justify-between">
						<h3 class="text-xs font-black text-[#f43f8e] uppercase tracking-wide">
							Search Results ({searchResults.length})
						</h3>
					</div>

					<div class="space-y-2 max-h-52 overflow-y-auto pr-1">
						{#each searchResults as targetUser (targetUser.id)}
							<div class="p-2.5 bg-white border border-pink-100/90 rounded-2xl flex items-center justify-between gap-2 shadow-2xs hover:border-pink-200 transition-all">
								<button
									type="button"
									onclick={() => handleViewUserProfile(targetUser.id)}
									class="flex items-center space-x-2.5 min-w-0 text-left group cursor-pointer"
								>
									<div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#f43f8e] to-[#ec4899] text-white font-black text-xs flex items-center justify-center flex-shrink-0 overflow-hidden shadow-2xs">
										{#if targetUser.avatar_url}
											<img src={targetUser.avatar_url} alt={targetUser.username} class="w-full h-full object-cover" />
										{:else}
											{targetUser.username.charAt(0).toUpperCase()}
										{/if}
									</div>
									<div class="min-w-0">
										<p class="text-xs font-black text-[#e8367f] truncate group-hover:underline">@{targetUser.username}</p>
										{#if targetUser.mutual_friends_count > 0}
											<p class="text-[10px] text-pink-500 font-bold">{targetUser.mutual_friends_count} mutual friend{targetUser.mutual_friends_count === 1 ? '' : 's'}</p>
										{:else}
											<p class="text-[10px] text-pink-950/60 truncate">{targetUser.email}</p>
										{/if}
									</div>
								</button>

								<div class="flex items-center space-x-1.5 flex-shrink-0">
									<button
										type="button"
										onclick={() => handleViewUserProfile(targetUser.id)}
										class="px-2.5 py-1 bg-pink-50 hover:bg-pink-100 text-[#f43f8e] border border-pink-100 text-xs font-bold rounded-xl cursor-pointer active:scale-95 transition-all"
									>
										Profile
									</button>

									{#if targetUser.relationship === 'self'}
										<span class="px-2 py-1 bg-pink-50 text-pink-400 text-xs font-bold rounded-xl">You</span>
									{:else if targetUser.relationship === 'friends'}
										<span class="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black rounded-xl">Friends</span>
									{:else if targetUser.relationship === 'request_sent'}
										<button
											type="button"
											onclick={() => handleCancelFriendRequestFromSearch(targetUser)}
											disabled={isResponding}
											class="px-2.5 py-1 bg-white hover:bg-rose-50 text-pink-600 hover:text-rose-600 border border-pink-200 text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer disabled:opacity-50"
										>
											Cancel
										</button>
									{:else if targetUser.relationship === 'request_received'}
										<button
											type="button"
											onclick={() => handleRespond(targetUser.request_id, 'accept')}
											class="px-2.5 py-1 bg-[#f43f8e] hover:bg-[#e0337f] text-white text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-xs"
										>
											Accept
										</button>
									{:else}
										<button
											type="button"
											onclick={() => sendFriendRequestToUser(targetUser)}
											disabled={addingFriendUserId === targetUser.id}
											class="px-2.5 py-1 bg-[#f43f8e] hover:bg-[#e0337f] text-white text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-xs disabled:opacity-50"
										>
											{#if addingFriendUserId === targetUser.id}
												Sending...
											{:else}
												+ Add Friend
											{/if}
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else if hasSearched && friendUsername.trim()}
				<div class="mb-4 text-center py-3 bg-[#fdf2f6] rounded-2xl border border-pink-100">
					<p class="text-xs font-bold text-pink-950">No user found matching "@{friendUsername.trim()}"</p>
					<p class="text-[10px] text-pink-400 mt-0.5 font-medium">Please check the spelling and try again.</p>
				</div>
			{/if}

			<!-- Suggested / Discover Random People Section (Lazy Loaded 20/batch) -->
			<div class="mt-3.5 pt-3.5 border-t border-pink-100">
				<div class="flex items-center justify-between mb-2.5">
					<div>
						<h3 class="text-xs font-black text-pink-950 uppercase tracking-wide">
							Discover People on ChronoMuse
						</h3>
						<p class="text-[10px] text-pink-400 font-bold">Add people to share memories and chat</p>
					</div>
					<button
						type="button"
						onclick={() => loadSuggestedUsers(1, false)}
						class="text-xs text-[#f43f8e] hover:text-[#e0337f] font-bold cursor-pointer"
					>
						Refresh
					</button>
				</div>

				{#if suggestedUsers.length === 0 && isLoadingSuggested}
					<div class="space-y-2 max-h-56 overflow-hidden animate-pulse">
						{#each Array(3) as _}
							<div class="p-2.5 bg-white border border-pink-100/90 rounded-2xl flex items-center justify-between gap-2 shadow-2xs">
								<div class="flex items-center space-x-2.5 min-w-0 flex-1">
									<div class="w-9 h-9 rounded-full bg-pink-200/70 flex-shrink-0"></div>
									<div class="space-y-1.5 flex-1">
										<div class="h-3.5 bg-pink-200/70 rounded w-1/2"></div>
										<div class="h-2.5 bg-pink-200/50 rounded w-1/3"></div>
									</div>
								</div>
								<div class="h-7 w-16 bg-pink-100/80 rounded-xl flex-shrink-0"></div>
							</div>
						{/each}
					</div>
				{:else if suggestedUsers.length === 0}
					<div class="py-3 text-center bg-[#fdf2f6] rounded-2xl border border-pink-100">
						<p class="text-xs text-pink-400 font-bold">No other registered accounts found.</p>
					</div>
				{:else}
					<div class="space-y-2 max-h-56 overflow-y-auto pr-1">
						{#each suggestedUsers as sugUser (sugUser.id)}
							<div class="p-2.5 bg-white border border-pink-100/90 rounded-2xl flex items-center justify-between gap-2 shadow-2xs hover:border-pink-200 transition-all">
								<button
									type="button"
									onclick={() => handleViewUserProfile(sugUser.id)}
									class="flex items-center space-x-2.5 min-w-0 text-left group cursor-pointer"
								>
									<div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#f43f8e] to-[#ec4899] text-white font-black text-xs flex items-center justify-center flex-shrink-0 overflow-hidden shadow-2xs">
										{#if sugUser.avatar_url}
											<img src={sugUser.avatar_url} alt={sugUser.username} class="w-full h-full object-cover" />
										{:else}
											{sugUser.username?.charAt(0).toUpperCase()}
										{/if}
									</div>
									<div class="min-w-0">
										<p class="text-xs font-black text-[#e8367f] truncate group-hover:underline">@{sugUser.username}</p>
										<p class="text-[10px] text-pink-950/60 truncate font-medium">{sugUser.email || 'Member'}</p>
									</div>
								</button>

								<div class="flex items-center space-x-1.5 flex-shrink-0">
									<button
										type="button"
										onclick={() => handleViewUserProfile(sugUser.id)}
										class="px-2.5 py-1 bg-pink-50 hover:bg-pink-100 text-[#f43f8e] border border-pink-100 text-xs font-bold rounded-xl cursor-pointer active:scale-95 transition-all"
									>
										Profile
									</button>

									{#if sugUser.relationship === 'friends'}
										<span class="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black rounded-xl">Friends</span>
									{:else if sugUser.relationship === 'request_sent'}
										<button
											type="button"
											onclick={() => handleCancelFriendRequestFromSearch(sugUser)}
											disabled={cancelingFriendUserId === sugUser.id}
											class="px-2.5 py-1 bg-white hover:bg-rose-50 text-pink-600 hover:text-rose-600 border border-pink-200 text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer disabled:opacity-50"
										>
											{#if cancelingFriendUserId === sugUser.id}
												Canceling...
											{:else}
												Cancel
											{/if}
										</button>
									{:else if sugUser.relationship === 'request_received'}
										<button
											type="button"
											onclick={() => handleRespond(sugUser.request_id, 'accept')}
											class="px-2.5 py-1 bg-[#f43f8e] hover:bg-[#e0337f] text-white text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-xs"
										>
											Accept
										</button>
									{:else}
										<button
											type="button"
											onclick={() => sendFriendRequestToUser(sugUser)}
											disabled={addingFriendUserId === sugUser.id}
											class="px-2.5 py-1 bg-[#f43f8e] hover:bg-[#e0337f] text-white text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-xs disabled:opacity-50"
										>
											{#if addingFriendUserId === sugUser.id}
												Sending...
											{:else}
												+ Add Friend
											{/if}
										</button>
									{/if}
								</div>
							</div>
						{/each}

						<!-- Lazy Loading Load More Button -->
						{#if hasMoreSuggested}
							<div class="pt-2 text-center">
								<button
									type="button"
									onclick={handleLoadMoreSuggested}
									disabled={isLoadingSuggested}
									class="px-3.5 py-1.5 bg-[#fdf2f6] hover:bg-pink-100 text-pink-950 rounded-xl text-xs font-bold border border-pink-200/80 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
								>
									{#if isLoadingSuggested}
										<span>Loading 20 more...</span>
									{:else}
										<span>Load More Users (20)</span>
									{/if}
								</button>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Pending Requests Received Section -->
			{#if pendingRequests.length > 0}
				<div class="mt-4 pt-3.5 border-t border-pink-100">
					<h3 class="text-xs font-black text-pink-950 mb-2.5 uppercase tracking-wide">Friend Requests Received ({pendingRequests.length})</h3>
					<div class="space-y-2 max-h-44 overflow-y-auto">
						{#each pendingRequests as request (request.id)}
							<div class="p-2.5 bg-white border border-pink-100/90 rounded-2xl flex items-center justify-between shadow-2xs">
								<button
									type="button"
									onclick={() => handleViewUserProfile(request.sender_id || request.id)}
									class="flex items-center space-x-2.5 text-left group cursor-pointer min-w-0"
								>
									<div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#f43f8e] to-[#ec4899] flex items-center justify-center text-white font-black text-xs overflow-hidden flex-shrink-0 shadow-2xs">
										{#if request.avatar_url}
											<img src={request.avatar_url} alt={request.username} class="w-full h-full object-cover" />
										{:else}
											{request.username?.charAt(0).toUpperCase()}
										{/if}
									</div>
									<div class="min-w-0">
										<p class="text-xs font-black text-[#e8367f] truncate group-hover:underline">@{request.username}</p>
										<p class="text-[10px] text-pink-950/60 truncate font-medium">{request.email}</p>
									</div>
								</button>
								<div class="flex items-center space-x-1.5 flex-shrink-0">
									<button
										onclick={() => handleRespond(request.id, 'accept')}
										disabled={isResponding}
										class="px-2.5 py-1 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 text-xs font-bold disabled:opacity-50 cursor-pointer active:scale-95 shadow-xs"
									>
										Accept
									</button>
									<button
										onclick={() => handleRespond(request.id, 'decline')}
										disabled={isResponding}
										class="px-2.5 py-1 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer active:scale-95"
									>
										Decline
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Sent Pending Requests Section -->
			{#if sentRequests.length > 0}
				<div class="mt-4 pt-3.5 border-t border-pink-100">
					<h3 class="text-xs font-black text-pink-950 mb-2.5 uppercase tracking-wide">Sent Requests Pending ({sentRequests.length})</h3>
					<div class="space-y-2 max-h-40 overflow-y-auto">
						{#each sentRequests as request (request.id)}
							<div class="p-2.5 bg-white border border-pink-100/90 rounded-2xl flex items-center justify-between shadow-2xs">
								<button
									type="button"
									onclick={() => handleViewUserProfile(request.receiver_id || request.id)}
									class="flex items-center space-x-2.5 text-left group cursor-pointer min-w-0"
								>
									<div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#f43f8e] to-[#ec4899] flex items-center justify-center text-white font-black text-xs overflow-hidden flex-shrink-0 shadow-2xs">
										{#if request.avatar_url}
											<img src={request.avatar_url} alt={request.username} class="w-full h-full object-cover" />
										{:else}
											{request.username?.charAt(0).toUpperCase()}
										{/if}
									</div>
									<div class="min-w-0">
										<p class="text-xs font-black text-[#e8367f] truncate group-hover:underline">@{request.username}</p>
										<p class="text-[10px] text-pink-400 font-bold">Waiting for response...</p>
									</div>
								</button>
								<button
									onclick={() => handleCancelSentRequest(request.id)}
									disabled={isResponding}
									class="px-2.5 py-1 bg-white hover:bg-rose-50 border border-pink-200 text-pink-600 hover:text-rose-600 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer active:scale-95"
								>
									Cancel
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}


