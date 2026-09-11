<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { playClickSound } from '$lib/soundEffects.js';

	let notificationsCount = $state(0);
	let currentUserId = $state(null);

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

	function handleNotificationClick() {
		playClickSound();
		goto('/notifications');
	}

	function handleSettingsClick() {
		playClickSound();
		goto('/settings');
	}

	onMount(() => {
		fetchNotifications();
		const interval = setInterval(fetchNotifications, 2500);

		const handleRealtime = () => {
			fetchNotifications();
		};

		window.addEventListener('chronomuse_notification_change', handleRealtime);
		window.addEventListener('chronomuse_friend_change', handleRealtime);
		window.addEventListener('chronomuse_memory_change', handleRealtime);

		return () => {
			clearInterval(interval);
			window.removeEventListener('chronomuse_notification_change', handleRealtime);
			window.removeEventListener('chronomuse_friend_change', handleRealtime);
			window.removeEventListener('chronomuse_memory_change', handleRealtime);
		};
	});
</script>

<header class="bg-pink-100/90 sm:bg-pink-100/95 backdrop-blur-md sticky top-0 z-40 transition-all">
	<div class="container mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between">
		<!-- Left: Logo & App Brand -->
		<a href="/dashboard" class="flex items-center space-x-3 group cursor-pointer select-none">
			<div class="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-black flex items-center justify-center p-1 shadow-sm group-hover:scale-105 transition-transform duration-200">
				<img src="/logo.png" alt="ChronoMuse Mascot" class="w-8 h-8 sm:w-9 sm:h-9 object-contain pointer-events-none" />
			</div>
			<span class="text-xl sm:text-2xl font-black font-sans text-[#ff3e88] tracking-tight group-hover:text-pink-600 transition-colors select-none">ChronoMuse</span>
		</a>

		<!-- Right: Notification and Settings Action Buttons -->
		<div class="flex items-center space-x-2.5 sm:space-x-3">
			<!-- Notifications Button -->
			<button
				type="button"
				onclick={handleNotificationClick}
				class="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white border-2 border-pink-200/90 shadow-sm flex items-center justify-center relative text-pink-500 hover:bg-pink-50/80 active:scale-95 transition-all duration-150 cursor-pointer"
				class:border-pink-400={$page.url.pathname === '/notifications'}
				class:bg-pink-50={$page.url.pathname === '/notifications'}
				aria-label="Notifications"
				title="Notifications"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 sm:w-6 sm:h-6 text-pink-500">
					<path fill-rule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 01-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 004.496 0 25.057 25.057 0 01-4.496 0z" clip-rule="evenodd" />
				</svg>

				{#if notificationsCount > 0}
					<span class="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-[#f43f5e] text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-sm animate-pulse">
						{notificationsCount > 99 ? '99+' : notificationsCount}
					</span>
				{/if}
			</button>

			<!-- Settings Button -->
			<button
				type="button"
				onclick={handleSettingsClick}
				class="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white border-2 border-pink-200/90 shadow-sm flex items-center justify-center text-pink-500 hover:bg-pink-50/80 active:scale-95 transition-all duration-150 cursor-pointer"
				class:border-pink-400={$page.url.pathname === '/settings'}
				class:bg-pink-50={$page.url.pathname === '/settings'}
				aria-label="Settings"
				title="Settings"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 sm:w-6 sm:h-6 text-pink-500">
					<path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.08 5.4c-.838-.309-1.78.113-2.111.942l-1.07 2.68c-.332.83.044 1.776.84 2.17l1.09.54c.11.054.195.18.2.32a7.618 7.618 0 000 1.156c-.005.14-.09.266-.2.32l-1.09.54c-.796.394-1.172 1.34-.84 2.17l1.07 2.68c.33.829 1.273 1.251 2.111.942l1.238-.49c.115-.043.283-.032.45.083.31.214.64.407.985.57.182.088.277.228.297.348l.178 1.072c.151.904.933 1.567 1.85 1.567h2.844c.917 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.115-.26.297-.348.346-.163.675-.356.985-.57.167-.115.335-.126.45-.083l1.238.49c.838.309 1.78-.113 2.111-.942l1.07-2.68c.332-.83-.044-1.776-.84-2.17l-1.09-.54c-.11-.054-.195-.18-.2-.32a7.618 7.618 0 000-1.156c.005-.14.09-.266.2-.32l1.09-.54c.796-.394 1.172-1.34.84-2.17l-1.07-2.68c-.33-.829-1.273-1.251-2.111-.942l-1.238.49c-.115.043-.283.032-.45-.083a7.493 7.493 0 00-.985-.57c-.182-.088-.277-.228-.297-.348l-.178-1.072c-.151-.904-.933-1.567-1.85-1.567h-2.844zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clip-rule="evenodd" />
				</svg>
			</button>
		</div>
	</div>
</header>
