<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';

	const dispatch = createEventDispatcher();

	let { open = false } = $props();
	let isOpen = $state(open);
	let isClosing = $state(false);
	let isLoading = $state(false);
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
			fetchPendingRequests();
			loadSuggestedUsers(1, false);
		} else {
			document.body.style.overflow = '';
		}
	});

	function handleClose() {
		isClosing = true;
		setTimeout(() => {
			isOpen = false;
			isClosing = false;
			errorMessage = '';
			successMessage = '';
			friendUsername = '';
			searchResults = [];
			hasSearched = false;
			document.body.style.overflow = '';
			dispatch('close');
		}, 300);
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
		isLoading = true;
		errorMessage = '';
		successMessage = '';

		const user = getCurrentUser();
		if (!user || !user.id) {
			isLoading = false;
			errorMessage = 'Please log in first.';
			return;
		}

		const previousRel = targetUser.relationship;
		targetUser.relationship = 'request_sent';

		// Also update inside suggestedUsers if present
		suggestedUsers = suggestedUsers.map(su => su.id === targetUser.id ? { ...su, relationship: 'request_sent' } : su);

		try {
			const res = await fetch(API_ENDPOINTS.addFriend, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					friend_username: targetUser.username,
					user_id: user.id
				})
			});
			const data = await res.json();
			isLoading = false;
			if (data.error) {
				targetUser.relationship = previousRel;
				suggestedUsers = suggestedUsers.map(su => su.id === targetUser.id ? { ...su, relationship: previousRel } : su);
				errorMessage = data.error;
			} else {
				successMessage = data.message || `Friend request sent to @${targetUser.username}!`;
				targetUser.request_id = data.request_id || null;
				fetchPendingRequests();
				dispatch('addFriend', data);
				setTimeout(() => {
					successMessage = '';
				}, 3000);
			}
		} catch (error) {
			isLoading = false;
			targetUser.relationship = previousRel;
			suggestedUsers = suggestedUsers.map(su => su.id === targetUser.id ? { ...su, relationship: previousRel } : su);
			errorMessage = 'An error occurred. Please try again.';
			console.error('Add friend error:', error);
		}
	}

	async function handleCancelFriendRequestFromSearch(targetUser) {
		const user = getCurrentUser();
		if (!user || !user.id || isResponding) return;
		isResponding = true;
		const previousRel = targetUser.relationship;
		const previousReqId = targetUser.request_id;
		targetUser.relationship = 'none';
		targetUser.request_id = null;

		suggestedUsers = suggestedUsers.map(su => su.id === targetUser.id ? { ...su, relationship: 'none', request_id: null } : su);

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
			isResponding = false;
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
		sentRequests = sentRequests.filter(r => r.id !== requestId);

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
				successMessage = data.message || 'Friend request cancelled';
				fetchPendingRequests();
				loadSuggestedUsers(1, false);
				dispatch('friendStatusChanged');
				setTimeout(() => {
					successMessage = '';
				}, 3000);
			} else {
				sentRequests = backupSent;
				errorMessage = data.error || 'Failed to cancel request';
			}
		} catch (error) {
			sentRequests = backupSent;
			errorMessage = 'An error occurred. Please try again.';
			console.error('Cancel sent request error:', error);
		} finally {
			isResponding = false;
		}
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-modal-backdrop overflow-y-auto"
		class:opacity-0={isClosing}
		class:pointer-events-none={isClosing}
		onclick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
	>
		<div
			class="bg-white border-2 border-pink-300 rounded-2xl max-w-lg w-full p-4 sm:p-6 relative transition-all duration-300 animate-modal-content my-auto max-h-[90vh] overflow-y-auto"
			class:opacity-0={isClosing}
			class:scale-95={isClosing}
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Close Button -->
			<button
				onclick={handleClose}
				class="absolute top-3.5 right-3.5 p-1 text-pink-400 hover:text-pink-600 hover:bg-pink-100 rounded-lg transition-all duration-200 cursor-pointer"
				title="Close"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<!-- Header -->
			<div class="text-center mb-4 pr-6">
				<div class="w-12 h-12 bg-pink-100 rounded-2xl border border-pink-300 flex items-center justify-center mx-auto mb-2 text-pink-500">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.765z" />
					</svg>
				</div>
				<h2 class="text-base sm:text-lg font-bold text-pink-600">Find & Add Friends</h2>
				<p class="text-[11px] sm:text-xs text-pink-400 mt-0.5">Search or discover registered users to connect on ChronoMuse</p>
			</div>

			<!-- Success Message -->
			{#if successMessage}
				<div class="mb-4 p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-semibold flex items-center space-x-2">
					<svg class="w-4 h-4 text-emerald-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
					</svg>
					<span>{successMessage}</span>
				</div>
			{/if}

			<!-- Error Message -->
			{#if errorMessage}
				<div class="mb-4 p-2.5 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 font-semibold flex items-center space-x-2">
					<svg class="w-4 h-4 text-rose-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
					</svg>
					<span>{errorMessage}</span>
				</div>
			{/if}

			<!-- Search Bar -->
			<div class="mb-4">
				<label for="modal_friend_username" class="block text-xs font-bold text-pink-700 mb-1">Search by Username</label>
				<div class="relative">
					<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-pink-400">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
						</svg>
					</div>
					<input
						id="modal_friend_username"
						type="text"
						bind:value={friendUsername}
						oninput={handleSearchInput}
						placeholder="Type friend's username..."
						class="w-full pl-9 pr-9 py-2.5 bg-pink-50 border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-semibold text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all"
					/>
					{#if friendUsername}
						<button
							type="button"
							onclick={() => { friendUsername = ''; searchResults = []; hasSearched = false; }}
							class="absolute right-3 top-2.5 p-1 text-pink-400 hover:text-pink-600 rounded-full"
							title="Clear search"
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
								<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
							</svg>
						</button>
					{/if}
				</div>
			</div>

			<!-- Search Results List -->
			{#if isSearching}
				<div class="text-center py-6">
					<div class="animate-spin h-6 w-6 border-3 border-pink-200 border-t-pink-500 rounded-full mx-auto mb-2"></div>
					<p class="text-xs text-pink-400">Searching users...</p>
				</div>
			{:else if searchResults.length > 0}
				<div class="mb-5 space-y-2">
					<div class="flex items-center justify-between">
						<h3 class="text-xs font-bold text-pink-600 uppercase tracking-wide">
							Search Results ({searchResults.length})
						</h3>
					</div>

					<div class="space-y-2 max-h-52 overflow-y-auto pr-1">
						{#each searchResults as targetUser (targetUser.id)}
							<div class="p-2.5 bg-pink-50 border-2 border-pink-200 rounded-xl flex items-center justify-between gap-2">
								<button
									type="button"
									onclick={() => handleViewUserProfile(targetUser.id)}
									class="flex items-center space-x-2.5 min-w-0 text-left group cursor-pointer"
								>
									<div class="w-8 h-8 rounded-full bg-pink-500 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 overflow-hidden">
										{#if targetUser.avatar_url}
											<img src={targetUser.avatar_url} alt={targetUser.username} class="w-full h-full object-cover" />
										{:else}
											{targetUser.username.charAt(0).toUpperCase()}
										{/if}
									</div>
									<div class="min-w-0">
										<p class="text-xs font-bold text-pink-900 truncate group-hover:underline">@{targetUser.username}</p>
										{#if targetUser.mutual_friends_count > 0}
											<p class="text-[10px] text-pink-600 font-semibold">{targetUser.mutual_friends_count} mutual friend{targetUser.mutual_friends_count === 1 ? '' : 's'}</p>
										{:else}
											<p class="text-[10px] text-pink-400 truncate">{targetUser.email}</p>
										{/if}
									</div>
								</button>

								<div class="flex items-center space-x-1.5 flex-shrink-0">
									<button
										type="button"
										onclick={() => handleViewUserProfile(targetUser.id)}
										class="px-2 py-1 bg-white border border-pink-300 hover:bg-pink-100 text-pink-600 text-[11px] font-semibold rounded-lg"
									>
										Profile
									</button>

									{#if targetUser.relationship === 'self'}
										<span class="px-2 py-1 bg-pink-100 text-pink-500 text-[11px] font-semibold rounded-lg">You</span>
									{:else if targetUser.relationship === 'friends'}
										<span class="px-2 py-1 bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-lg">Friends</span>
									{:else if targetUser.relationship === 'request_sent'}
										<button
											type="button"
											onclick={() => handleCancelFriendRequestFromSearch(targetUser)}
											disabled={isResponding}
											class="px-2.5 py-1 bg-amber-50 hover:bg-red-50 text-amber-800 hover:text-red-600 border border-amber-300 hover:border-red-300 text-[11px] font-bold rounded-lg active:scale-95 transition-all cursor-pointer disabled:opacity-50"
										>
											Cancel
										</button>
									{:else if targetUser.relationship === 'request_received'}
										<button
											type="button"
											onclick={() => handleRespond(targetUser.request_id, 'accept')}
											class="px-2.5 py-1 bg-pink-500 hover:bg-pink-600 text-white text-[11px] font-bold rounded-lg"
										>
											Accept
										</button>
									{:else}
										<button
											type="button"
											onclick={() => sendFriendRequestToUser(targetUser)}
											disabled={isLoading}
											class="px-2.5 py-1 bg-pink-500 hover:bg-pink-600 text-white text-[11px] font-bold rounded-lg disabled:opacity-50"
										>
											Add Friend
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else if hasSearched && friendUsername.trim()}
				<div class="mb-4 text-center py-4 bg-pink-50 rounded-xl border border-pink-200">
					<p class="text-xs font-bold text-pink-700">No user found matching "@{friendUsername.trim()}"</p>
					<p class="text-[10px] text-pink-400 mt-0.5">Please check the spelling and try again.</p>
				</div>
			{/if}

			<!-- Suggested / Discover Random People Section (Lazy Loaded 20/batch) -->
			<div class="mt-4 pt-4 border-t-2 border-pink-200">
				<div class="flex items-center justify-between mb-3">
					<div>
						<h3 class="text-xs sm:text-sm font-bold text-pink-700 uppercase tracking-wide">
							Discover People on ChronoMuse
						</h3>
						<p class="text-[10px] text-pink-400">Add people to share memories and chat</p>
					</div>
					<button
						type="button"
						onclick={() => loadSuggestedUsers(1, false)}
						class="text-[11px] text-pink-600 hover:text-pink-800 font-bold underline cursor-pointer"
					>
						Refresh
					</button>
				</div>

				{#if suggestedUsers.length === 0 && isLoadingSuggested}
					<div class="py-8 text-center">
						<div class="animate-spin h-6 w-6 border-3 border-pink-200 border-t-pink-500 rounded-full mx-auto mb-2"></div>
						<p class="text-xs text-pink-400">Loading suggested users...</p>
					</div>
				{:else if suggestedUsers.length === 0}
					<div class="py-4 text-center bg-pink-50 rounded-xl border border-pink-200">
						<p class="text-xs text-pink-500 font-semibold">No other registered accounts found.</p>
					</div>
				{:else}
					<div class="space-y-2 max-h-60 overflow-y-auto pr-1">
						{#each suggestedUsers as sugUser (sugUser.id)}
							<div class="p-2.5 bg-pink-50 border border-pink-200 rounded-xl flex items-center justify-between gap-2">
								<button
									type="button"
									onclick={() => handleViewUserProfile(sugUser.id)}
									class="flex items-center space-x-2.5 min-w-0 text-left group cursor-pointer"
								>
									<div class="w-8 h-8 rounded-full bg-pink-500 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 overflow-hidden">
										{#if sugUser.avatar_url}
											<img src={sugUser.avatar_url} alt={sugUser.username} class="w-full h-full object-cover" />
										{:else}
											{sugUser.username?.charAt(0).toUpperCase()}
										{/if}
									</div>
									<div class="min-w-0">
										<p class="text-xs font-bold text-pink-900 truncate group-hover:underline">@{sugUser.username}</p>
										<p class="text-[10px] text-pink-400 truncate">{sugUser.email || 'Member'}</p>
									</div>
								</button>

								<div class="flex items-center space-x-1.5 flex-shrink-0">
									<button
										type="button"
										onclick={() => handleViewUserProfile(sugUser.id)}
										class="px-2 py-1 bg-white border border-pink-300 hover:bg-pink-100 text-pink-600 text-[11px] font-semibold rounded-lg"
									>
										Profile
									</button>

									{#if sugUser.relationship === 'friends'}
										<span class="px-2 py-1 bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-lg">Friends</span>
									{:else if sugUser.relationship === 'request_sent'}
										<button
											type="button"
											onclick={() => handleCancelFriendRequestFromSearch(sugUser)}
											disabled={isResponding}
											class="px-2.5 py-1 bg-amber-50 hover:bg-red-50 text-amber-800 hover:text-red-600 border border-amber-300 hover:border-red-300 text-[11px] font-bold rounded-lg active:scale-95 transition-all cursor-pointer disabled:opacity-50"
										>
											Cancel
										</button>
									{:else if sugUser.relationship === 'request_received'}
										<button
											type="button"
											onclick={() => handleRespond(sugUser.request_id, 'accept')}
											class="px-2.5 py-1 bg-pink-500 hover:bg-pink-600 text-white text-[11px] font-bold rounded-lg"
										>
											Accept
										</button>
									{:else}
										<button
											type="button"
											onclick={() => sendFriendRequestToUser(sugUser)}
											disabled={isLoading}
											class="px-2.5 py-1 bg-pink-500 hover:bg-pink-600 text-white text-[11px] font-bold rounded-lg disabled:opacity-50"
										>
											+ Add Friend
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
									class="px-4 py-1.5 bg-pink-100 hover:bg-pink-200 text-pink-700 rounded-xl text-xs font-bold border border-pink-300 transition-all cursor-pointer disabled:opacity-50"
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
				<div class="mt-5 pt-4 border-t-2 border-pink-200">
					<h3 class="text-xs font-bold text-pink-700 mb-3 uppercase tracking-wide">Friend Requests Received ({pendingRequests.length})</h3>
					<div class="space-y-2 max-h-44 overflow-y-auto">
						{#each pendingRequests as request (request.id)}
							<div class="p-2.5 bg-pink-50 border border-pink-200 rounded-xl flex items-center justify-between">
								<button
									type="button"
									onclick={() => handleViewUserProfile(request.sender_id || request.id)}
									class="flex items-center space-x-2.5 text-left group cursor-pointer min-w-0"
								>
									<div class="w-8 h-8 rounded-full bg-pink-500 flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0">
										{#if request.avatar_url}
											<img src={request.avatar_url} alt={request.username} class="w-full h-full object-cover" />
										{:else}
											{request.username?.charAt(0).toUpperCase()}
										{/if}
									</div>
									<div class="min-w-0">
										<p class="text-xs font-semibold text-pink-700 truncate group-hover:underline">@{request.username}</p>
										<p class="text-[10px] text-pink-400 truncate">{request.email}</p>
									</div>
								</button>
								<div class="flex items-center space-x-1.5 flex-shrink-0">
									<button
										onclick={() => handleRespond(request.id, 'accept')}
										disabled={isResponding}
										class="px-2.5 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-bold disabled:opacity-50 cursor-pointer"
									>
										Accept
									</button>
									<button
										onclick={() => handleRespond(request.id, 'decline')}
										disabled={isResponding}
										class="px-2.5 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-700 text-xs font-bold disabled:opacity-50 cursor-pointer"
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
				<div class="mt-5 pt-4 border-t-2 border-pink-200">
					<h3 class="text-xs font-bold text-pink-700 mb-3 uppercase tracking-wide">Sent Requests Pending ({sentRequests.length})</h3>
					<div class="space-y-2 max-h-40 overflow-y-auto">
						{#each sentRequests as request (request.id)}
							<div class="p-2.5 bg-pink-50 border border-pink-200 rounded-xl flex items-center justify-between">
								<button
									type="button"
									onclick={() => handleViewUserProfile(request.receiver_id || request.id)}
									class="flex items-center space-x-2.5 text-left group cursor-pointer min-w-0"
								>
									<div class="w-8 h-8 rounded-full bg-pink-500 flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0">
										{#if request.avatar_url}
											<img src={request.avatar_url} alt={request.username} class="w-full h-full object-cover" />
										{:else}
											{request.username?.charAt(0).toUpperCase()}
										{/if}
									</div>
									<div class="min-w-0">
										<p class="text-xs font-semibold text-pink-700 truncate group-hover:underline">@{request.username}</p>
										<p class="text-[10px] text-pink-400">Waiting for response...</p>
									</div>
								</button>
								<button
									onclick={() => handleCancelSentRequest(request.id)}
									disabled={isResponding}
									class="px-2.5 py-1 bg-amber-50 hover:bg-red-50 border border-amber-300 hover:border-red-300 text-amber-800 hover:text-red-600 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
								>
									Cancel Add
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	@keyframes modal-backdrop {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes modal-content {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}

	.animate-modal-backdrop {
		animation: modal-backdrop 0.2s ease-out;
	}

	.animate-modal-content {
		animation: modal-content 0.25s ease-out;
	}
</style>
