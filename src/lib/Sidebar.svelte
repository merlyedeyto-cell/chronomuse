<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import AddFriendModal from './AddFriendModal.svelte';
	import FriendsListModal from './FriendsListModal.svelte';
	import ProfileModal from './ProfileModal.svelte';

	const dispatch = createEventDispatcher();
	let { isOpen = false } = $props();
	let showAddFriendModal = $state(false);
	let showFriendsListModal = $state(false);
	let showProfileModal = $state(false);
	let pendingRequestsCount = $state(0);
	let unreadChatsCount = $state(0);

	function toggleSidebar() {
		isOpen = !isOpen;
	}

	function handleHome() {
		dispatch('home');
	}

	function handleAddFriend() {
		showAddFriendModal = true;
	}

	function handleFriendsList() {
		showFriendsListModal = true;
	}

	function handleProfile() {
		showProfileModal = true;
	}

	function handleChat() {
		window.location.href = '/chat';
	}

	function handleMoodGraph() {
		dispatch('moodGraph');
	}

	function handleLogout() {
		dispatch('logout');
	}

	function isActive(path) {
		return $page.url.pathname === path;
	}

	function handleModalClose() {
		showAddFriendModal = false;
	}

	function handleFriendsListModalClose() {
		showFriendsListModal = false;
	}

	function handleAddFriendSubmit(event) {
		dispatch('addFriend', event.detail);
		showAddFriendModal = false;
	}

	function handleFriendRequestResponded(event) {
		// Refresh the pending requests count
		fetchPendingRequests();
		// Also refresh when modal closes
		setTimeout(() => {
			fetchPendingRequests();
		}, 500);
	}

	function handleFriendRemoved(event) {
		// Refresh the friends list
		setTimeout(() => {
			fetchPendingRequests();
		}, 500);
	}

	function fetchPendingRequests() {
		// Commented out to disable unused friend API calls
		/*
		const currentUser = localStorage.getItem('chronomuse_user');
		const user = currentUser ? JSON.parse(currentUser) : null;

		if (!user || !user.id) return;

		// Fetch pending friend requests count
		fetch(API_ENDPOINTS.getFriendRequestsCount, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ user_id: user.id })
		})
		.then(response => response.json())
		.then(data => {
			if (data.data) {
				pendingRequestsCount = data.data.pending_count;
			}
		})
		.catch(error => {
			console.error('Error fetching pending requests:', error);
		});

		// Fetch unread chats count
		fetch(API_ENDPOINTS.getChatList, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ user_id: user.id })
		})
		.then(response => response.json())
		.then(data => {
			if (data.data && data.data.friends) {
				unreadChatsCount = data.data.friends.reduce((total, friend) => total + (friend.unread_count || 0), 0);
			}
		})
		.catch(error => {
			console.error('Error fetching chat list:', error);
		});
		*/
	}

	onMount(() => {
		// Commented out to disable unused friend request polling
		// fetchPendingRequests();
		// const interval = setInterval(fetchPendingRequests, 10000);
		// return () => clearInterval(interval);
	});
</script>

<!-- Sidebar -->
<aside
	class="fixed left-0 top-16 h-[calc(100vh-4rem)] bg-white border-r-2 border-pink-300 shadow-lg transition-all duration-300 z-30 overflow-y-auto scrollbar-hide animate-fade-in-left"
	class:w-64={isOpen}
	class:w-0={!isOpen}
