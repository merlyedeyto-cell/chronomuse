<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabaseClient.js';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { playClickSound } from '$lib/soundEffects.js';
	import { Bell, Settings, LogOut, Menu } from 'lucide-svelte';
	import MobileSidebar from '$lib/MobileSidebar.svelte';

	let notificationsCount = $state(0);
	let unreadChatsCount = $state(0);
	let pendingFriendRequestsCount = $state(0);
	let currentUserId = $state(null);
	let currentUser = $state(null);
	let showLogoutModal = $state(false);
	let isMobileSidebarOpen = $state(false);

	const navItems = [
		{ id: 'dashboard', label: 'Calendar', path: '/dashboard' },
		{ id: 'moods', label: 'Moods', path: '/mood-graph' },
		{ id: 'friends', label: 'Friends', path: '/friends' },
		{ id: 'chat', label: 'Chat', path: '/chat' },
		{ id: 'profile', label: 'Profile', path: '/profile' }
	];

	let activeIndex = $derived.by(() => {
		const pathname = $page?.url?.pathname || '';
		if (pathname === '/dashboard' || pathname === '/' || pathname.startsWith('/dashboard')) return 0;
		if (pathname.startsWith('/mood-graph') || pathname.startsWith('/moods')) return 1;
		if (pathname.startsWith('/friends')) return 2;
		if (pathname.startsWith('/chat')) return 3;
		if (pathname.startsWith('/profile')) return 4;
		return 0;
	});

	let totalMobileBadgeCount = $derived(notificationsCount + unreadChatsCount + pendingFriendRequestsCount);

	let displayMobileUsername = $derived.by(() => {
		const rawName = currentUser?.username || 'User';
		return rawName.length > 6 ? rawName.slice(0, 6) + '...' : rawName;
	});

	function loadUserData() {
		if (typeof window === 'undefined') return;
		try {
			const stored = localStorage.getItem('chronomuse_user');
			currentUser = stored ? JSON.parse(stored) : null;
			currentUserId = currentUser?.id || null;
		} catch (e) {
			currentUser = null;
			currentUserId = null;
		}
	}

	function fetchNotifications() {
		if (typeof window === 'undefined') return;
		try {
			loadUserData();
			if (!currentUserId) return;

			fetch(API_ENDPOINTS.getNotifications, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: currentUserId })
			})
			.then(r => r.json())
			.then(data => {
				if (data?.data) {
					notificationsCount = data.data.total_notifications_count || 0;
				}
			})
			.catch(() => {});
		} catch (e) {}
	}

	function fetchUnreadChats() {
		if (typeof window === 'undefined') return;
		try {
			loadUserData();
			if (!currentUserId) return;

			fetch(API_ENDPOINTS.getChatList, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: currentUserId })
			})
			.then(r => r.json())
			.then(data => {
				if (data?.data?.friends) {
					unreadChatsCount = data.data.friends.reduce((sum, f) => sum + (f.unread_count || 0), 0);
				}
			})
			.catch(() => {});
		} catch (e) {}
	}

	function fetchFriendRequests() {
		if (typeof window === 'undefined') return;
		try {
			loadUserData();
			if (!currentUserId) return;

			fetch(API_ENDPOINTS.getFriendRequestsCount, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: currentUserId })
			})
			.then(r => r.json())
			.then(data => {
				if (data?.data) {
					pendingFriendRequestsCount = data.data.pending_count || 0;
				}
			})
			.catch(() => {});
		} catch (e) {}
	}

	function refreshAllCounts() {
		fetchNotifications();
		fetchUnreadChats();
		fetchFriendRequests();
	}

	function handleNavigate(path) {
		playClickSound();
		if (path === '/profile') {
			if (typeof window !== 'undefined') {
				window.dispatchEvent(new CustomEvent('chronomuse_go_self_profile'));
			}
		}
		goto(path);
	}

	function handleNotificationClick() {
		playClickSound();
		goto('/notifications');
	}

	function handleSettingsClick() {
		playClickSound();
		goto('/settings');
	}

	function toggleMobileSidebar() {
		playClickSound();
		isMobileSidebarOpen = !isMobileSidebarOpen;
	}

	function handleLogout() {
		try {
			supabase.removeAllChannels();
		} catch (e) {}

		// Preserve user active status setting before wiping local storage
		const savedActiveStatus = currentUserId ? localStorage.getItem(`chronomuse_active_status_${currentUserId}`) : null;
		const savedPrivateStatus = currentUserId ? localStorage.getItem(`chronomuse_private_${currentUserId}`) : null;

		localStorage.clear();
		sessionStorage.clear();

		if (currentUserId) {
			if (savedActiveStatus !== null) localStorage.setItem(`chronomuse_active_status_${currentUserId}`, savedActiveStatus);
			if (savedPrivateStatus !== null) localStorage.setItem(`chronomuse_private_${currentUserId}`, savedPrivateStatus);
		}

		if (typeof window !== 'undefined') {
			window.dispatchEvent(new Event('chronomuse_auth_change'));
		}
		goto('/');
	}

	onMount(() => {
		refreshAllCounts();

		// Sane fallback polling interval (45 seconds)
		const interval = setInterval(refreshAllCounts, 45000);

		const handleRealtime = () => {
			refreshAllCounts();
		};

		const handleWindowFocus = () => {
			refreshAllCounts();
		};

		window.addEventListener('focus', handleWindowFocus);
		window.addEventListener('chronomuse_notification_change', handleRealtime);
		window.addEventListener('chronomuse_friend_change', handleRealtime);
		window.addEventListener('chronomuse_memory_change', handleRealtime);
		window.addEventListener('chronomuse_new_message', handleRealtime);
		window.addEventListener('chronomuse_profile_updated', loadUserData);

		return () => {
			clearInterval(interval);
			window.removeEventListener('focus', handleWindowFocus);
			window.removeEventListener('chronomuse_notification_change', handleRealtime);
			window.removeEventListener('chronomuse_friend_change', handleRealtime);
			window.removeEventListener('chronomuse_memory_change', handleRealtime);
			window.removeEventListener('chronomuse_new_message', handleRealtime);
			window.removeEventListener('chronomuse_profile_updated', loadUserData);
		};
	});
