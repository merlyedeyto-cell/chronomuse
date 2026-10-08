<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { Home, BarChart2, MessageCircle, Users, Bell, User, LogOut } from 'lucide-svelte';
	import AddFriendModal from './AddFriendModal.svelte';
	import FriendsListModal from './FriendsListModal.svelte';
	import NotificationsModal from './NotificationsModal.svelte';

	const dispatch = createEventDispatcher();
	let { isOpen = $bindable(false) } = $props();
	let showAddFriendModal = $state(false);
	let showFriendsListModal = $state(false);
	let showNotificationsModal = $state(false);
	let pendingRequestsCount = $state(0);
	let unreadChatsCount = $state(0);
	let notificationsCount = $state(0);
	let currentUserId = $state(null);

	function toggleSidebar() {
		isOpen = !isOpen;
	}

	function closeSidebar() {
		isOpen = false;
	}

	function handleHome() {
		closeSidebar();
		goto('/dashboard');
		dispatch('home');
	}

	function handleAddFriend() {
		closeSidebar();
		showAddFriendModal = true;
	}

	function handleFriends() {
		closeSidebar();
		goto('/friends');
	}

	function handleNotifications() {
		closeSidebar();
		goto('/notifications');
	}

	function handleProfile() {
		closeSidebar();
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent('chronomuse_go_self_profile'));
		}
		goto('/profile');
	}

	function handleChat() {
		closeSidebar();
		goto('/chat');
	}

	function handleMoodGraph() {
		closeSidebar();
		goto('/mood-graph');
		dispatch('moodGraph');
	}

	function handleLogout() {
		closeSidebar();
		localStorage.clear();
		sessionStorage.clear();
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new Event('chronomuse_auth_change'));
		}
		goto('/');
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
		const currentUser = localStorage.getItem('chronomuse_user');
		const user = currentUser ? JSON.parse(currentUser) : null;

		if (!user || !user.id) return;
		currentUserId = user.id;

		// Fetch notifications (shared memories & requests)
		fetch(API_ENDPOINTS.getNotifications, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ user_id: user.id })
		})
		.then(response => response.json())
		.then(data => {
			if (data.data) {
				notificationsCount = data.data.total_notifications_count || 0;
			}
		})
		.catch(err => console.error('Error fetching notifications:', err));

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
	}

	onMount(() => {
		fetchPendingRequests();
		const interval = setInterval(fetchPendingRequests, 45000);

		const handleRealtimeChange = () => {
			fetchPendingRequests();
		};

		const handleWindowFocus = () => {
			fetchPendingRequests();
		};

		window.addEventListener('focus', handleWindowFocus);
		window.addEventListener('chronomuse_friend_change', handleRealtimeChange);
		window.addEventListener('chronomuse_notification_change', handleRealtimeChange);
		window.addEventListener('chronomuse_new_message', handleRealtimeChange);
		window.addEventListener('chronomuse_memory_change', handleRealtimeChange);

		return () => {
			clearInterval(interval);
			window.removeEventListener('focus', handleWindowFocus);
			window.removeEventListener('chronomuse_friend_change', handleRealtimeChange);
			window.removeEventListener('chronomuse_notification_change', handleRealtimeChange);
			window.removeEventListener('chronomuse_new_message', handleRealtimeChange);
			window.removeEventListener('chronomuse_memory_change', handleRealtimeChange);
		};
	});
</script>

