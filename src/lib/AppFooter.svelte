<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { playClickSound } from '$lib/soundEffects.js';

	let { hideOnMobile = false } = $props();

	let unreadChatsCount = $state(0);
	let currentUserId = $state(null);
	let isOpen = $state(true);

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

	function toggleSidebar() {
		playClickSound();
		isOpen = !isOpen;
	}

	function fetchUnreadChats() {
		if (typeof window === 'undefined') return;
		try {
			const currentUser = localStorage.getItem('chronomuse_user');
			const user = currentUser ? JSON.parse(currentUser) : null;
			if (!user || !user.id) return;
			currentUserId = user.id;

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

	onMount(() => {
		fetchUnreadChats();
		const interval = setInterval(fetchUnreadChats, 2500);

		const handleRealtime = () => {
			fetchUnreadChats();
		};

		window.addEventListener('chronomuse_new_message', handleRealtime);
		window.addEventListener('chronomuse_friend_change', handleRealtime);
		window.addEventListener('chronomuse_notification_change', handleRealtime);

		return () => {
			clearInterval(interval);
			window.removeEventListener('chronomuse_new_message', handleRealtime);
			window.removeEventListener('chronomuse_friend_change', handleRealtime);
			window.removeEventListener('chronomuse_notification_change', handleRealtime);
		};
	});
</script>

<div class="fixed right-0 top-20 sm:top-24 z-40 pointer-events-none md:hidden flex items-start {hideOnMobile ? 'hidden' : 'flex'}">
	<!-- Toggle Arrow Button Tab -->
	<button
		type="button"
		onclick={toggleSidebar}
		class="pointer-events-auto w-6 h-11 mt-1 bg-white/95 backdrop-blur-md border-2 border-r-0 border-pink-200/90 rounded-l-2xl shadow-[-3px_4px_14px_rgba(0,0,0,0.08)] flex items-center justify-center text-pink-500 hover:text-[#f43f8e] active:scale-90 transition-all duration-200 cursor-pointer select-none"
		aria-label={isOpen ? 'Collapse navigation' : 'Open navigation'}
		title={isOpen ? 'Collapse navigation' : 'Open navigation'}
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="3"
			stroke="currentColor"
			class="w-3.5 h-3.5 transition-transform duration-300 {isOpen ? 'rotate-180' : 'rotate-0'}"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
		</svg>
	</button>

	<!-- Sliding Sidebar Dock Container -->
	<nav
		aria-label="Mobile Sidebar Navigation"
		class="pointer-events-auto bg-white/95 backdrop-blur-md border-2 border-r-0 border-pink-200/90 rounded-l-2xl p-1.5 shadow-[-4px_4px_20px_rgba(0,0,0,0.08)] flex flex-col items-center space-y-1.5 select-none font-sans transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] {isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}"
	>
		{#each navItems as item, idx}
			<button
				type="button"
				onclick={() => handleNavigate(item.path)}
				class="w-10 h-10 rounded-xl flex items-center justify-center relative transition-all duration-200 active:scale-90 cursor-pointer group select-none {activeIndex === idx ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-400 hover:text-[#f43f8e] hover:bg-pink-50'}"
				aria-label={item.label}
				title={item.label}
			>
				<div class="w-5 h-5 flex items-center justify-center transition-transform duration-200 {activeIndex === idx ? 'scale-105' : 'scale-100'}">
					{#if item.id === 'dashboard'}
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
							<path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75A3.75 3.75 0 0122.5 8.25v10.5A3.75 3.75 0 0118.75 22.5H5.25A3.75 3.75 0 011.5 18.75V8.25A3.75 3.75 0 015.25 4.5H6V3a.75.75 0 01.75-.75zm12 6.75H5.25a2.25 2.25 0 00-2.25 2.25v7.5a2.25 2.25 0 002.25 2.25h13.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25zM6.75 12.75a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H7.5a.75.75 0 01-.75-.75zm4.5 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H12a.75.75 0 01-.75-.75zm4.5 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H16.5a.75.75 0 01-.75-.75zm-9 3.75a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H7.5a.75.75 0 01-.75-.75zm4.5 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H12a.75.75 0 01-.75-.75zm4.5 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H16.5a.75.75 0 01-.75-.75z" clip-rule="evenodd" />
						</svg>
					{:else if item.id === 'moods'}
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
							<path fill-rule="evenodd" d="M3.75 14.25a2.25 2.25 0 012.25-2.25h1.5a2.25 2.25 0 012.25 2.25v5.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25v-5.25zm6.75-8.25a2.25 2.25 0 012.25-2.25h1.5a2.25 2.25 0 012.25 2.25v13.5a2.25 2.25 0 01-2.25 2.25h-1.5a2.25 2.25 0 01-2.25-2.25V6zm6.75 4.5a2.25 2.25 0 012.25-2.25h1.5a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-1.5a2.25 2.25 0 01-2.25-2.25v-9z" clip-rule="evenodd" />
						</svg>
					{:else if item.id === 'friends'}
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
							<path d="M6.25 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM3.25 19.125a7.125 7.125 0 0114.25 0v.003l-.001.122a.75.75 0 01-.749.75H4a.75.75 0 01-.749-.75l-.001-.122v-.003zM18.75 6.75a.75.75 0 00-.75.75v1.5h-1.5a.75.75 0 000 1.5h1.5v1.5a.75.75 0 001.5 0v-1.5h1.5a.75.75 0 000-1.5h-1.5v-1.5a.75.75 0 00-.75-.75z" />
						</svg>
					{:else if item.id === 'chat'}
						<div class="relative flex items-center justify-center">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
								<path fill-rule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.523 0 10-4.03 10-9s-4.477-9-10-9-10 4.03-10 9c0 2.215.88 4.25 2.377 5.797l-1.077 3.32a.75.75 0 00.904.927zM7.5 12a1 1 0 112 0 1 1 0 01-2 0zm3.5 0a1 1 0 112 0 1 1 0 01-2 0zm4.5-1a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd" />
							</svg>
							{#if unreadChatsCount > 0}
								<span class="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-0.5 bg-amber-400 text-rose-900 border border-white text-[8px] font-black rounded-full flex items-center justify-center shadow-2xs animate-pulse">
									{unreadChatsCount > 9 ? '9+' : unreadChatsCount}
								</span>
							{/if}
						</div>
					{:else if item.id === 'profile'}
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
							<path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clip-rule="evenodd" />
						</svg>
					{/if}
				</div>
			</button>
		{/each}
	</nav>
</div>




