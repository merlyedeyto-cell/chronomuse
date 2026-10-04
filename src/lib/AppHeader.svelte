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

<header class="bg-pink-100/90 sm:bg-pink-100/95 backdrop-blur-md sticky top-0 z-40 transition-all border-b border-pink-200/60 shadow-xs">
	<div class="max-w-6xl xl:max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-2.5 flex items-center justify-between gap-3">
		<!-- Left: Logo & App Brand -->
		<a href="/dashboard" class="flex items-center space-x-2.5 sm:space-x-3 group cursor-pointer select-none">
			<div class="w-9 h-9 sm:w-10 sm:h-10 md:w-10.5 md:h-10.5 rounded-xl sm:rounded-2xl bg-black flex items-center justify-center p-1 shadow-xs group-hover:scale-105 transition-transform duration-200">
				<img src="/logo.png" alt="ChronoMuse Mascot" class="w-7 h-7 sm:w-8 sm:h-8 md:w-8.5 md:h-8.5 object-contain pointer-events-none" />
			</div>
			<span class="text-lg sm:text-2xl font-black font-sans text-[#ff3e88] tracking-tight group-hover:text-pink-600 transition-colors select-none">ChronoMuse</span>
		</a>

		<!-- Right Container: Desktop Navigation + Action Buttons -->
		<div class="flex items-center space-x-2.5 sm:space-x-3 lg:space-x-4">
			<!-- Desktop Navigation Bar (Tabs) -->
			<nav class="hidden md:flex items-center space-x-1 sm:space-x-1.5 bg-white/95 backdrop-blur-md px-2 py-1 rounded-full border border-pink-200/90 shadow-2xs font-sans">
				{#each navItems as item, idx}
					<button
						type="button"
						onclick={() => handleNavigate(item.path)}
						class="px-3 lg:px-3.5 py-1.5 rounded-full text-xs lg:text-[13px] font-black transition-all flex items-center space-x-1.5 cursor-pointer select-none active:scale-95 {activeIndex === idx ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-600 hover:text-[#f43f8e] hover:bg-pink-50'}"
					>
						{#if item.id === 'dashboard'}
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 lg:w-4 lg:h-4">
								<path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75A3.75 3.75 0 0122.5 8.25v10.5A3.75 3.75 0 0118.75 22.5H5.25A3.75 3.75 0 011.5 18.75V8.25A3.75 3.75 0 015.25 4.5H6V3a.75.75 0 01.75-.75zm12 6.75H5.25a2.25 2.25 0 00-2.25 2.25v7.5a2.25 2.25 0 002.25 2.25h13.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25zM6.75 12.75a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H7.5a.75.75 0 01-.75-.75zm4.5 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H12a.75.75 0 01-.75-.75zm4.5 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H16.5a.75.75 0 01-.75-.75zm-9 3.75a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H7.5a.75.75 0 01-.75-.75zm4.5 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H12a.75.75 0 01-.75-.75zm4.5 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H16.5a.75.75 0 01-.75-.75z" clip-rule="evenodd" />
							</svg>
						{:else if item.id === 'moods'}
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 lg:w-4 lg:h-4">
								<path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75zM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 01-1.875-1.875V8.625zM3 13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 013 19.875v-6.75z" />
							</svg>
						{:else if item.id === 'friends'}
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 lg:w-4 lg:h-4">
								<path d="M6.25 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM3.25 19.125a7.125 7.125 0 0114.25 0v.003l-.001.122a.75.75 0 01-.749.75H4a.75.75 0 01-.749-.75l-.001-.122v-.003zM18.75 6.75a.75.75 0 00-.75.75v1.5h-1.5a.75.75 0 000 1.5h1.5v1.5a.75.75 0 001.5 0v-1.5h1.5a.75.75 0 000-1.5h-1.5v-1.5a.75.75 0 00-.75-.75z" />
							</svg>
						{:else if item.id === 'chat'}
							<div class="relative flex items-center justify-center">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 lg:w-4 lg:h-4">
									<path fill-rule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.523 0 10-4.03 10-9s-4.477-9-10-9-10 4.03-10 9c0 2.215.88 4.25 2.377 5.797l-1.077 3.32a.75.75 0 00.904.927zM7.5 12a1 1 0 112 0 1 1 0 01-2 0zm3.5 0a1 1 0 112 0 1 1 0 01-2 0zm4.5-1a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd" />
								</svg>
								{#if unreadChatsCount > 0}
									<span class="absolute -top-1.5 -right-2 min-w-3.5 h-3.5 px-0.5 bg-amber-400 text-rose-900 border border-white text-[8px] font-black rounded-full flex items-center justify-center shadow-xs animate-pulse">
										{unreadChatsCount > 9 ? '9+' : unreadChatsCount}
									</span>
								{/if}
							</div>
						{:else if item.id === 'profile'}
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 lg:w-4 lg:h-4">
								<path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clip-rule="evenodd" />
							</svg>
						{/if}
						<span>{item.label}</span>
					</button>
				{/each}
			</nav>

			<!-- Notification, Settings, and Logout Action Buttons -->
			<div class="flex items-center space-x-1.5 sm:space-x-2">
				<!-- Notifications Button -->
				<button
					type="button"
					onclick={handleNotificationClick}
					class="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-xl bg-white border border-pink-200/90 shadow-2xs flex items-center justify-center relative text-pink-500 hover:bg-pink-50/80 active:scale-95 transition-all duration-150 cursor-pointer"
					class:border-pink-400={$page.url.pathname === '/notifications'}
					class:bg-pink-50={$page.url.pathname === '/notifications'}
					aria-label="Notifications"
					title="Notifications"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 sm:w-4.5 sm:h-4.5 text-pink-500">
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
					class="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-xl bg-white border border-pink-200/90 shadow-2xs flex items-center justify-center text-pink-500 hover:bg-pink-50/80 active:scale-95 transition-all duration-150 cursor-pointer"
					class:border-pink-400={$page.url.pathname === '/settings'}
					class:bg-pink-50={$page.url.pathname === '/settings'}
					aria-label="Settings"
					title="Settings"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 sm:w-4.5 sm:h-4.5 text-pink-500">
						<path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.08 5.4c-.838-.309-1.78.113-2.111.942l-1.07 2.68c-.332.83.044 1.776.84 2.17l1.09.54c.11.054.195.18.2.32a7.618 7.618 0 000 1.156c-.005.14-.09.266-.2.32l-1.09.54c-.796.394-1.172 1.34-.84 2.17l1.07 2.68c.33.829 1.273 1.251 2.111.942l1.238-.49c.115-.043.283-.032.45.083.31.214.64.407.985.57.182.088.277.228.297.348l.178 1.072c.151.904.933 1.567 1.85 1.567h2.844c.917 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.115-.26.297-.348.346-.163.675-.356.985-.57.167-.115.335-.126.45-.083l1.238.49c.838.309 1.78-.113 2.111-.942l1.07-2.68c.332-.83-.044-1.776-.84-2.17l-1.09-.54c-.11-.054-.195-.18-.2-.32a7.618 7.618 0 000-1.156c.005-.14.09-.266.2-.32l1.09-.54c.796-.394 1.172-1.34.84-2.17l-1.07-2.68c-.33-.829-1.273-1.251-2.111-.942l-1.238.49c-.115.043-.283.032-.45-.083a7.493 7.493 0 00-.985-.57c-.182-.088-.277-.228-.297-.348l-.178-1.072c-.151-.904-.933-1.567-1.85-1.567h-2.844zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clip-rule="evenodd" />
					</svg>
				</button>

				<!-- Logout Button -->
				<button
					type="button"
					onclick={() => { playClickSound(); showLogoutModal = true; }}
					class="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-xl bg-white border border-pink-200/90 shadow-2xs flex items-center justify-center text-pink-500 hover:text-rose-600 hover:bg-pink-50/80 active:scale-95 transition-all duration-150 cursor-pointer"
					aria-label="Logout"
					title="Log Out"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 sm:w-4.5 sm:h-4.5 text-pink-500 hover:text-rose-600 transition-colors">
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