<!-- Backdrop Overlay (Clicking outside closes sidebar) -->
{#if isOpen}
	<button
		type="button"
		onclick={closeSidebar}
		class="fixed inset-0 bg-black/40 backdrop-blur-xs z-30 transition-opacity duration-300 cursor-default border-none outline-none"
		aria-label="Close sidebar overlay"
	></button>
{/if}

<!-- Sidebar -->
<aside
	class="fixed left-0 top-16 h-[calc(100vh-4rem)] bg-white transition-all duration-300 z-40 overflow-y-auto scrollbar-hide"
	class:w-64={isOpen}
	class:border-r-2={isOpen}
	class:border-pink-300={isOpen}
	class:w-0={!isOpen}
	class:border-none={!isOpen}
>
	<div class="p-4">
		<div class="space-y-2">
			<!-- Home Button -->
			<button
				onclick={handleHome}
				class="w-full py-2 px-4 rounded-lg transition-colors duration-150 text-sm font-medium flex items-center justify-center space-x-2"
				class:bg-pink-500={isActive('/dashboard')}
				class:text-white={isActive('/dashboard')}
				class:bg-pink-100={!isActive('/dashboard')}
				class:text-pink-600={!isActive('/dashboard')}
				class:hover:bg-pink-200={!isActive('/dashboard')}
			>
				<Home class="w-4 h-4" />
				<span>Home</span>
			</button>

			<!-- Mood Graph Button -->
			<button
				onclick={handleMoodGraph}
				class="w-full py-2 px-4 rounded-lg transition-colors duration-150 text-sm font-medium flex items-center justify-center space-x-2"
				class:bg-pink-500={isActive('/mood-graph')}
				class:text-white={isActive('/mood-graph')}
				class:bg-pink-100={!isActive('/mood-graph')}
				class:text-pink-600={!isActive('/mood-graph')}
				class:hover:bg-pink-200={!isActive('/mood-graph')}
			>
				<BarChart2 class="w-4 h-4" />
				<span>Mood Graph</span>
			</button>

			<!-- Chat Button -->
			<button
				onclick={handleChat}
				class="w-full py-2 px-4 rounded-lg transition-colors duration-150 text-sm font-medium flex items-center justify-center space-x-2 relative"
				class:bg-pink-500={isActive('/chat')}
				class:text-white={isActive('/chat')}
				class:bg-pink-100={!isActive('/chat')}
				class:text-pink-600={!isActive('/chat')}
				class:hover:bg-pink-200={!isActive('/chat')}
			>
				<MessageCircle class="w-4 h-4" />
				<span>Chat</span>
				{#if unreadChatsCount > 0}
					<span class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
						{unreadChatsCount}
					</span>
				{/if}
			</button>

			<!-- Divider -->
			<div class="pt-2 mt-2 border-t border-pink-200"></div>

			<!-- Friends Button (Navigates to /friends section) -->
			<button
				onclick={handleFriends}
				class="w-full py-2 px-4 rounded-lg transition-colors duration-150 text-sm font-medium flex items-center justify-center space-x-2 relative"
				class:bg-pink-500={isActive('/friends')}
				class:text-white={isActive('/friends')}
				class:bg-pink-100={!isActive('/friends')}
				class:text-pink-600={!isActive('/friends')}
				class:hover:bg-pink-200={!isActive('/friends')}
			>
				<Users class="w-4 h-4" />
				<span>Friends</span>
				{#if pendingRequestsCount > 0}
					<span class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
						{pendingRequestsCount}
					</span>
				{/if}
			</button>

			<!-- Notifications Button (Shared Memories & Alerts) -->
			<button
				onclick={handleNotifications}
				class="w-full py-2 px-4 rounded-lg transition-colors duration-150 text-sm font-medium flex items-center justify-center space-x-2 relative"
				class:bg-pink-500={isActive('/notifications')}
				class:text-white={isActive('/notifications')}
				class:bg-pink-100={!isActive('/notifications')}
				class:text-pink-600={!isActive('/notifications')}
				class:hover:bg-pink-200={!isActive('/notifications')}
			>
				<Bell class="w-4 h-4" />
				<span>Notifications</span>
				{#if notificationsCount > 0}
					<span class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
						{notificationsCount}
					</span>
				{/if}
			</button>

			<!-- Profile Button -->
			<button
				onclick={handleProfile}
				class="w-full py-2 px-4 rounded-lg transition-colors duration-150 text-sm font-medium flex items-center justify-center space-x-2"
				class:bg-pink-500={isActive('/profile')}
				class:text-white={isActive('/profile')}
				class:bg-pink-100={!isActive('/profile')}
				class:text-pink-600={!isActive('/profile')}
				class:hover:bg-pink-200={!isActive('/profile')}
			>
				<User class="w-4 h-4" />
				<span>Profile</span>
			</button>

			<!-- Logout Button (Available on all devices) -->
			<div class="pt-4 mt-4 border-t border-pink-200">
				<button
					onclick={handleLogout}
					class="w-full py-2 px-4 bg-pink-400 text-white rounded-lg hover:bg-pink-500 transition-colors duration-150 text-sm font-semibold flex items-center justify-center space-x-2"
				>
					<LogOut class="w-4 h-4" />
					<span>Logout</span>
				</button>
			</div>
		</div>
	</div>
</aside>

<!-- Notifications Modal -->
<NotificationsModal bind:isOpen={showNotificationsModal} userId={currentUserId} />

<!-- Add Friend Modal -->
<AddFriendModal open={showAddFriendModal} on:close={handleModalClose} on:addFriend={handleAddFriendSubmit} on:friendRequestResponded={handleFriendRequestResponded} />

<!-- Friends List Modal -->
<FriendsListModal open={showFriendsListModal} on:close={handleFriendsListModalClose} on:friendRemoved={handleFriendRemoved} />

<style>
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
