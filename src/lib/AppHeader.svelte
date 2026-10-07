<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabaseClient.js';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { playClickSound } from '$lib/soundEffects.js';

	let notificationsCount = $state(0);
	let unreadChatsCount = $state(0);
	let currentUserId = $state(null);
	let showLogoutModal = $state(false);

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

	function fetchNotifications() {
		if (typeof window === 'undefined') return;
		try {
			const currentUser = localStorage.getItem('chronomuse_user');
			const user = currentUser ? JSON.parse(currentUser) : null;
			if (!user || !user.id) return;
			currentUserId = user.id;

			fetch(API_ENDPOINTS.getNotifications, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id })
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
			const currentUser = localStorage.getItem('chronomuse_user');
			const user = currentUser ? JSON.parse(currentUser) : null;
			if (!user || !user.id) return;

			fetch(API_ENDPOINTS.getChatList, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id })
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
		fetchNotifications();
		fetchUnreadChats();

		// Sane fallback polling interval (60 seconds) to avoid network clogging
		const interval = setInterval(() => {
			fetchNotifications();
			fetchUnreadChats();
		}, 60000);

		const handleRealtime = () => {
			fetchNotifications();
			fetchUnreadChats();
		};

		const handleWindowFocus = () => {
			fetchNotifications();
			fetchUnreadChats();
		};

		window.addEventListener('focus', handleWindowFocus);
		window.addEventListener('chronomuse_notification_change', handleRealtime);
		window.addEventListener('chronomuse_friend_change', handleRealtime);
		window.addEventListener('chronomuse_memory_change', handleRealtime);
		window.addEventListener('chronomuse_new_message', handleRealtime);

		return () => {
			clearInterval(interval);
			window.removeEventListener('focus', handleWindowFocus);
			window.removeEventListener('chronomuse_notification_change', handleRealtime);
			window.removeEventListener('chronomuse_friend_change', handleRealtime);
			window.removeEventListener('chronomuse_memory_change', handleRealtime);
			window.removeEventListener('chronomuse_new_message', handleRealtime);
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
		<div class="flex items-center space-x-4 sm:space-x-6 lg:space-x-7">
			<!-- Desktop Navigation Bar (Text only with active pink underline) -->
			<nav class="hidden md:flex items-center space-x-5 lg:space-x-7 font-sans">
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
							{/if}
						</span>
						{#if activeIndex === idx}
							<span class="absolute -bottom-1 left-0 right-0 h-[2.5px] bg-[#f43f8e] rounded-full"></span>
						{/if}
					</button>
				{/each}
			</nav>

			<!-- Notification, Settings, and Logout Action Buttons -->
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
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 sm:w-5.5 sm:h-5.5">
						<path fill-rule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 01-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 004.496 0 25.057 25.057 0 01-4.496 0z" clip-rule="evenodd" />
					</svg>

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
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 sm:w-5.5 sm:h-5.5">
						<path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.08 5.4c-.838-.309-1.78.113-2.111.942l-1.07 2.68c-.332.83.044 1.776.84 2.17l1.09.54c.11.054.195.18.2.32a7.618 7.618 0 000 1.156c-.005.14-.09.266-.2.32l-1.09.54c-.796.394-1.172 1.34-.84 2.17l1.07 2.68c.33.829 1.273 1.251 2.111.942l1.238-.49c.115-.043.283-.032.45.083.31.214.64.407.985.57.182.088.277.228.297.348l.178 1.072c.151.904.933 1.567 1.85 1.567h2.844c.917 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.115-.26.297-.348.346-.163.675-.356.985-.57.167-.115.335-.126.45-.083l1.238.49c.838.309 1.78-.113 2.111-.942l1.07-2.68c.332-.83-.044-1.776-.84-2.17l-1.09-.54c-.11-.054-.195-.18-.2-.32a7.618 7.618 0 000-1.156c.005-.14.09-.266.2-.32l1.09-.54c.796-.394 1.172-1.34.84-2.17l-1.07-2.68c-.33-.829-1.273-1.251-2.111-.942l-1.238.49c-.115.043-.283.032-.45-.083a7.493 7.493 0 00-.985-.57c-.182-.088-.277-.228-.297-.348l-.178-1.072c-.151-.904-.933-1.567-1.85-1.567h-2.844zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clip-rule="evenodd" />
					</svg>
				</button>

				<!-- Logout Button -->
				<button
					type="button"
					onclick={() => { playClickSound(); showLogoutModal = true; }}
					class="p-1.5 sm:p-2 rounded-xl flex items-center justify-center text-pink-500 hover:text-rose-600 hover:bg-pink-50 active:scale-95 transition-all duration-150 cursor-pointer"
					aria-label="Logout"
					title="Log Out"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 sm:w-5.5 sm:h-5.5 transition-colors">
						<path fill-rule="evenodd" d="M7.5 3.75A1.5 1.5 0 0 0 6 5.25v13.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5V15a.75.75 0 0 1 1.5 0v3.75a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3V5.25a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3V9a.75.75 0 0 1-1.5 0V5.25a1.5 1.5 0 0 0-1.5-1.5h-6Zm10.72 4.72a.75.75 0 0 1 1.06 0l3 3a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 1 1-1.06-1.06l1.72-1.72H9a.75.75 0 0 1 0-1.5h10.94l-1.72-1.72a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
					</svg>
				</button>
			</div>
		</div>
	</div>
</header>

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
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 sm:w-7 sm:h-7 text-[#f43f8e]">
					<path fill-rule="evenodd" d="M7.5 3.75A1.5 1.5 0 0 0 6 5.25v13.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5V15a.75.75 0 0 1 1.5 0v3.75a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3V5.25a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3V9a.75.75 0 0 1-1.5 0V5.25a1.5 1.5 0 0 0-1.5-1.5h-6Zm10.72 4.72a.75.75 0 0 1 1.06 0l3 3a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 1 1-1.06-1.06l1.72-1.72H9a.75.75 0 0 1 0-1.5h10.94l-1.72-1.72a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
				</svg>
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
