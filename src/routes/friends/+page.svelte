<script>
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import { broadcastFriendEvent } from '$lib/realtimeBroadcast.js';
	import Sidebar from '$lib/Sidebar.svelte';

	let user = $state(typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('chronomuse_user') || 'null') : null);
	let isLoading = $state(false);
	let hasLoadedOnce = $state(false);
	let activeTab = $state('friends'); // 'friends', 'add', 'pending'
	let autoSyncInterval = null;

	// Friends List State
	let friends = $state([]);
	let friendsSearchQuery = $state('');
	let isFetchingFriends = $state(false);
	let friendToRemove = $state(null);
	let showConfirmDelete = $state(false);
	let isRemoving = $state(false);

	// Add Friend / Search User State
	let friendUsername = $state('');
	let isAddingFriend = $state(false);
	let addFriendError = $state('');
	let addFriendSuccess = $state('');
	let searchResults = $state([]);
	let isSearchingUsers = $state(false);
	let hasSearched = $state(false);
	let searchDebounceTimer = null;

	// Pending Requests State
	let pendingRequests = $state([]); // Incoming
	let sentRequests = $state([]); // Outgoing
	let isFetchingRequests = $state(false);
	let isResponding = $state(false);

	onMount(() => {
		const storedUser = localStorage.getItem('chronomuse_user');
		if (storedUser) {
			user = JSON.parse(storedUser);
			loadAllData();
		} else {
			goto('/');
		}
		isLoading = false;
		hasLoadedOnce = true;

		const handleRealtimeUpdate = (e) => {
			if (user && user.id) {
				fetchFriends(true);
				fetchPendingRequests(true);
			}
		};

		window.addEventListener('chronomuse_friend_change', handleRealtimeUpdate);
		window.addEventListener('chronomuse_notification_change', handleRealtimeUpdate);

		// Fast periodic polling to ensure zero delay across different tabs/browsers without flashing loading state
		autoSyncInterval = setInterval(() => {
			if (user && user.id) {
				fetchFriends(true);
				fetchPendingRequests(true);
			}
		}, 2500);

		return () => {
			window.removeEventListener('chronomuse_friend_change', handleRealtimeUpdate);
			window.removeEventListener('chronomuse_notification_change', handleRealtimeUpdate);
			if (autoSyncInterval) clearInterval(autoSyncInterval);
		};
	});

	function loadAllData() {
		fetchFriends(false);
		fetchPendingRequests(false);
	}

	function syncSearchResultsWithState() {
		if (!searchResults || searchResults.length === 0) return;
		const sentIds = new Set((sentRequests || []).map(r => Number(r.receiver_id || r.id)));
		const friendIds = new Set((friends || []).map(f => Number(f.friend_id || f.id)));
		const incomingSenderIds = new Set((pendingRequests || []).map(r => Number(r.sender_id || r.id)));

		searchResults = searchResults.map(u => {
			const uId = Number(u.id);
			if (u.relationship === 'self') return u;

			if (friendIds.has(uId)) {
				return { ...u, relationship: 'friends' };
			}
			if (sentIds.has(uId)) {
				const req = sentRequests.find(r => Number(r.receiver_id || r.id) === uId);
				return { ...u, relationship: 'request_sent', request_id: req?.id || req?.request_id || u.request_id };
			}
			if (incomingSenderIds.has(uId)) {
				const req = pendingRequests.find(r => Number(r.sender_id || r.id) === uId);
				return { ...u, relationship: 'request_received', request_id: req?.id || req?.request_id || u.request_id };
			}
			// If not in friends, sent, or incoming, relationship is 'none'
			if (u.relationship === 'request_sent' || u.relationship === 'request_received') {
				return { ...u, relationship: 'none', request_id: null };
			}
			return u;
		});
	}

	function fetchFriends(isSilent = false) {
		if (!user || !user.id) return;
		if (!isSilent && friends.length === 0) {
			isFetchingFriends = true;
		}

		fetch(API_ENDPOINTS.getFriendsList, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ user_id: user.id })
		})
		.then(res => res.json())
		.then(data => {
			isFetchingFriends = false;
			if (data.data) {
				friends = data.data.friends || [];
				syncSearchResultsWithState();
			}
		})
		.catch(err => {
			isFetchingFriends = false;
			console.error('Error fetching friends:', err);
		});
	}

	function fetchPendingRequests(isSilent = false) {
		if (!user || !user.id) return;
		if (!isSilent && pendingRequests.length === 0 && sentRequests.length === 0) {
			isFetchingRequests = true;
		}

		fetch(API_ENDPOINTS.getFriendRequests, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ user_id: user.id })
		})
		.then(res => res.json())
		.then(data => {
			isFetchingRequests = false;
			if (data.data) {
				pendingRequests = data.data.requests || [];
				sentRequests = data.data.sent_requests || [];
				syncSearchResultsWithState();
			}
		})
		.catch(err => {
			isFetchingRequests = false;
			console.error('Error fetching pending requests:', err);
		});
	}

	let searchAbortController = null;

	function handleSearchInput() {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		if (searchAbortController) searchAbortController.abort();

		const query = friendUsername.trim();
		if (!query) {
			searchResults = [];
			hasSearched = false;
			isSearchingUsers = false;
			return;
		}
		isSearchingUsers = true;
		searchDebounceTimer = setTimeout(() => {
			performUserSearch(query, false);
		}, 300);
	}

	async function performUserSearch(query, isSilent = false) {
		if (!user || !user.id || !query) return;
		if (searchAbortController) {
			searchAbortController.abort();
		}
		searchAbortController = new AbortController();

		if (!isSilent && searchResults.length === 0) {
			isSearchingUsers = true;
		}
		hasSearched = true;
		if (!isSilent) {
			addFriendError = '';
			addFriendSuccess = '';
		}

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
			} else if (!isSilent) {
				searchResults = [];
			}
		} catch (err) {
			if (err.name === 'AbortError') return;
			console.error('Search users error:', err);
			if (!isSilent) searchResults = [];
		} finally {
			isSearchingUsers = false;
		}
	}

	function handleAddFriendSubmit(e) {
		if (e) e.preventDefault();
		const query = friendUsername.trim();
		if (!query) return;
		performUserSearch(query);
	}

	async function sendFriendRequestToUser(targetUser) {
		if (!user || !user.id || isAddingFriend) return;
		isAddingFriend = true;
		addFriendError = '';
		addFriendSuccess = '';

		// 0ms Optimistic UI update
		const previousRel = targetUser.relationship;
		targetUser.relationship = 'request_sent';

		// Instant client-side broadcast
		broadcastFriendEvent(user.id, targetUser.id, 'friend_request');

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
			if (data.error) {
				targetUser.relationship = previousRel;
				addFriendError = data.error;
			} else {
				addFriendSuccess = data.message || `Friend request sent to @${targetUser.username}!`;
				targetUser.request_id = data.request_id || null;
				fetchPendingRequests();
				broadcastFriendEvent(user.id, targetUser.id, 'friend_request');
				setTimeout(() => {
					addFriendSuccess = '';
				}, 3000);
			}
		} catch (err) {
			targetUser.relationship = previousRel;
			addFriendError = 'An error occurred. Please try again.';
			console.error('Add friend error:', err);
		} finally {
			isAddingFriend = false;
		}
	}

	async function handleCancelFriendRequestFromSearch(targetUser) {
		if (!user || !user.id || isResponding) return;
		isResponding = true;
		const previousRel = targetUser.relationship;
		const previousReqId = targetUser.request_id;
		// Optimistic instant toggle to Add Friend
		targetUser.relationship = 'none';
		targetUser.request_id = null;

		broadcastFriendEvent(user.id, targetUser.id, 'cancel_request');

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
				broadcastFriendEvent(user.id, targetUser.id, 'cancel_request');
			} else {
				targetUser.relationship = previousRel;
				targetUser.request_id = previousReqId;
				alert(data.error || 'Failed to cancel request');
			}
		} catch (err) {
			targetUser.relationship = previousRel;
			targetUser.request_id = previousReqId;
			console.error('Cancel friend request error:', err);
		} finally {
			isResponding = false;
		}
	}

	function handleRespondRequest(requestId, action) {
		if (!user || !user.id || isResponding) return;
		isResponding = true;

		// 0ms Optimistic UI removal and addition
		const reqItem = pendingRequests.find(r => r.id === requestId || r.request_id === requestId);
		const targetSenderId = reqItem?.sender_id || reqItem?.id;
		const prevPending = [...pendingRequests];
		const prevFriends = [...friends];

		pendingRequests = pendingRequests.filter(r => r.id !== requestId && r.request_id !== requestId);
		if (action === 'accept' && reqItem) {
			friends = [
				{
					id: targetSenderId,
					friend_id: targetSenderId,
					username: reqItem.username || reqItem.sender_username,
					email: reqItem.email || reqItem.sender_email,
					avatar_url: reqItem.avatar_url || reqItem.sender_avatar_url,
					last_activity: new Date().toISOString()
				},
				...friends
			];
		}

		broadcastFriendEvent(user.id, targetSenderId, action === 'accept' ? 'accept_request' : 'decline_request');

		fetch(API_ENDPOINTS.respondToFriendRequest, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				request_id: requestId,
				action,
				user_id: user.id
			})
		})
		.then(res => res.json())
		.then(data => {
			isResponding = false;
			if (data.success) {
				fetchPendingRequests();
				fetchFriends();
				broadcastFriendEvent(user.id, targetSenderId, action === 'accept' ? 'accept_request' : 'decline_request');
			} else {
				pendingRequests = prevPending;
				friends = prevFriends;
				alert('Error: ' + (data.error || 'Failed to respond'));
			}
		})
		.catch(err => {
			isResponding = false;
			pendingRequests = prevPending;
			friends = prevFriends;
			console.error('Error responding to request:', err);
		});
	}

	function handleCancelSentRequest(requestId) {
		if (!user || !user.id) return;
		// 0ms instant optimistic removal
		const reqItem = sentRequests.find(r => r.id === requestId || r.request_id === requestId);
		const targetReceiverId = reqItem?.receiver_id || reqItem?.id;
		const backupSent = [...sentRequests];
		sentRequests = sentRequests.filter(r => r.id !== requestId && r.request_id !== requestId);

		broadcastFriendEvent(user.id, targetReceiverId, 'cancel_request');

		fetch(API_ENDPOINTS.cancelFriendRequest, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				request_id: requestId,
				user_id: user.id
			})
		})
		.then(res => res.json())
		.then(data => {
			if (data.success) {
				broadcastFriendEvent(user.id, targetReceiverId, 'cancel_request');
			} else {
				sentRequests = backupSent;
				alert('Error: ' + (data.error || 'Failed to cancel request'));
			}
		})
		.catch(err => {
			sentRequests = backupSent;
			console.error('Error cancelling request:', err);
		});
	}

	function handleRemoveFriend(friend) {
		friendToRemove = friend;
		showConfirmDelete = true;
	}

	function confirmRemoveFriend() {
		if (!friendToRemove || !user || !user.id || isRemoving) return;
		isRemoving = true;
		const targetFriendId = friendToRemove.friend_id || friendToRemove.id;
		const prevFriends = [...friends];

		// Optimistic UI update
		friends = friends.filter(f => (f.friend_id || f.id) !== targetFriendId);

		broadcastFriendEvent(user.id, targetFriendId, 'unfriend');

		fetch(API_ENDPOINTS.removeFriend, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				user_id: user.id,
				friend_id: targetFriendId,
				friendship_id: friendToRemove.friendship_id || null
			})
		})
		.then(res => res.json())
		.then(data => {
			isRemoving = false;
			showConfirmDelete = false;
			friendToRemove = null;
			if (data.success) {
				fetchFriends();
				broadcastFriendEvent(user.id, targetFriendId, 'unfriend');
			} else {
				friends = prevFriends;
				alert('Error: ' + (data.error || 'Failed to remove friend'));
			}
		})
		.catch(err => {
			isRemoving = false;
			friends = prevFriends;
			console.error('Error removing friend:', err);
		});
	}

	let sidebarOpen = $state(false);

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

	function openChatWithFriend(friend) {
		const targetId = friend.friend_id || friend.id;
		if (user && String(targetId) === String(user.id)) {
			return;
		}
		goto(`/chat?friend_id=${targetId}&username=${encodeURIComponent(friend.username)}`);
	}

	function formatDate(dateStr) {
		if (!dateStr) return '';
		const d = new Date(dateStr);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function filteredFriends() {
		if (!friendsSearchQuery.trim()) return friends;
		const query = friendsSearchQuery.toLowerCase();
		return friends.filter(f => f.username.toLowerCase().includes(query));
	}

	let totalPendingCount = $derived(pendingRequests.length + sentRequests.length);
	let hasNotifications = $derived(pendingRequests.length > 0);
</script>

<svelte:head>
	<title>Friends & Network - Chronomuse</title>
</svelte:head>

<div class="flex flex-col min-h-screen bg-gradient-to-br from-pink-100 via-pink-200 to-pink-300 animate-fade-in font-sans">
	<!-- Top Navigation (Same as Dashboard & Mood Graph) -->
	<nav class="bg-white/85 backdrop-blur-md border-b-2 border-pink-300 shadow-lg sticky top-0 z-50 animate-slide-down">
			<div class="container mx-auto px-4 py-3 flex items-center justify-between">
				<div class="flex items-center space-x-3 min-w-0">
					<!-- Hamburger Menu Button - Mobile Only with Notification Dot -->
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
						class="text-pink-700 hover:text-pink-900 transition-colors font-medium cursor-pointer text-left active:scale-95"
						title="View Profile"
					>
						<span class="text-sm hidden md:inline">Welcome, <strong>{user?.username}</strong></span>
						<span class="text-xs sm:text-sm md:hidden truncate max-w-[110px]"><strong>{user?.username}</strong></span>
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
		<main class="flex-grow container mx-auto px-4 py-8 max-w-5xl">
			<!-- Header Banner -->
			<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-3.5 sm:p-4 mb-4 sm:mb-5 animate-fade-in-up">
				<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
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
							<h1 class="text-base sm:text-lg font-extrabold text-pink-600">Friends & Network</h1>
						</div>
						<p class="text-[11px] sm:text-xs text-pink-400 ml-7 sm:ml-8">Manage your connections, add new friends, and handle requests</p>
					</div>

					<!-- Navigation Tabs -->
					<div class="w-full lg:w-auto grid grid-cols-3 sm:flex items-center gap-1 sm:space-x-1 bg-pink-100/80 p-1 rounded-xl border border-pink-200">
						<button
							onclick={() => activeTab = 'friends'}
							class="px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all duration-200 flex items-center justify-center space-x-1 active:scale-95 text-center"
							class:bg-pink-500={activeTab === 'friends'}
							class:text-white={activeTab === 'friends'}
							class:shadow-sm={activeTab === 'friends'}
							class:text-pink-600={activeTab !== 'friends'}
							class:hover:bg-pink-200={activeTab !== 'friends'}
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 flex-shrink-0">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
							</svg>
							<span class="truncate">Friends ({friends.length})</span>
						</button>

						<button
							onclick={() => activeTab = 'add'}
							class="px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all duration-200 flex items-center justify-center space-x-1 active:scale-95 text-center"
							class:bg-pink-500={activeTab === 'add'}
							class:text-white={activeTab === 'add'}
							class:shadow-sm={activeTab === 'add'}
							class:text-pink-600={activeTab !== 'add'}
							class:hover:bg-pink-200={activeTab !== 'add'}
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 flex-shrink-0">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3.75 19.125a1.125 1.125 0 011.125-1.125h15.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H4.875a1.125 1.125 0 01-1.125-1.125v-2.25z" />
							</svg>
							<span class="truncate">Add Friend</span>
						</button>

						<button
							onclick={() => activeTab = 'pending'}
							class="px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all duration-200 flex items-center justify-center space-x-1 relative active:scale-95 text-center"
							class:bg-pink-500={activeTab === 'pending'}
							class:text-white={activeTab === 'pending'}
							class:shadow-sm={activeTab === 'pending'}
							class:text-pink-600={activeTab !== 'pending'}
							class:hover:bg-pink-200={activeTab !== 'pending'}
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 flex-shrink-0">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<span class="truncate">Pending ({totalPendingCount})</span>
							{#if totalPendingCount > 0}
								<span class="w-2 h-2 rounded-full bg-red-500 animate-ping absolute top-0.5 right-0.5"></span>
							{/if}
						</button>
					</div>
				</div>
			</div>

			<!-- Tab 1: My Friends List -->
			{#if activeTab === 'friends'}
				<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-4 animate-fade-in transition-all duration-300 hover:shadow-lg">
					<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
						<h2 class="text-sm sm:text-base font-bold text-pink-600 flex items-center space-x-1.5">
							<span>All Friends ({filteredFriends().length})</span>
						</h2>

						<!-- Search Friends -->
						<div class="relative max-w-xs w-full">
							<input
								type="text"
								bind:value={friendsSearchQuery}
								placeholder="Search friends..."
								class="w-full pl-8 pr-3 py-1.5 bg-pink-50 border-2 border-pink-200 rounded-lg text-xs text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all duration-200 focus:bg-white"
							/>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-pink-400 absolute left-2.5 top-2.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
							</svg>
						</div>
					</div>

					{#if isFetchingFriends && friends.length === 0}
						<div class="text-center py-8">
							<div class="animate-spin h-6 w-6 text-pink-500 mx-auto mb-2 border-3 border-pink-200 border-t-pink-500 rounded-full"></div>
							<p class="text-xs text-pink-400">Loading friends list...</p>
						</div>
					{:else if filteredFriends().length > 0}
						<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
							{#each filteredFriends() as friend (friend.friend_id || friend.friendship_id || friend.id)}
								<div
									class="p-3 bg-pink-50/80 border-2 border-pink-200 rounded-xl flex items-center justify-between hover:border-pink-300 transition-all duration-200 shadow-sm"
								>
									<a
										href="/profile?id={friend.friend_id || friend.id}"
										class="flex items-center space-x-2.5 min-w-0 hover:opacity-85 transition-opacity group cursor-pointer"
										title="View @{friend.username}'s Profile"
									>
										<div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-400 to-pink-600 text-white font-bold text-xs flex items-center justify-center shadow-sm flex-shrink-0 overflow-hidden group-hover:scale-105 transition-transform">
											{#if friend.avatar_url}
												<img src={friend.avatar_url} alt={friend.username} class="w-full h-full object-cover" />
											{:else}
												{friend.username.charAt(0).toUpperCase()}
											{/if}
										</div>
										<div class="min-w-0">
											<h3 class="text-xs sm:text-sm font-bold text-pink-700 truncate group-hover:underline flex items-center gap-1">
												<span>@{friend.username}</span>
											</h3>
											<p class="text-[10px] text-pink-400">Friend since {formatDate(friend.created_at)}</p>
										</div>
									</a>

									<div class="flex items-center space-x-1.5 flex-shrink-0 ml-2">
										<button
											onclick={() => goto(`/profile?id=${friend.friend_id || friend.id}`)}
											class="px-2.5 py-1.5 bg-white border border-pink-300 text-pink-600 hover:bg-pink-50 active:scale-95 rounded-lg transition-all duration-200 shadow-2xs flex items-center space-x-1 text-xs font-semibold cursor-pointer"
											title="View Profile"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
											</svg>
											<span class="hidden sm:inline">Profile</span>
										</button>

										<button
											onclick={() => openChatWithFriend(friend)}
											class="px-2.5 py-1.5 bg-pink-500 text-white hover:bg-pink-600 active:scale-95 rounded-lg transition-all duration-200 shadow-sm flex items-center space-x-1 text-xs font-semibold"
											title="Open Chat"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
											</svg>
											<span class="hidden sm:inline">Chat</span>
										</button>

										<button
											onclick={() => handleRemoveFriend(friend)}
											class="p-1.5 bg-pink-100 text-pink-600 hover:bg-red-100 hover:text-red-600 active:scale-95 rounded-lg transition-all duration-200"
											title="Remove Friend"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 12.55a1.125 1.125 0 01-1.126 1.095H9.726a1.125 1.125 0 01-1.126-1.095L8.259 9M8.875 5.625V4.5c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v1.125m-4.5 0V4.5m0 0h4.5m-4.5 0a2.25 2.25 0 00-2.25 2.25v1.5a2.25 2.25 0 002.25 2.25h1.5a2.25 2.25 0 002.25-2.25v-1.5a2.25 2.25 0 00-2.25-2.25h-1.5z" />
											</svg>
										</button>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="text-center py-8 bg-pink-50/50 rounded-xl border border-dashed border-pink-200 animate-pop-in">
							<div class="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-2 text-pink-400">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
								</svg>
							</div>
							<p class="text-xs font-semibold text-pink-600">No friends found</p>
							<p class="text-[11px] text-pink-400 mt-0.5">Use the "Add Friend" tab to connect with people!</p>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Tab 2: Search & Add Friend -->
			{#if activeTab === 'add'}
				<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-4 sm:p-6 max-w-lg mx-auto animate-pop-in transition-all duration-300 hover:shadow-lg">
					<div class="text-center mb-5">
						<div class="w-12 h-12 bg-pink-100 text-pink-500 rounded-full flex items-center justify-center mx-auto mb-2 shadow-inner">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-6 h-6">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3.75 19.125a1.125 1.125 0 011.125-1.125h15.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H4.875a1.125 1.125 0 01-1.125-1.125v-2.25z" />
							</svg>
						</div>
						<h2 class="text-base sm:text-lg font-bold text-pink-600">Find & Add Friends</h2>
						<p class="text-xs text-pink-400 mt-0.5">Search for usernames and check their profiles before sending a request</p>
					</div>

					<!-- Search Form -->
					<form onsubmit={handleAddFriendSubmit} class="space-y-3 mb-4">
						{#if addFriendError}
							<div class="p-2.5 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl font-medium text-center animate-fade-in">
								{addFriendError}
							</div>
						{/if}

						{#if addFriendSuccess}
							<div class="p-2.5 bg-green-50 border border-green-200 text-green-600 text-xs rounded-xl font-medium text-center animate-fade-in">
								{addFriendSuccess}
							</div>
						{/if}

						<div class="relative">
							<span class="absolute left-3.5 top-3 text-pink-400 font-bold text-sm">@</span>
							<input
								type="text"
								bind:value={friendUsername}
								oninput={handleSearchInput}
								placeholder="Search by username..."
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
					</form>

					<!-- Live Search State & Results Container -->
					{#if isSearchingUsers}
						<div class="text-center py-6">
							<div class="animate-spin h-6 w-6 border-3 border-pink-200 border-t-pink-500 rounded-full mx-auto mb-2"></div>
							<p class="text-xs text-pink-400">Searching users...</p>
						</div>
					{:else if searchResults.length > 0}
						<div class="space-y-3 mt-4">
							<div class="flex items-center justify-between">
								<h3 class="text-xs font-bold text-pink-600 uppercase tracking-wide">
									Search Results ({searchResults.length})
								</h3>
								<span class="text-[11px] text-pink-400">Preview profile before adding</span>
							</div>

							<div class="space-y-2.5 max-h-72 overflow-y-auto pr-1">
								{#each searchResults as targetUser (targetUser.id)}
									<div class="p-2.5 sm:p-3 bg-pink-50/90 hover:bg-pink-100/70 border-2 border-pink-200 rounded-2xl flex items-center justify-between gap-2 transition-all duration-200 shadow-2xs">
										<!-- User Info (Clickable) -->
										<button
											type="button"
											onclick={() => goto(`/profile?id=${targetUser.id}`)}
											class="flex items-center space-x-2.5 min-w-0 text-left hover:opacity-85 transition-opacity group cursor-pointer"
											title="View @{targetUser.username}'s Profile"
										>
											<div class="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-400 to-rose-500 text-white font-bold text-sm flex items-center justify-center flex-shrink-0 shadow-xs overflow-hidden group-hover:scale-105 transition-transform">
												{#if targetUser.avatar_url}
													<img src={targetUser.avatar_url} alt={targetUser.username} class="w-full h-full object-cover" />
												{:else}
													{targetUser.username.charAt(0).toUpperCase()}
												{/if}
											</div>
											<div class="min-w-0">
												<div class="flex items-center gap-1.5 flex-wrap">
													<p class="text-xs sm:text-sm font-bold text-pink-900 truncate group-hover:underline">@{targetUser.username}</p>
													{#if targetUser.mutual_friends_count > 0}
														<span class="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-pink-200/80 text-pink-700 border border-pink-300 whitespace-nowrap">
															✨ {targetUser.mutual_friends_count} mutual
														</span>
													{/if}
												</div>
												<p class="text-[10px] sm:text-[11px] text-pink-500 truncate">{targetUser.email}</p>
											</div>
										</button>

										<!-- Actions (View Profile & Add Friend) -->
										<div class="flex items-center space-x-1.5 flex-shrink-0">
											<!-- View Profile Button -->
											<button
												type="button"
												onclick={() => goto(`/profile?id=${targetUser.id}`)}
												class="px-2.5 py-1.5 bg-white border border-pink-300 hover:bg-pink-50 text-pink-600 active:scale-95 text-xs font-semibold rounded-xl transition-all shadow-2xs flex items-center space-x-1 cursor-pointer"
												title="View Full Profile"
											>
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-3.5 h-3.5">
													<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
												</svg>
												<span>Profile</span>
											</button>

											<!-- Relationship Status Action -->
											{#if targetUser.relationship === 'self'}
												<span class="px-2.5 py-1.5 bg-pink-100 text-pink-500 text-xs font-semibold rounded-xl">
													You
												</span>
											{:else if targetUser.relationship === 'friends'}
												<button
													type="button"
													onclick={() => openChatWithFriend({ friend_id: targetUser.id, username: targetUser.username })}
													class="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center space-x-1 cursor-pointer active:scale-95"
												>
													<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
														<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
													</svg>
													<span>Friends</span>
												</button>
											{:else if targetUser.relationship === 'request_sent'}
												<button
													type="button"
													onclick={() => handleCancelFriendRequestFromSearch(targetUser)}
													disabled={isResponding}
													class="px-2.5 py-1.5 bg-amber-50 hover:bg-red-50 text-amber-800 hover:text-red-600 border border-amber-300 hover:border-red-300 text-xs font-bold rounded-xl active:scale-95 transition-all shadow-2xs flex items-center space-x-1 cursor-pointer disabled:opacity-50"
													title="Click to cancel friend request"
												>
													<span>Cancel Add</span>
												</button>
											{:else if targetUser.relationship === 'request_received'}
												<button
													type="button"
													onclick={() => handleRespondRequest(targetUser.request_id, 'accept')}
													class="px-2.5 py-1.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xs font-bold rounded-xl hover:from-pink-600 hover:to-rose-600 active:scale-95 transition-all shadow-2xs cursor-pointer"
												>
													Accept
												</button>
											{:else}
												<button
													type="button"
													onclick={() => sendFriendRequestToUser(targetUser)}
													disabled={isAddingFriend}
													class="px-2.5 py-1.5 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-2xs disabled:opacity-50 flex items-center space-x-1 cursor-pointer"
												>
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
														<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
													</svg>
													<span>Add Friend</span>
												</button>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{:else if hasSearched && friendUsername.trim()}
						<div class="text-center py-8 bg-pink-50/50 rounded-2xl border border-dashed border-pink-200 animate-fade-in">
							<div class="w-11 h-11 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-2 text-pink-400">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
								</svg>
							</div>
							<p class="text-xs font-bold text-pink-700">No user found matching "@{friendUsername.trim()}"</p>
							<p class="text-[11px] text-pink-400 mt-0.5">Please check the spelling and try again.</p>
						</div>
					{:else}
						<div class="p-4 bg-pink-50/60 rounded-2xl border border-pink-200 text-center">
							<p class="text-xs text-pink-600 font-semibold">
								Type any username to find users
							</p>
							<p class="text-[11px] text-pink-400 mt-1">
								You'll be able to view their profile card, mutual friends, and profile page first before adding them!
							</p>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Tab 3: Pending Requests (Left Card & Right Card) -->
			{#if activeTab === 'pending'}
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 animate-pop-in">
					<!-- Left Card: Incoming Requests -->
					<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-3.5 sm:p-4 flex flex-col justify-between transition-all duration-300 hover:shadow-lg">
						<div>
							<h2 class="text-xs sm:text-sm font-bold text-pink-600 mb-3 flex flex-wrap items-center justify-between gap-2">
								<span class="truncate">Incoming Requests ({pendingRequests.length})</span>
								<span class="text-[10px] bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full font-bold whitespace-nowrap flex-shrink-0">Action Required</span>
							</h2>

							{#if pendingRequests.length > 0}
								<div class="space-y-2.5">
									{#each pendingRequests as req, idx (req.id || req.request_id || idx)}
										<div class="p-2.5 sm:p-3 bg-pink-50 border-2 border-pink-200 rounded-xl flex items-center justify-between gap-2 shadow-sm transition-all duration-200 hover:border-pink-300">
											<a
												href="/profile?id={req.sender_id || req.id}"
												class="flex items-center space-x-2 sm:space-x-2.5 min-w-0 hover:opacity-85 transition-opacity group cursor-pointer"
												title="View @{req.username}'s Profile"
											>
												<div class="w-8 h-8 rounded-lg bg-pink-500 text-white font-bold flex items-center justify-center flex-shrink-0 shadow-sm text-xs overflow-hidden group-hover:scale-105 transition-transform">
													{#if req.avatar_url}
														<img src={req.avatar_url} alt={req.username} class="w-full h-full object-cover" />
													{:else}
														{(req.username || 'U').charAt(0).toUpperCase()}
													{/if}
												</div>
												<div class="min-w-0">
													<p class="text-xs font-bold text-pink-700 truncate group-hover:underline">@{req.username || 'Unknown'}</p>
													<p class="text-[10px] text-pink-400">Sent on {formatDate(req.created_at)}</p>
												</div>
											</a>

											<div class="flex items-center space-x-1.5 flex-shrink-0">
												<button
													onclick={() => handleRespondRequest(req.id || req.request_id, 'accept')}
													disabled={isResponding}
													class="px-3 py-1.5 bg-gradient-to-r from-pink-500 to-pink-600 text-white text-xs font-bold rounded-lg hover:from-pink-600 hover:to-pink-700 active:scale-95 transition-all shadow-sm cursor-pointer disabled:opacity-50"
												>
													Accept
												</button>
												<button
													onclick={() => handleRespondRequest(req.id || req.request_id, 'decline')}
													disabled={isResponding}
													class="px-2.5 py-1.5 bg-pink-100 text-pink-600 hover:bg-pink-200 active:scale-95 text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-50"
												>
													Decline
												</button>
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<div class="text-center py-8 bg-pink-50/50 rounded-xl border border-pink-200">
									<p class="text-xs font-semibold text-pink-400">No incoming friend requests right now.</p>
								</div>
							{/if}
						</div>
					</div>

					<!-- Right Card: Sent Pending Requests -->
					<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-3.5 sm:p-4 flex flex-col justify-between transition-all duration-300 hover:shadow-lg">
						<div>
							<h2 class="text-xs sm:text-sm font-bold text-pink-600 mb-3 flex flex-wrap items-center justify-between gap-2">
								<span class="truncate">Sent Pending Requests ({sentRequests.length})</span>
								<span class="text-[10px] bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full font-bold whitespace-nowrap flex-shrink-0">Waiting for Response</span>
							</h2>

							{#if sentRequests.length > 0}
								<div class="space-y-2.5">
									{#each sentRequests as req, idx (req.id || req.request_id || idx)}
										<div class="p-2.5 sm:p-3 bg-pink-50 border-2 border-pink-200 rounded-xl flex items-center justify-between gap-2 shadow-sm transition-all duration-200 hover:border-pink-300">
											<a
												href="/profile?id={req.receiver_id || req.id}"
												class="flex items-center space-x-2 sm:space-x-2.5 min-w-0 hover:opacity-85 transition-opacity group cursor-pointer"
												title="View @{req.username}'s Profile"
											>
												<div class="w-8 h-8 rounded-lg bg-pink-300 text-pink-700 font-bold flex items-center justify-center flex-shrink-0 shadow-sm text-xs overflow-hidden group-hover:scale-105 transition-transform">
													{#if req.avatar_url}
														<img src={req.avatar_url} alt={req.username} class="w-full h-full object-cover" />
													{:else}
														{(req.username || 'U').charAt(0).toUpperCase()}
													{/if}
												</div>
												<div class="min-w-0">
													<p class="text-xs font-bold text-pink-700 truncate group-hover:underline">@{req.username || 'Unknown'}</p>
													<p class="text-[10px] text-pink-400">Request sent on {formatDate(req.created_at)}</p>
												</div>
											</a>

											<div class="flex items-center space-x-1.5 flex-shrink-0">
												<button
													onclick={() => handleCancelSentRequest(req.id || req.request_id)}
													disabled={isResponding}
													class="px-2.5 py-1.5 bg-amber-50 hover:bg-red-50 border border-amber-300 hover:border-red-300 text-amber-800 hover:text-red-600 active:scale-95 text-xs font-bold rounded-lg transition-all flex-shrink-0 shadow-sm cursor-pointer disabled:opacity-50"
												>
													Cancel Add
												</button>
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<div class="text-center py-10 bg-pink-50/50 rounded-2xl border border-pink-200">
									<p class="text-xs font-semibold text-pink-400">No sent pending requests.</p>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</main>

		<!-- Confirmation Modal for Removing Friend -->
		{#if showConfirmDelete}
			<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
				<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-xl max-w-sm w-full p-6 text-center animate-modal-content">
					<div class="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-3">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
						</svg>
					</div>
					<h3 class="text-lg font-bold text-pink-600 mb-1">Remove Friend</h3>
					<p class="text-xs text-pink-400 mb-5">
						Are you sure you want to remove <span class="font-bold text-pink-600">@{friendToRemove?.username}</span> from your friends list?
					</p>

					<div class="flex space-x-3">
						<button
							onclick={() => { showConfirmDelete = false; friendToRemove = null; }}
							class="w-1/2 py-2.5 bg-pink-100 text-pink-600 rounded-xl font-bold text-xs hover:bg-pink-200 transition-all"
						>
							Cancel
						</button>
						<button
							onclick={confirmRemoveFriend}
							disabled={isRemoving}
							class="w-1/2 py-2.5 bg-red-500 text-white rounded-xl font-bold text-xs hover:bg-red-600 transition-all shadow-md"
						>
							{isRemoving ? 'Removing...' : 'Remove'}
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Footer (Same as Dashboard & Mood Graph) -->
		<footer class="bg-white/85 backdrop-blur-md border-t-2 border-pink-300 animate-fade-in mt-auto" style="animation-delay: 0.4s">
			<div class="container mx-auto px-2 sm:px-4 py-2.5 sm:py-3 text-center flex items-center justify-center">
				<p class="text-[10px] sm:text-xs text-pink-700 whitespace-nowrap font-medium tracking-tight sm:tracking-normal">
					© 2026 CHRONOMUSE. All rights reserved. Developed by Merlye Deyto
				</p>
			</div>
		</footer>
	</div>
