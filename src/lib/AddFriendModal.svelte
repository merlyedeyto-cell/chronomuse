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

	$effect(() => {
		isOpen = open;
		if (isOpen) {
			document.body.style.overflow = 'hidden';
			fetchPendingRequests();
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

		// 0ms Optimistic UI update
		const previousRel = targetUser.relationship;
		targetUser.relationship = 'request_sent';

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
			}
		} catch (err) {
			targetUser.relationship = previousRel;
			targetUser.request_id = previousReqId;
			console.error('Cancel friend request error:', err);
		} finally {
			isResponding = false;
		}
	}

	function fetchPendingRequests() {
		const user = getCurrentUser();
		if (!user || !user.id) return;

		fetch(API_ENDPOINTS.getFriendRequests, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ user_id: user.id })
		})
		.then(response => response.json())
		.then(data => {
			if (data.data) {
				pendingRequests = data.data.requests || [];
				sentRequests = data.data.sent_requests || [];
			}
		})
		.catch(error => {
			console.error('Error fetching pending requests:', error);
		});
	}

	function handleCancelSentRequest(requestId) {
		isResponding = true;
		const user = getCurrentUser();

		fetch(API_ENDPOINTS.cancelFriendRequest, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				user_id: user.id,
				request_id: requestId
			})
		})
		.then(response => response.json())
		.then(data => {
			isResponding = false;
			if (data.error) {
				errorMessage = data.error;
			} else {
				sentRequests = sentRequests.filter(r => r.id !== requestId);
			}
		})
		.catch(error => {
			isResponding = false;
			console.error('Cancel request error:', error);
		});
	}

	function handleRespond(requestId, action) {
		isResponding = true;
		const user = getCurrentUser();

		fetch(API_ENDPOINTS.respondToFriendRequest, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				user_id: user.id,
				request_id: requestId,
				action: action
			})
		})
		.then(response => response.json())
		.then(data => {
			isResponding = false;
			if (data.error) {
				errorMessage = data.error;
			} else {
				// Remove the responded request from the list
				pendingRequests = pendingRequests.filter(r => r.id !== requestId);
				dispatch('friendRequestResponded', { requestId, action, ...data });
			}
		})
		.catch(error => {
			isResponding = false;
			errorMessage = 'An error occurred. Please try again.';
			console.error('Respond error:', error);
		});
	}

	onMount(() => {
		if (isOpen) {
			fetchPendingRequests();
		}
	});
</script>

