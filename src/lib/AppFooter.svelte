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
	let showSequentialTooltips = $state(false);
	let tooltipTimer = null;

	// Draggable Position & Side state
	let side = $state('right'); // 'right' or 'left'
	let topY = $state(96); // pixels from top
	let isDragging = $state(false);
	let startPointerX = 0;
	let startPointerY = 0;
	let initialTopY = 0;
	let hasMoved = false;

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
		if (isOpen) {
			showSequentialTooltips = true;
			if (tooltipTimer) clearTimeout(tooltipTimer);
			tooltipTimer = setTimeout(() => {
				showSequentialTooltips = false;
			}, 2800);
		} else {
			showSequentialTooltips = false;
			if (tooltipTimer) clearTimeout(tooltipTimer);
		}
	}

	function handlePointerDown(e) {
		startPointerX = e.clientX;
		startPointerY = e.clientY;
		initialTopY = topY;
		hasMoved = false;

		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
		window.addEventListener('pointercancel', handlePointerUp);
	}

	function handlePointerMove(e) {
		const deltaX = e.clientX - startPointerX;
		const deltaY = e.clientY - startPointerY;

		if (!hasMoved && Math.hypot(deltaX, deltaY) > 6) {
			hasMoved = true;
			isDragging = true;
		}

		if (hasMoved) {
			if (typeof window !== 'undefined') {
				const maxTop = Math.max(100, window.innerHeight - 300);
				topY = Math.max(68, Math.min(maxTop, initialTopY + deltaY));
				const midScreen = window.innerWidth / 2;
				side = e.clientX < midScreen ? 'left' : 'right';
			}
		}
	}

	function handlePointerUp(e) {
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', handlePointerUp);
		window.removeEventListener('pointercancel', handlePointerUp);

		if (hasMoved) {
			if (typeof window !== 'undefined') {
				const midScreen = window.innerWidth / 2;
				side = e.clientX < midScreen ? 'left' : 'right';
				const maxTop = Math.max(100, window.innerHeight - 300);
				topY = Math.max(68, Math.min(maxTop, topY));
				try {
					localStorage.setItem('chronomuse_nav_pos', JSON.stringify({ side, topY }));
				} catch (err) {}
			}
			setTimeout(() => {
				isDragging = false;
			}, 100);
		} else {
			isDragging = false;
			toggleSidebar();
		}
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
		if (isDragging) return;
		playClickSound();
		if (path === '/profile') {
			if (typeof window !== 'undefined') {
				window.dispatchEvent(new CustomEvent('chronomuse_go_self_profile'));
			}
		}
		goto(path);
	}

	onMount(() => {
		try {
			const saved = localStorage.getItem('chronomuse_nav_pos');
			if (saved) {
				const parsed = JSON.parse(saved);
				if (parsed.side === 'left' || parsed.side === 'right') side = parsed.side;
				if (typeof parsed.topY === 'number') {
					topY = Math.max(68, Math.min(window.innerHeight - 300, parsed.topY));
				}
			}
		} catch (e) {}

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
			if (tooltipTimer) clearTimeout(tooltipTimer);
			window.removeEventListener('chronomuse_new_message', handleRealtime);
			window.removeEventListener('chronomuse_friend_change', handleRealtime);
			window.removeEventListener('chronomuse_notification_change', handleRealtime);
		};
	});
</script>

<!-- Draggable Mobile Navigation Container -->
<div
	class="fixed z-40 md:hidden select-none touch-none {side === 'left' ? 'left-0' : 'right-0'} {hideOnMobile ? 'hidden' : 'block'} {isDragging ? 'transition-none cursor-grabbing opacity-90' : 'transition-all duration-300 ease-out'}"
	style="top: {topY}px;"
