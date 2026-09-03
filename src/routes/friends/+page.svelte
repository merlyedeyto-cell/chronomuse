<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import Sidebar from '$lib/Sidebar.svelte';

	let user = $state(null);
	let isLoading = $state(true);
	let activeTab = $state('friends'); // 'friends', 'add', 'pending'

	// Friends List State
	let friends = $state([]);
	let friendsSearchQuery = $state('');
	let isFetchingFriends = $state(false);
	let friendToRemove = $state(null);
	let showConfirmDelete = $state(false);
	let isRemoving = $state(false);

	// Add Friend State
	let friendUsername = $state('');
	let isAddingFriend = $state(false);
	let addFriendError = $state('');
	let addFriendSuccess = $state('');

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
	});

	function loadAllData() {
		fetchFriends();
		fetchPendingRequests();
	}

	function fetchFriends() {
		if (!user || !user.id) return;
		isFetchingFriends = true;

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
			}
		})
		.catch(err => {
			isFetchingFriends = false;
			console.error('Error fetching friends:', err);
		});
	}

	function fetchPendingRequests() {
		if (!user || !user.id) return;
		isFetchingRequests = true;

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
			}
		})
		.catch(err => {
			isFetchingRequests = false;
			console.error('Error fetching pending requests:', err);
		});
	}

	function handleAddFriendSubmit(e) {
		e.preventDefault();
		if (!friendUsername.trim() || !user?.id) return;

		isAddingFriend = true;
		addFriendError = '';
		addFriendSuccess = '';

		fetch(API_ENDPOINTS.addFriend, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				friend_username: friendUsername.trim(),
				user_id: user.id
			})
		})
		.then(res => res.json())
		.then(data => {
			isAddingFriend = false;
			if (data.error) {
				addFriendError = data.error;
			} else {
				addFriendSuccess = data.message || 'Friend request sent successfully!';
				friendUsername = '';
				fetchPendingRequests();
				setTimeout(() => {
					addFriendSuccess = '';
					activeTab = 'pending';
				}, 1200);
			}
		})
		.catch(err => {
			isAddingFriend = false;
			addFriendError = 'An error occurred. Please try again.';
			console.error('Add friend error:', err);
		});
	}

	function handleRespondRequest(requestId, action) {
		if (!user || !user.id || isResponding) return;
		isResponding = true;

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
			} else {
				alert('Error: ' + (data.error || 'Failed to respond'));
			}
		})
		.catch(err => {
			isResponding = false;
			console.error('Error responding to request:', err);
		});
	}

	function handleCancelSentRequest(requestId) {
		if (!user || !user.id || isResponding) return;
		isResponding = true;

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
			isResponding = false;
			if (data.success) {
				fetchPendingRequests();
			} else {
				alert('Error: ' + (data.error || 'Failed to cancel request'));
			}
		})
		.catch(err => {
			isResponding = false;
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

		fetch(API_ENDPOINTS.removeFriend, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				friendship_id: friendToRemove.friendship_id,
				user_id: user.id
			})
		})
		.then(res => res.json())
		.then(data => {
			isRemoving = false;
			showConfirmDelete = false;
			friendToRemove = null;
			if (data.success) {
				fetchFriends();
			} else {
				alert('Error: ' + (data.error || 'Failed to remove friend'));
			}
		})
		.catch(err => {
			isRemoving = false;
			console.error('Error removing friend:', err);
		});
	}

	let sidebarOpen = $state(false);

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	function handleLogout() {
		localStorage.removeItem('chronomuse_user');
		goto('/');
	}

	function openChatWithFriend(friend) {
		const targetId = friend.friend_id || friend.id;
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
</script>

<svelte:head>
	<title>Friends & Network - Chronomuse</title>
</svelte:head>

{#if isLoading}
	<div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200">
		<div class="text-center">
			<div class="animate-spin rounded-full h-16 w-16 border-b-2 border-pink-500 mx-auto"></div>
			<p class="mt-4 text-pink-700">Loading...</p>
		</div>
	</div>
{:else}
	<div class="flex flex-col min-h-screen bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200 animate-fade-in font-sans">
		<!-- Top Navigation (Same as Dashboard & Mood Graph) -->
		<nav class="bg-white/85 backdrop-blur-md border-b-2 border-pink-300 shadow-lg sticky top-0 z-50 animate-slide-down">
			<div class="container mx-auto px-4 py-3 flex items-center justify-between">
				<div class="flex items-center space-x-3 min-w-0">
					<!-- Hamburger Menu Button - Mobile Only -->
					<button
						onclick={toggleSidebar}
						class="md:hidden p-2 text-pink-500 hover:bg-pink-100 rounded-lg transition-colors flex-shrink-0"
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
					</button>
					<img src="/logo.png" alt="ChronoMuse" class="w-9 h-9 sm:w-10 sm:h-10 rounded-md object-contain flex-shrink-0" />
					<span class="text-base sm:text-lg font-bold text-pink-500 truncate">ChronoMuse</span>
				</div>

				<div class="flex items-center space-x-2 sm:space-x-4 flex-shrink-0 ml-2">
					<span class="text-pink-700 text-sm hidden md:inline">Welcome, <strong>{user?.username}</strong></span>
					<span class="text-pink-700 text-xs sm:text-sm md:hidden truncate max-w-[110px]"><strong>{user?.username}</strong></span>
					<button
						onclick={handleLogout}
						class="px-4 py-2 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-lg hover:from-pink-500 hover:to-pink-700 transition-all duration-200 text-sm font-semibold shadow-md hidden md:block active:scale-95"
					>
						Logout
					</button>
				</div>
			</div>
		</nav>

		<!-- Sidebar Component -->
		<Sidebar bind:isOpen={sidebarOpen} on:logout={handleLogout} />

		<!-- Main Content -->
		<main class="flex-grow container mx-auto px-4 py-8 max-w-5xl">
			<!-- Header Banner -->
			<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-lg p-4 sm:p-6 mb-6 sm:mb-8 animate-fade-in-up">
				<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
					<div>
						<div class="flex items-center space-x-2 sm:space-x-3 mb-1">
							<button
								onclick={() => goto('/dashboard')}
								class="p-1.5 sm:p-2 text-pink-500 hover:text-pink-700 hover:bg-pink-100 rounded-xl transition-all duration-200"
								title="Back to Dashboard"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
								</svg>
							</button>
							<h1 class="text-xl sm:text-3xl font-extrabold text-pink-600">Friends & Network</h1>
						</div>
						<p class="text-xs sm:text-sm text-pink-400 ml-8 sm:ml-10">Manage your connections, add new friends, and handle requests</p>
					</div>

					<!-- Navigation Tabs -->
					<div class="w-full lg:w-auto grid grid-cols-3 sm:flex items-center gap-1 sm:space-x-1.5 bg-pink-100/80 p-1.5 rounded-2xl border border-pink-200">
						<button
							onclick={() => activeTab = 'friends'}
							class="px-2 sm:px-4 py-2.5 sm:py-2 rounded-xl text-[11px] sm:text-sm font-bold transition-all duration-200 flex items-center justify-center space-x-1 sm:space-x-2 active:scale-95 text-center"
							class:bg-pink-500={activeTab === 'friends'}
							class:text-white={activeTab === 'friends'}
							class:shadow-md={activeTab === 'friends'}
							class:text-pink-600={activeTab !== 'friends'}
							class:hover:bg-pink-200={activeTab !== 'friends'}
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 flex-shrink-0">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
							</svg>
							<span class="truncate">Friends ({friends.length})</span>
						</button>

						<button
							onclick={() => activeTab = 'add'}
							class="px-2 sm:px-4 py-2.5 sm:py-2 rounded-xl text-[11px] sm:text-sm font-bold transition-all duration-200 flex items-center justify-center space-x-1 sm:space-x-2 active:scale-95 text-center"
							class:bg-pink-500={activeTab === 'add'}
							class:text-white={activeTab === 'add'}
							class:shadow-md={activeTab === 'add'}
							class:text-pink-600={activeTab !== 'add'}
							class:hover:bg-pink-200={activeTab !== 'add'}
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 flex-shrink-0">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3.75 19.125a1.125 1.125 0 011.125-1.125h15.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H4.875a1.125 1.125 0 01-1.125-1.125v-2.25z" />
							</svg>
							<span class="truncate">Add Friend</span>
						</button>

						<button
							onclick={() => activeTab = 'pending'}
							class="px-2 sm:px-4 py-2.5 sm:py-2 rounded-xl text-[11px] sm:text-sm font-bold transition-all duration-200 flex items-center justify-center space-x-1 sm:space-x-2 relative active:scale-95 text-center"
							class:bg-pink-500={activeTab === 'pending'}
							class:text-white={activeTab === 'pending'}
							class:shadow-md={activeTab === 'pending'}
							class:text-pink-600={activeTab !== 'pending'}
							class:hover:bg-pink-200={activeTab !== 'pending'}
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 flex-shrink-0">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<span class="truncate">Pending ({totalPendingCount})</span>
							{#if totalPendingCount > 0}
								<span class="w-2 h-2 rounded-full bg-red-500 animate-ping absolute top-1 right-1"></span>
							{/if}
						</button>
					</div>
				</div>
			</div>

			<!-- Tab 1: My Friends List -->
			{#if activeTab === 'friends'}
				<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-lg p-6 animate-fade-in transition-all duration-300 hover:shadow-xl">
					<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
						<h2 class="text-xl font-bold text-pink-600 flex items-center space-x-2">
							<span>All Friends ({filteredFriends().length})</span>
						</h2>

						<!-- Search Friends -->
						<div class="relative max-w-xs w-full">
							<input
								type="text"
								bind:value={friendsSearchQuery}
								placeholder="Search friends..."
								class="w-full pl-9 pr-4 py-2 bg-pink-50 border-2 border-pink-200 rounded-xl text-sm text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all duration-200 focus:bg-white"
							/>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-400 absolute left-3 top-3">
								<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
							</svg>
						</div>
					</div>

					{#if isFetchingFriends}
						<div class="text-center py-12">
							<div class="animate-spin h-8 w-8 text-pink-500 mx-auto mb-2 border-4 border-pink-200 border-t-pink-500 rounded-full"></div>
							<p class="text-sm text-pink-400">Loading friends list...</p>
						</div>
					{:else if filteredFriends().length > 0}
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							{#each filteredFriends() as friend (friend.friendship_id)}
								<div
									class="p-4 bg-pink-50/80 border-2 border-pink-200 rounded-2xl flex items-center justify-between hover:border-pink-400 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-1"
								>
									<div class="flex items-center space-x-3.5 min-w-0">
										<div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-400 to-pink-600 text-white font-black text-lg flex items-center justify-center shadow-md flex-shrink-0 transition-transform duration-300 hover:scale-105">
											{friend.username.charAt(0).toUpperCase()}
										</div>
										<div class="min-w-0">
											<h3 class="text-base font-bold text-pink-700 truncate">@{friend.username}</h3>
											<p class="text-xs text-pink-400">Friend since {formatDate(friend.created_at)}</p>
										</div>
									</div>

									<div class="flex items-center space-x-2 flex-shrink-0 ml-2">
										<button
											onclick={() => openChatWithFriend(friend)}
											class="p-2.5 bg-pink-500 text-white hover:bg-pink-600 active:scale-95 rounded-xl transition-all duration-200 shadow-sm flex items-center space-x-1 text-xs font-semibold"
											title="Open Chat"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
											</svg>
											<span class="hidden sm:inline">Chat</span>
										</button>

										<button
											onclick={() => handleRemoveFriend(friend)}
											class="p-2.5 bg-pink-100 text-pink-600 hover:bg-red-100 hover:text-red-600 active:scale-95 rounded-xl transition-all duration-200"
											title="Remove Friend"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 12.55a1.125 1.125 0 01-1.126 1.095H9.726a1.125 1.125 0 01-1.126-1.095L8.259 9M8.875 5.625V4.5c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v1.125m-4.5 0V4.5m0 0h4.5m-4.5 0a2.25 2.25 0 00-2.25 2.25v1.5a2.25 2.25 0 002.25 2.25h1.5a2.25 2.25 0 002.25-2.25v-1.5a2.25 2.25 0 00-2.25-2.25h-1.5z" />
											</svg>
										</button>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="text-center py-12 bg-pink-50/50 rounded-2xl border-2 border-dashed border-pink-200 animate-pop-in">
							<div class="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-3 text-pink-400">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
								</svg>
							</div>
							<h3 class="text-base font-bold text-pink-600 mb-1">No friends found</h3>
							<p class="text-xs text-pink-400 mb-4">Click "Add Friend" above to search and connect with users!</p>
							<button
								onclick={() => activeTab = 'add'}
								class="px-4 py-2 bg-pink-500 text-white rounded-xl font-bold text-xs shadow-md hover:bg-pink-600 active:scale-95 transition-all"
							>
								+ Add Friend Now
							</button>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Tab 2: Add Friend Form -->
			{#if activeTab === 'add'}
				<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-lg p-6 max-w-xl mx-auto animate-pop-in transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
					<div class="text-center mb-6">
						<div class="w-16 h-16 bg-pink-100 text-pink-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner transition-transform hover:scale-110">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3.75 19.125a1.125 1.125 0 011.125-1.125h15.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H4.875a1.125 1.125 0 01-1.125-1.125v-2.25z" />
							</svg>
						</div>
						<h2 class="text-xl font-bold text-pink-600">Send Friend Request</h2>
						<p class="text-xs text-pink-400 mt-1">Type your friend's exact username to connect</p>
					</div>

					<form onsubmit={handleAddFriendSubmit} class="space-y-4">
						{#if addFriendError}
							<div class="p-3 bg-red-50 border-2 border-red-200 text-red-600 text-xs rounded-xl font-medium text-center animate-fade-in">
								{addFriendError}
							</div>
						{/if}

						{#if addFriendSuccess}
							<div class="p-3 bg-green-50 border-2 border-green-200 text-green-600 text-xs rounded-xl font-medium text-center animate-fade-in">
								{addFriendSuccess}
							</div>
						{/if}

						<div>
							<label class="block text-xs font-semibold text-pink-600 mb-1">Friend's Username</label>
							<div class="relative">
								<span class="absolute left-3.5 top-3 text-pink-400 font-bold text-sm">@</span>
								<input
									type="text"
									bind:value={friendUsername}
									placeholder="enter_username"
									required
									class="w-full pl-8 pr-4 py-3 bg-pink-50 border-2 border-pink-200 rounded-xl text-sm font-semibold text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all duration-200"
								/>
							</div>
						</div>

						<button
							type="submit"
							disabled={isAddingFriend || !friendUsername.trim()}
							class="w-full py-3 px-4 bg-gradient-to-r from-pink-500 to-pink-600 text-white font-bold text-sm rounded-xl hover:from-pink-600 hover:to-pink-700 active:scale-95 transition-all duration-200 shadow-md disabled:opacity-50 flex items-center justify-center space-x-2"
						>
							{#if isAddingFriend}
								<div class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
								<span>Sending Request...</span>
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
								</svg>
								<span>Send Friend Request</span>
							{/if}
						</button>
					</form>
				</div>
			{/if}

			<!-- Tab 3: Pending Requests (Left Card & Right Card) -->
			{#if activeTab === 'pending'}
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pop-in">
					<!-- Left Card: Incoming Requests -->
					<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-lg p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
						<div>
							<h2 class="text-base font-bold text-pink-600 mb-4 flex items-center justify-between">
								<span>Incoming Friend Requests ({pendingRequests.length})</span>
								<span class="text-[10px] bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full font-bold">Action Required</span>
							</h2>

							{#if pendingRequests.length > 0}
								<div class="space-y-3">
									{#each pendingRequests as req, idx (req.id || req.request_id || idx)}
										<div class="p-3.5 bg-pink-50 border-2 border-pink-200 rounded-2xl flex items-center justify-between gap-2 shadow-sm transition-all duration-200 hover:border-pink-300">
											<div class="flex items-center space-x-3 min-w-0">
												<div class="w-9 h-9 rounded-xl bg-pink-500 text-white font-bold flex items-center justify-center flex-shrink-0 shadow-sm">
													{(req.username || 'U').charAt(0).toUpperCase()}
												</div>
												<div class="min-w-0">
													<p class="text-xs font-bold text-pink-700 truncate">@{req.username || 'Unknown'}</p>
													<p class="text-[10px] text-pink-400">Sent on {formatDate(req.created_at)}</p>
												</div>
											</div>

											<div class="flex items-center space-x-1.5 flex-shrink-0">
												<button
													onclick={() => handleRespondRequest(req.id || req.request_id, 'accept')}
													disabled={isResponding}
													class="px-3 py-1.5 bg-gradient-to-r from-pink-500 to-pink-600 text-white text-xs font-bold rounded-lg hover:from-pink-600 hover:to-pink-700 active:scale-95 transition-all shadow-sm"
												>
													Accept
												</button>
												<button
													onclick={() => handleRespondRequest(req.id || req.request_id, 'decline')}
													disabled={isResponding}
													class="px-2.5 py-1.5 bg-pink-100 text-pink-600 hover:bg-pink-200 active:scale-95 text-xs font-bold rounded-lg transition-all"
												>
													Decline
												</button>
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<div class="text-center py-10 bg-pink-50/50 rounded-2xl border border-pink-200">
									<p class="text-xs font-semibold text-pink-400">No incoming friend requests right now.</p>
								</div>
							{/if}
						</div>
					</div>

					<!-- Right Card: Sent Pending Requests -->
					<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-lg p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
						<div>
							<h2 class="text-base font-bold text-pink-600 mb-4 flex items-center justify-between">
								<span>Sent Pending Requests ({sentRequests.length})</span>
								<span class="text-[10px] bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full font-bold">Waiting for Response</span>
							</h2>

							{#if sentRequests.length > 0}
								<div class="space-y-3">
									{#each sentRequests as req, idx (req.id || req.request_id || idx)}
										<div class="p-3.5 bg-pink-50 border-2 border-pink-200 rounded-2xl flex items-center justify-between gap-2 shadow-sm transition-all duration-200 hover:border-pink-300">
											<div class="flex items-center space-x-3 min-w-0">
												<div class="w-9 h-9 rounded-xl bg-pink-300 text-pink-700 font-bold flex items-center justify-center flex-shrink-0 shadow-sm">
													{(req.username || 'U').charAt(0).toUpperCase()}
												</div>
												<div class="min-w-0">
													<p class="text-xs font-bold text-pink-700 truncate">@{req.username || 'Unknown'}</p>
													<p class="text-[10px] text-pink-400">Request sent on {formatDate(req.created_at)}</p>
												</div>
											</div>

											<button
												onclick={() => handleCancelSentRequest(req.id || req.request_id)}
												disabled={isResponding}
												class="px-3 py-1.5 bg-white border-2 border-pink-300 text-pink-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600 active:scale-95 text-xs font-bold rounded-lg transition-all flex-shrink-0 shadow-sm"
											>
												Cancel Add
											</button>
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
			<div class="container mx-auto px-4 py-3 text-center">
				<p class="text-xs text-pink-700">
					© 2026 CHRONOMUSE. All rights reserved. Developed by Merlye Deyto
				</p>
			</div>
		</footer>
	</div>
{/if}