<!-- Backdrop Overlay -->
{#if isOpen}
	<div
		class="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300 flex items-center justify-center p-4 animate-modal-backdrop"
		class:opacity-0={isClosing}
		onclick={handleClose}
	>
		<!-- Modal Content -->
		<div
			class="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl p-8 border-2 border-pink-300 transition-all duration-300 max-w-md w-full relative animate-modal-content"
			class:opacity-0={isClosing}
			class:scale-95={isClosing}
			class:transform={isClosing}
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Close Button -->
			<button
				onclick={handleClose}
				class="absolute top-3 right-3 p-2 text-pink-400 hover:text-pink-600 hover:bg-pink-100 rounded-lg transition-all duration-200"
				title="Close"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<!-- Header -->
			<div class="text-center mb-6">
				<div class="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-r from-pink-400 to-pink-600 flex items-center justify-center">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8 text-white">
						<path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.941 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
					</svg>
				</div>
				<h2 class="text-2xl font-bold text-pink-500 mb-1">Add Friend</h2>
				<p class="text-pink-400 text-sm">Search for a friend by username</p>
			</div>

			<!-- Error Message -->
			{#if errorMessage}
				<div class="mb-5 p-3 bg-red-100 border border-red-300 rounded-xl text-red-700 text-sm">
					{errorMessage}
				</div>
			{/if}

			<!-- Success Message -->
			{#if successMessage}
				<div class="mb-5 p-3 bg-green-100 border border-green-300 rounded-xl text-green-700 text-sm">
					{successMessage}
				</div>
			{/if}

			<!-- Form / Search Bar -->
			<form onsubmit={(e) => { e.preventDefault(); performUserSearch(friendUsername.trim()); }} class="space-y-3 mb-4">
				<div>
					<label for="modal_friend_username" class="block text-xs font-semibold text-pink-600 mb-1.5">Search by Username</label>
					<div class="relative">
						<span class="absolute left-3.5 top-3 text-pink-400 font-bold text-sm">@</span>
						<input
							id="modal_friend_username"
							type="text"
							bind:value={friendUsername}
							oninput={handleSearchInput}
							placeholder="Type friend's username..."
							class="w-full pl-8 pr-10 py-2.5 bg-pink-50 border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-semibold text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all duration-200"
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
			</form>

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
						<span class="text-[10px] text-pink-400">Preview profile first</span>
					</div>

					<div class="space-y-2 max-h-56 overflow-y-auto pr-1">
						{#each searchResults as targetUser (targetUser.id)}
							<div class="p-2.5 bg-pink-50/90 border-2 border-pink-200 rounded-xl flex items-center justify-between gap-2 shadow-2xs">
								<button
									type="button"
									onclick={() => handleViewUserProfile(targetUser.id)}
									class="flex items-center space-x-2.5 min-w-0 text-left hover:opacity-85 transition-opacity group cursor-pointer"
									title="View @{targetUser.username}'s Profile"
								>
									<div class="w-9 h-9 rounded-full bg-gradient-to-tr from-pink-400 to-rose-500 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 overflow-hidden shadow-xs group-hover:scale-105 transition-transform">
										{#if targetUser.avatar_url}
											<img src={targetUser.avatar_url} alt={targetUser.username} class="w-full h-full object-cover" />
										{:else}
											{targetUser.username.charAt(0).toUpperCase()}
										{/if}
									</div>
									<div class="min-w-0">
										<p class="text-xs font-bold text-pink-900 truncate group-hover:underline">@{targetUser.username}</p>
										{#if targetUser.mutual_friends_count > 0}
											<p class="text-[10px] text-pink-600 font-semibold">✨ {targetUser.mutual_friends_count} mutual friend{targetUser.mutual_friends_count === 1 ? '' : 's'}</p>
										{:else}
											<p class="text-[10px] text-pink-400 truncate">{targetUser.email}</p>
										{/if}
									</div>
								</button>

								<div class="flex items-center space-x-1.5 flex-shrink-0">
									<!-- View Profile Button -->
									<button
										type="button"
										onclick={() => handleViewUserProfile(targetUser.id)}
										class="px-2 py-1 bg-white border border-pink-300 hover:bg-pink-50 text-pink-600 text-[11px] font-semibold rounded-lg transition-all"
										title="View Full Profile"
									>
										Profile
									</button>

									<!-- Action button -->
									{#if targetUser.relationship === 'self'}
										<span class="px-2 py-1 bg-pink-100 text-pink-500 text-[11px] font-semibold rounded-lg">You</span>
									{:else if targetUser.relationship === 'friends'}
										<span class="px-2 py-1 bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-lg">Friends</span>
									{:else if targetUser.relationship === 'request_sent'}
										<button
											type="button"
											onclick={() => handleCancelFriendRequestFromSearch(targetUser)}
											disabled={isResponding}
											class="px-2.5 py-1 bg-amber-50 hover:bg-red-50 text-amber-800 hover:text-red-600 border border-amber-300 hover:border-red-300 text-[11px] font-bold rounded-lg active:scale-95 transition-all shadow-2xs flex items-center space-x-1 cursor-pointer disabled:opacity-50"
											title="Cancel Friend Request"
										>
											<span>Cancel Add</span>
										</button>
									{:else if targetUser.relationship === 'request_received'}
										<button
											type="button"
											onclick={() => handleRespond(targetUser.request_id, 'accept')}
											class="px-2.5 py-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-[11px] font-bold rounded-lg shadow-xs"
										>
											Accept
										</button>
									{:else}
										<button
											type="button"
											onclick={() => sendFriendRequestToUser(targetUser)}
											disabled={isLoading}
											class="px-2.5 py-1 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 active:scale-95 text-white text-[11px] font-bold rounded-lg shadow-xs disabled:opacity-50"
										>
											Add
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else if hasSearched && friendUsername.trim()}
				<div class="mb-4 text-center py-6 bg-pink-50/50 rounded-xl border border-dashed border-pink-200">
					<p class="text-xs font-bold text-pink-700">No user found matching "@{friendUsername.trim()}"</p>
					<p class="text-[10px] text-pink-400 mt-0.5">Please check the spelling and try again.</p>
				</div>
			{/if}

			<!-- Pending Incoming Requests Section -->
			{#if pendingRequests.length > 0}
				<div class="mt-6 pt-6 border-t-2 border-pink-200">
					<h3 class="text-lg font-bold text-pink-500 mb-4 text-center">Friend Requests Received</h3>
					<div class="space-y-3 max-h-48 overflow-y-auto">
						{#each pendingRequests as request (request.id)}
							<div class="p-3 bg-pink-50 border-2 border-pink-200 rounded-xl flex items-center justify-between">
								<button
									type="button"
									onclick={() => handleViewUserProfile(request.sender_id || request.id)}
									class="flex items-center space-x-3 text-left hover:opacity-85 transition-opacity group cursor-pointer min-w-0"
									title="View @{request.username}'s Profile"
								>
									<div class="w-10 h-10 rounded-full bg-gradient-to-r from-pink-400 to-pink-600 flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
										{#if request.avatar_url}
											<img src={request.avatar_url} alt={request.username} class="w-full h-full object-cover" />
										{:else}
											{request.username.charAt(0).toUpperCase()}
										{/if}
									</div>
									<div class="min-w-0">
										<p class="text-sm font-semibold text-pink-700 truncate group-hover:underline">@{request.username}</p>
										<p class="text-xs text-pink-400 truncate">{request.email}</p>
									</div>
								</button>
								<div class="flex items-center space-x-1.5 flex-shrink-0">
									<button
										type="button"
										onclick={() => handleViewUserProfile(request.sender_id || request.id)}
										class="px-2 py-1 bg-white border border-pink-300 text-pink-600 hover:bg-pink-100 rounded-lg text-xs font-semibold transition-all shadow-2xs cursor-pointer"
										title="View Profile"
									>
										Profile
									</button>
									<button
										onclick={() => handleRespond(request.id, 'accept')}
										disabled={isResponding}
										class="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all duration-200 disabled:opacity-50 cursor-pointer"
										title="Accept"
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
										</svg>
									</button>
									<button
										onclick={() => handleRespond(request.id, 'decline')}
										disabled={isResponding}
										class="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all duration-200 disabled:opacity-50 cursor-pointer"
										title="Decline"
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Sent Pending Requests Section (Cancel Add) -->
			{#if sentRequests.length > 0}
				<div class="mt-6 pt-6 border-t-2 border-pink-200">
					<h3 class="text-lg font-bold text-pink-500 mb-4 text-center">Sent Requests (Pending)</h3>
					<div class="space-y-3 max-h-48 overflow-y-auto">
						{#each sentRequests as request (request.id)}
							<div class="p-3 bg-pink-50 border-2 border-pink-200 rounded-xl flex items-center justify-between">
								<button
									type="button"
									onclick={() => handleViewUserProfile(request.receiver_id || request.id)}
									class="flex items-center space-x-3 text-left hover:opacity-85 transition-opacity group cursor-pointer min-w-0"
									title="View @{request.username}'s Profile"
								>
									<div class="w-10 h-10 rounded-full bg-gradient-to-r from-pink-400 to-pink-600 flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
										{#if request.avatar_url}
											<img src={request.avatar_url} alt={request.username} class="w-full h-full object-cover" />
										{:else}
											{request.username.charAt(0).toUpperCase()}
										{/if}
									</div>
									<div class="min-w-0">
										<p class="text-sm font-semibold text-pink-700 truncate group-hover:underline">@{request.username}</p>
										<p class="text-xs text-pink-400">Pending approval...</p>
									</div>
								</button>
								<div class="flex items-center space-x-1.5 flex-shrink-0">
									<button
										type="button"
										onclick={() => handleViewUserProfile(request.receiver_id || request.id)}
										class="px-2 py-1 bg-white border border-pink-300 text-pink-600 hover:bg-pink-100 rounded-lg text-xs font-semibold transition-all shadow-2xs cursor-pointer"
										title="View Profile"
									>
										Profile
									</button>
									<button
										onclick={() => handleCancelSentRequest(request.id)}
										disabled={isResponding}
										class="px-2.5 py-1 bg-amber-50 hover:bg-red-50 border border-amber-300 hover:border-red-300 text-amber-800 hover:text-red-600 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
									>
										Cancel Add
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Info Text -->
			<div class="mt-6 p-4 bg-pink-50 border border-pink-200 rounded-xl">
				<p class="text-xs text-pink-600 text-center">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 inline mr-1">
						<path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
					</svg>
					Your friend will receive a notification and can accept or decline your request.
				</p>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Prevent body scroll when modal is open */
	:global(body.modal-open) {
		overflow: hidden;
	}

	@keyframes modal-backdrop {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes modal-content {
		from {
			opacity: 0;
			transform: scale(0.9) translateY(-20px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.animate-modal-backdrop {
		animation: modal-backdrop 0.3s ease-out;
	}

	.animate-modal-content {
		animation: modal-content 0.3s ease-out cubic-bezier(0.34, 1.56, 0.64, 1);
	}
</style>