>
	<!-- Collapsed Tab Handle (visible when !isOpen) -->
	{#if !isOpen}
		<button
			type="button"
			onpointerdown={handlePointerDown}
			class="group/tab w-8 h-12 bg-white/95 backdrop-blur-md border-2 border-pink-300 flex items-center justify-center text-[#f43f8e] hover:bg-pink-50 active:scale-95 transition-all duration-200 cursor-grab active:cursor-grabbing {side === 'left' ? 'border-l-0 rounded-r-2xl shadow-[3px_4px_16px_rgba(244,63,142,0.22)]' : 'border-r-0 rounded-l-2xl shadow-[-3px_4px_16px_rgba(244,63,142,0.22)]'}"
			aria-label="Drag or tap to open navigation"
			title="Drag to move, tap to open"
		>
			<div class="relative flex items-center justify-center">
				{#if side === 'left'}
					<!-- Left side arrow points right -->
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2.5"
						stroke="currentColor"
						class="w-5 h-5 transition-transform duration-200 group-hover/tab:translate-x-0.5"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
					</svg>
				{:else}
					<!-- Right side arrow points left -->
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2.5"
						stroke="currentColor"
						class="w-5 h-5 transition-transform duration-200 group-hover/tab:-translate-x-0.5"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
					</svg>
				{/if}

				{#if unreadChatsCount > 0}
					<span class="absolute -top-3.5 {side === 'left' ? '-right-2' : '-left-2'} w-2.5 h-2.5 bg-[#f43f8e] border-2 border-white rounded-full animate-ping"></span>
					<span class="absolute -top-3.5 {side === 'left' ? '-right-2' : '-left-2'} w-2.5 h-2.5 bg-[#f43f8e] border-2 border-white rounded-full"></span>
				{/if}
			</div>

			<!-- Floating Themed Tooltip on Tab Hover -->
			<div class="absolute {side === 'left' ? 'left-full ml-2.5' : 'right-full mr-2.5'} top-1/2 -translate-y-1/2 opacity-0 group-hover/tab:opacity-100 {side === 'left' ? '-translate-x-1 group-hover/tab:translate-x-0' : 'translate-x-1 group-hover/tab:translate-x-0'} transition-all duration-200 pointer-events-none z-50">
				<div class="relative bg-gradient-to-r from-pink-500 to-[#f43f8e] text-white text-[11px] font-black px-2.5 py-1 rounded-xl shadow-[-2px_4px_12px_rgba(244,63,142,0.3)] border border-pink-200/40 whitespace-nowrap flex items-center gap-1">
					<span>Open Menu</span>
					<span class="text-[9px] opacity-80 font-normal">· Hold to drag</span>
					<div class="absolute top-1/2 -translate-y-1/2 {side === 'left' ? 'right-full border-r-4 border-r-[#f43f8e]' : 'left-full border-l-4 border-l-[#f43f8e]'} w-0 h-0 border-y-4 border-y-transparent"></div>
				</div>
			</div>
		</button>
	{/if}

	<!-- Sliding Sidebar Dock Container -->
	<nav
		aria-label="Mobile Sidebar Navigation"
		class="bg-white/95 backdrop-blur-md border-2 border-pink-200/90 p-1.5 flex flex-col items-center space-y-1.5 font-sans transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] {side === 'left' ? 'border-l-0 rounded-r-2xl shadow-[4px_4px_24px_rgba(0,0,0,0.09)]' : 'border-r-0 rounded-l-2xl shadow-[-4px_4px_24px_rgba(0,0,0,0.09)]'} {isOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : side === 'left' ? '-translate-x-full opacity-0 pointer-events-none absolute left-0 top-0' : 'translate-x-full opacity-0 pointer-events-none absolute right-0 top-0'}"
	>
		<!-- Collapse & Drag Grip Header Button at top of dock -->
		<button
			type="button"
			onpointerdown={handlePointerDown}
			class="group/btn relative w-9 h-8 rounded-xl text-pink-400 hover:text-[#f43f8e] hover:bg-pink-50 flex items-center justify-center transition-colors cursor-grab active:cursor-grabbing"
			aria-label="Drag to move or tap to collapse navigation"
			title="Drag to move, tap to hide"
		>
			{#if side === 'left'}
				<!-- Left side collapse points left -->
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2.5"
					stroke="currentColor"
					class="w-4.5 h-4.5 transition-transform duration-200 group-hover/btn:-translate-x-0.5"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
				</svg>
			{:else}
				<!-- Right side collapse points right -->
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2.5"
					stroke="currentColor"
					class="w-4.5 h-4.5 transition-transform duration-200 group-hover/btn:translate-x-0.5"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
				</svg>
			{/if}

			<!-- Themed Tooltip -->
			<div class="absolute {side === 'left' ? 'left-full ml-2.5' : 'right-full mr-2.5'} top-1/2 -translate-y-1/2 opacity-0 group-hover/btn:opacity-100 {side === 'left' ? '-translate-x-1 group-hover/btn:translate-x-0' : 'translate-x-1 group-hover/btn:translate-x-0'} transition-all duration-200 pointer-events-none z-50">
				<div class="relative bg-gradient-to-r from-pink-500 to-[#f43f8e] text-white text-[11px] font-black px-2 py-0.5 rounded-lg shadow-[-2px_4px_12px_rgba(244,63,142,0.3)] border border-pink-200/40 whitespace-nowrap flex items-center gap-1">
					<span>Hide</span>
					<span class="text-[9px] opacity-80 font-normal">· Hold to drag</span>
					<div class="absolute top-1/2 -translate-y-1/2 {side === 'left' ? 'right-full border-r-4 border-r-[#f43f8e]' : 'left-full border-l-4 border-l-[#f43f8e]'} w-0 h-0 border-y-4 border-y-transparent"></div>
				</div>
			</div>
		</button>

		<div class="w-6 h-px bg-pink-100/90 my-0.5"></div>

		{#each navItems as item, idx}
			<button
				type="button"
				onclick={() => handleNavigate(item.path)}
				class="group/item relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-90 cursor-pointer select-none {activeIndex === idx ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-400 hover:text-[#f43f8e] hover:bg-pink-50'}"
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
							<path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75zM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 01-1.875-1.875V8.625zM3 13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 013 19.875v-6.75z" />
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

				<!-- Themed Floating Tooltip with Staggered Sequential Reveal -->
				<div
					class="absolute {side === 'left' ? 'left-full ml-2.5' : 'right-full mr-2.5'} top-1/2 -translate-y-1/2 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-50 {showSequentialTooltips ? 'opacity-100 translate-x-0 scale-100 pointer-events-auto' : side === 'left' ? 'opacity-0 -translate-x-2 scale-95 pointer-events-none group-hover/item:opacity-100 group-hover/item:translate-x-0 group-hover/item:scale-100 group-hover/item:pointer-events-auto' : 'opacity-0 translate-x-2 scale-95 pointer-events-none group-hover/item:opacity-100 group-hover/item:translate-x-0 group-hover/item:scale-100 group-hover/item:pointer-events-auto'}"
					style="transition-delay: {showSequentialTooltips ? `${(idx * 75) + 120}ms` : '0ms'};"
				>
					<div class="relative bg-gradient-to-r from-pink-500 to-[#f43f8e] text-white text-[11px] font-black px-2.5 py-1 rounded-xl shadow-[-3px_4px_16px_rgba(244,63,142,0.32)] border border-pink-200/40 whitespace-nowrap flex items-center gap-1.5">
						<span>{item.label}</span>
						{#if item.id === 'chat' && unreadChatsCount > 0}
							<span class="bg-white text-[#f43f8e] text-[9px] px-1.5 py-0.2 rounded-full font-black shadow-2xs">
								{unreadChatsCount}
							</span>
						{/if}
						<!-- Tooltip Arrow Pointer -->
						<div class="absolute top-1/2 -translate-y-1/2 {side === 'left' ? 'right-full border-r-4 border-r-[#f43f8e]' : 'left-full border-l-4 border-l-[#f43f8e]'} w-0 h-0 border-y-4 border-y-transparent"></div>
					</div>
				</div>
			</button>
		{/each}
	</nav>
</div>