>
	<div class="p-4">
		<div class="space-y-2">
			<!-- Home Button -->
			<button
				onclick={handleHome}
				class="w-full py-2 px-4 rounded-lg transition-all duration-200 text-sm font-medium flex items-center justify-center space-x-2 animate-slide-in-right"
				style="animation-delay: 0.05s"
				class:bg-pink-500={isActive('/dashboard')}
				class:text-white={isActive('/dashboard')}
				class:bg-pink-100={!isActive('/dashboard')}
				class:text-pink-600={!isActive('/dashboard')}
				class:hover:bg-pink-200={!isActive('/dashboard')}
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
				</svg>
				<span>Home</span>
			</button>

			<!-- Mood Graph Button -->
			<button
				onclick={handleMoodGraph}
				class="w-full py-2 px-4 rounded-lg transition-all duration-200 text-sm font-medium flex items-center justify-center space-x-2 animate-slide-in-right"
				style="animation-delay: 0.1s"
				class:bg-pink-500={isActive('/mood-graph')}
				class:text-white={isActive('/mood-graph')}
				class:bg-pink-100={!isActive('/mood-graph')}
				class:text-pink-600={!isActive('/mood-graph')}
				class:hover:bg-pink-200={!isActive('/mood-graph')}
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
				</svg>
				<span>Mood Graph</span>
			</button>

			<!-- Chat Button
			<button
				onclick={handleChat}
				class="w-full py-2 px-4 rounded-lg transition-all duration-200 text-sm font-medium flex items-center justify-center space-x-2 relative animate-slide-in-right"
				style="animation-delay: 0.15s"
				class:bg-pink-500={isActive('/chat')}
				class:text-white={isActive('/chat')}
				class:bg-pink-100={!isActive('/chat')}
				class:text-pink-600={!isActive('/chat')}
				class:hover:bg-pink-200={!isActive('/chat')}
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
				</svg>
				<span>Chat</span>
				{#if unreadChatsCount > 0}
					<span class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
						{unreadChatsCount}
					</span>
				{/if}
			</button> -->

			<!-- Divider -->
			<div class="pt-2 mt-2 border-t border-pink-200"></div>

			<!-- Add Friend Button
			<button
				onclick={handleAddFriend}
				class="w-full py-2 px-4 bg-pink-100 text-pink-600 rounded-lg hover:bg-pink-200 transition-all duration-200 text-sm font-medium flex items-center justify-center space-x-2 relative animate-slide-in-right"
				style="animation-delay: 0.25s"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3.75 19.125a1.125 1.125 0 011.125-1.125h15.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H4.875a1.125 1.125 0 01-1.125-1.125v-2.25z" />
				</svg>
				<span>Add Friend</span>
				{#if pendingRequestsCount > 0}
					<span class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
						{pendingRequestsCount}
					</span>
				{/if}
			</button> -->

			<!-- Friends List Button
			<button
				onclick={handleFriendsList}
				class="w-full py-2 px-4 bg-pink-100 text-pink-600 rounded-lg hover:bg-pink-200 transition-all duration-200 text-sm font-medium flex items-center justify-center space-x-2 animate-slide-in-right"
				style="animation-delay: 0.3s"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
				</svg>
				<span>Friends List</span>
			</button> -->

			<!-- Profile Button -->
			<button
				onclick={handleProfile}
				class="w-full py-2 px-4 bg-pink-100 text-pink-600 rounded-lg hover:bg-pink-200 transition-all duration-200 text-sm font-medium flex items-center justify-center space-x-2 animate-slide-in-right"
				style="animation-delay: 0.35s"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
				</svg>
				<span>Profile</span>
			</button>

			<!-- Logout Button (Mobile Only - at bottom of list) -->
			<div class="md:hidden pt-4 mt-4 border-t border-pink-200 animate-fade-in-up" style="animation-delay: 0.4s">
				<button
					onclick={handleLogout}
					class="w-full py-2 px-4 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-lg hover:from-pink-500 hover:to-pink-700 transition-all duration-200 text-sm font-semibold shadow-md flex items-center justify-center space-x-2"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
					</svg>
					<span>Logout</span>
				</button>
			</div>
		</div>
	</div>
</aside>

<!-- Toggle Button - Desktop Only (outside Sidebar on the right edge) -->
<button
	onclick={toggleSidebar}
	class="hidden md:block fixed top-20 z-50 p-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-all duration-200 shadow-md"
	class:left-64={isOpen}
	class:left-0={!isOpen}
	title={isOpen ? 'Close Sidebar' : 'Open Sidebar'}
>
	{#if isOpen}
		<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
			<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
		</svg>
	{:else}
		<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
			<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
		</svg>
	{/if}
</button>

<!-- Add Friend Modal -->
<AddFriendModal open={showAddFriendModal} on:close={handleModalClose} on:addFriend={handleAddFriendSubmit} on:friendRequestResponded={handleFriendRequestResponded} />

<!-- Friends List Modal -->
<FriendsListModal open={showFriendsListModal} on:close={handleFriendsListModalClose} on:friendRemoved={handleFriendRemoved} />

<!-- Profile Modal -->
<ProfileModal open={showProfileModal} on:close={() => showProfileModal = false} />

<style>
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	@keyframes fade-in {
		0% {
			opacity: 0;
		}
		100% {
			opacity: 1;
		}
	}

	.animate-fade-in {
		animation: fade-in 0.3s ease-out;
	}

	@keyframes fade-in-left {
		0% {
			opacity: 0;
			transform: translateX(-20px);
		}
		100% {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.animate-fade-in-left {
		animation: fade-in-left 0.3s ease-out;
	}

	@keyframes fade-in-up {
		0% {
			opacity: 0;
			transform: translateY(20px);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fade-in-up {
		animation: fade-in-up 0.4s ease-out forwards;
		opacity: 0;
	}

	@keyframes slide-in-right {
		0% {
			opacity: 0;
			transform: translateX(-10px);
		}
		100% {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.animate-slide-in-right {
		animation: slide-in-right 0.3s ease-out forwards;
		opacity: 0;
	}
</style>