</script>

<header class="bg-white/95 backdrop-blur-md sticky top-0 z-40 transition-all border-b border-pink-100/90 shadow-2xs">
	<div class="max-w-6xl xl:max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-2.5 flex items-center justify-between gap-3">
		<!-- Left: Logo & App Brand -->
		<a href="/dashboard" class="flex items-center space-x-2.5 sm:space-x-3 group cursor-pointer select-none">
			<div class="w-9 h-9 sm:w-10 sm:h-10 md:w-10.5 md:h-10.5 rounded-xl sm:rounded-2xl bg-black flex items-center justify-center p-1 shadow-xs group-hover:scale-105 transition-transform duration-200">
				<img src="/logo.png" alt="ChronoMuse Mascot" class="w-7 h-7 sm:w-8 sm:h-8 md:w-8.5 md:h-8.5 object-contain pointer-events-none" />
			</div>
			<span class="text-lg sm:text-2xl font-black font-sans text-[#ff3e88] tracking-tight group-hover:text-pink-600 transition-colors select-none">ChronoMuse</span>
		</a>

		<!-- Right Container: Desktop Navigation + Action Buttons -->
		<div class="hidden md:flex items-center space-x-4 sm:space-x-6 lg:space-x-7">
			<!-- Desktop Navigation Bar (Text only with active pink underline) -->
			<nav class="flex items-center space-x-5 lg:space-x-7 font-sans">
				{#each navItems as item, idx}
					<button
						type="button"
						onclick={() => handleNavigate(item.path)}
						class="relative py-1 text-xs lg:text-[13.5px] font-black tracking-tight transition-colors cursor-pointer select-none flex items-center {activeIndex === idx ? 'text-[#f43f8e]' : 'text-pink-600 hover:text-[#f43f8e]'}"
					>
						<span class="relative">
							{item.label}
							{#if item.id === 'chat' && unreadChatsCount > 0}
								<span class="absolute -top-1.5 -right-3.5 min-w-3.5 h-3.5 px-0.5 bg-[#f43f5e] text-white text-[8px] font-black rounded-full flex items-center justify-center shadow-xs animate-pulse">
									{unreadChatsCount > 9 ? '9+' : unreadChatsCount}
								</span>
							{:else if item.id === 'friends' && pendingFriendRequestsCount > 0}
								<span class="absolute -top-1.5 -right-3.5 min-w-3.5 h-3.5 px-0.5 bg-[#f43f8e] text-white text-[8px] font-black rounded-full flex items-center justify-center shadow-xs animate-pulse">
									{pendingFriendRequestsCount > 9 ? '9+' : pendingFriendRequestsCount}
								</span>
							{/if}
						</span>
						{#if activeIndex === idx}
							<span class="absolute -bottom-1 left-0 right-0 h-[2.5px] bg-[#f43f8e] rounded-full"></span>
						{/if}
					</button>
				{/each}
			</nav>

			<!-- Desktop Notification, Settings, and Logout Action Buttons -->
			<div class="flex items-center space-x-1 sm:space-x-1.5">
				<!-- Notifications Button -->
				<button
					type="button"
					onclick={handleNotificationClick}
					class="p-1.5 sm:p-2 rounded-xl flex items-center justify-center relative text-pink-500 hover:text-[#f43f8e] hover:bg-pink-50 active:scale-95 transition-all duration-150 cursor-pointer"
					class:text-[#f43f8e]={$page.url.pathname === '/notifications'}
					aria-label="Notifications"
					title="Notifications"
				>
					<Bell class="w-5 h-5 sm:w-5.5 sm:h-5.5" />

					{#if notificationsCount > 0}
						<span class="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 bg-[#f43f5e] text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-xs animate-pulse">
							{notificationsCount > 99 ? '99+' : notificationsCount}
						</span>
					{/if}
				</button>

				<!-- Settings Button -->
				<button
					type="button"
					onclick={handleSettingsClick}
					class="p-1.5 sm:p-2 rounded-xl flex items-center justify-center text-pink-500 hover:text-[#f43f8e] hover:bg-pink-50 active:scale-95 transition-all duration-150 cursor-pointer"
					class:text-[#f43f8e]={$page.url.pathname === '/settings'}
					aria-label="Settings"
					title="Settings"
				>
					<Settings class="w-5 h-5 sm:w-5.5 sm:h-5.5" />
				</button>

				<!-- Logout Button -->
				<button
					type="button"
					onclick={() => { playClickSound(); showLogoutModal = true; }}
					class="p-1.5 sm:p-2 rounded-xl flex items-center justify-center text-pink-500 hover:text-rose-600 hover:bg-pink-50 active:scale-95 transition-all duration-150 cursor-pointer"
					aria-label="Logout"
					title="Log Out"
				>
					<LogOut class="w-5 h-5 sm:w-5.5 sm:h-5.5 transition-colors" />
				</button>
			</div>
		</div>

		<!-- Mobile Header Right: Username Text + Sidebar Hamburger Toggle Button -->
		<div class="flex md:hidden items-center space-x-2.5">
			<!-- User Name Text (Non-clickable, max 6 chars + ...) -->
			<span
				class="text-xs sm:text-sm font-extrabold text-pink-600/90 select-none tracking-tight cursor-default"
			>
				{displayMobileUsername}
			</span>

			<!-- Mobile Hamburger Menu Button -->
			<button
				type="button"
				onclick={toggleMobileSidebar}
				class="p-2 rounded-2xl relative bg-pink-50/80 hover:bg-pink-100 text-[#f43f8e] active:scale-95 transition-all duration-150 cursor-pointer border border-pink-200/80 shadow-2xs"
				aria-label="Open mobile navigation menu"
				aria-expanded={isMobileSidebarOpen}
			>
				<Menu class="w-6 h-6" />

				<!-- Activity indicator dot if unread items exist -->
				{#if totalMobileBadgeCount > 0}
					<span class="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-[#f43f8e] text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-xs animate-pulse border-2 border-white">
						{totalMobileBadgeCount > 99 ? '99+' : totalMobileBadgeCount}
					</span>
				{/if}
			</button>
		</div>
	</div>
</header>

<!-- Mobile Sidebar Drawer Component -->
<MobileSidebar
	bind:isOpen={isMobileSidebarOpen}
	{notificationsCount}
	{unreadChatsCount}
	{pendingFriendRequestsCount}
	{currentUser}
	onLogout={() => { showLogoutModal = true; }}
/>

<!-- Logout Confirmation Modal -->
{#if showLogoutModal}
	<div
		class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-3.5 sm:p-4 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget) showLogoutModal = false; }}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onkeydown={(e) => { if (e.key === 'Escape') showLogoutModal = false; }}
	>
		<div class="bg-white border border-pink-100/90 rounded-3xl max-w-xs sm:max-w-md w-full p-5 sm:p-7 text-center relative overflow-hidden shadow-2xl animate-scale-up">
			<div class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center mx-auto mb-3 shadow-2xs">
				<LogOut class="w-6 h-6 sm:w-7 sm:h-7 text-[#f43f8e]" />
			</div>

			<h3 class="text-sm sm:text-lg font-black text-pink-950 mb-1 sm:mb-1.5">Log Out of ChronoMuse?</h3>
			<p class="text-xs sm:text-sm text-pink-400 mb-5 sm:mb-6 font-medium">
				Are you sure you want to log out of your account?
			</p>

			<div class="flex items-center space-x-2.5 sm:space-x-3">
				<button
					type="button"
					onclick={() => showLogoutModal = false}
					class="w-1/2 py-2.5 sm:py-3 bg-pink-50 text-pink-700 hover:bg-pink-100 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm transition-all cursor-pointer active:scale-95 shadow-2xs"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={handleLogout}
					class="w-1/2 py-2.5 sm:py-3 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shadow-md"
				>
					Log Out
				</button>
			</div>
		</div>
	</div>
{/if}
