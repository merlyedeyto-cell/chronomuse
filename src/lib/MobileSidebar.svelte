<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { playClickSound } from '$lib/soundEffects.js';
	import {
		Calendar,
		BarChart2,
		Users,
		MessageCircle,
		Bell,
		User,
		Settings,
		LogOut,
		X
	} from 'lucide-svelte';

	let {
		isOpen = $bindable(false),
		notificationsCount = 0,
		unreadChatsCount = 0,
		pendingFriendRequestsCount = 0,
		currentUser = null,
		onLogout = () => {}
	} = $props();

	const navItems = [
		{ id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: Calendar },
		{ id: 'moods', label: 'Moods', path: '/mood-graph', icon: BarChart2 },
		{ id: 'friends', label: 'Friends', path: '/friends', icon: Users, badgeKey: 'friends' },
		{ id: 'chat', label: 'Chat', path: '/chat', icon: MessageCircle, badgeKey: 'chat' },
		{ id: 'notifications', label: 'Notifications', path: '/notifications', icon: Bell, badgeKey: 'notifications' },
		{ id: 'profile', label: 'Profile', path: '/profile', icon: User },
		{ id: 'settings', label: 'Settings', path: '/settings', icon: Settings }
	];

	function isItemActive(path) {
		const pathname = $page?.url?.pathname || '';
		if (path === '/dashboard') {
			return pathname === '/dashboard' || pathname === '/' || pathname.startsWith('/dashboard');
		}
		return pathname.startsWith(path);
	}

	function closeSidebar() {
		isOpen = false;
	}

	function handleNavigate(path) {
		playClickSound();
		closeSidebar();
		if (path === '/profile') {
			if (typeof window !== 'undefined') {
				window.dispatchEvent(new CustomEvent('chronomuse_go_self_profile'));
			}
		}
		goto(path);
	}

	function handleLogoutClick() {
		playClickSound();
		closeSidebar();
		onLogout();
	}

	function handleKeydown(e) {
		if (e.key === 'Escape' && isOpen) {
			closeSidebar();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop Overlay -->
{#if isOpen}
	<div
		class="fixed inset-0 bg-black/45 backdrop-blur-xs z-50 transition-opacity duration-300 md:hidden"
		onclick={closeSidebar}
		role="button"
		tabindex="0"
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeSidebar(); }}
		aria-label="Close menu overlay"
	></div>
{/if}

<!-- Mobile Sidebar Drawer -->
<aside
	class="fixed top-0 bottom-0 right-0 w-[285px] sm:w-[320px] max-w-[85vw] bg-white z-50 shadow-2xl flex flex-col rounded-l-3xl overflow-hidden border-l border-pink-100 transition-transform duration-300 ease-out md:hidden select-none {isOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'}"
	aria-label="Mobile Navigation Sidebar"
>
	<!-- Sidebar Top Header -->
	<div class="px-5 pt-5 pb-4 bg-gradient-to-b from-pink-50/70 to-white border-b border-pink-100/80 flex items-center justify-between">
		<!-- User / Brand Info -->
		<div class="flex items-center space-x-3 min-w-0">
			{#if currentUser}
				<div class="relative flex-shrink-0">
					{#if currentUser.avatar_url}
						<img
							src={currentUser.avatar_url}
							alt={currentUser.username || 'User avatar'}
							class="w-10 h-10 rounded-2xl object-cover ring-2 ring-[#f43f8e]/30 shadow-2xs"
						/>
					{:else}
						<div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 to-[#f43f8e] text-white font-black text-base flex items-center justify-center shadow-2xs">
							{(currentUser.username || 'U').charAt(0).toUpperCase()}
						</div>
					{/if}
				</div>
				<div class="min-w-0 flex-1">
					<p class="text-sm font-black text-pink-950 truncate tracking-tight">
						{currentUser.username || 'ChronoMuse User'}
					</p>
					{#if currentUser.email}
						<p class="text-[11px] font-medium text-pink-400 truncate">
							{currentUser.email}
						</p>
					{/if}
				</div>
			{:else}
				<div class="flex items-center space-x-2.5">
					<div class="w-9 h-9 rounded-2xl bg-black flex items-center justify-center p-1 shadow-xs">
						<img src="/logo.png" alt="ChronoMuse Mascot" class="w-full h-full object-contain pointer-events-none" />
					</div>
					<span class="text-lg font-black text-[#ff3e88] tracking-tight">ChronoMuse</span>
				</div>
			{/if}
		</div>

		<!-- Close Button -->
		<button
			type="button"
			onclick={closeSidebar}
			class="w-9 h-9 rounded-2xl bg-pink-50 hover:bg-pink-100 text-pink-500 hover:text-[#f43f8e] flex items-center justify-center transition-colors cursor-pointer active:scale-95 flex-shrink-0 ml-2"
			aria-label="Close sidebar"
		>
			<X class="w-5 h-5" />
		</button>
	</div>

	<!-- Navigation Items Container -->
	<div class="flex-1 overflow-y-auto px-3.5 py-3 space-y-1.5 scrollbar-thin scrollbar-thumb-pink-200">
		{#each navItems as item}
			{@const active = isItemActive(item.path)}
			{@const Icon = item.icon}
			{@const badgeCount = item.badgeKey === 'friends' ? pendingFriendRequestsCount : item.badgeKey === 'chat' ? unreadChatsCount : item.badgeKey === 'notifications' ? notificationsCount : 0}

			<button
				type="button"
				onclick={() => handleNavigate(item.path)}
				class="w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-200 cursor-pointer active:scale-[0.98] group {active ? 'bg-gradient-to-r from-pink-500 to-[#f43f8e] text-white shadow-md shadow-pink-500/20' : 'text-pink-950/85 hover:text-[#f43f8e] hover:bg-pink-50/80'}"
			>
				<!-- Icon + Label -->
				<div class="flex items-center space-x-3.5 min-w-0">
					<Icon
						class="w-5 h-5 flex-shrink-0 transition-colors {active ? 'text-white' : 'text-pink-500 group-hover:text-[#f43f8e]'}"
					/>
					<span class="text-[14px] font-bold tracking-tight truncate {active ? 'text-white font-extrabold' : 'group-hover:text-pink-950'}">
						{item.label}
					</span>
				</div>

				<!-- Badge counter -->
				{#if badgeCount > 0}
					<span
						class="min-w-5 h-5 px-1.5 text-[11px] font-black rounded-full flex items-center justify-center transition-transform group-hover:scale-105 {active ? 'bg-white text-[#f43f8e] shadow-2xs' : 'bg-[#f43f8e] text-white shadow-xs animate-pulse'}"
					>
						{badgeCount > 99 ? '99+' : badgeCount}
					</span>
				{/if}
			</button>
		{/each}
	</div>

	<!-- Bottom Section: Logout Button -->
	<div class="p-3.5 border-t border-pink-100/90 bg-pink-50/30">
		<button
			type="button"
			onclick={handleLogoutClick}
			class="w-full flex items-center space-x-3.5 px-4 py-3 rounded-2xl bg-rose-50/70 hover:bg-rose-100 text-rose-600 font-bold text-[14px] transition-all duration-150 cursor-pointer active:scale-[0.98] group"
		>
			<LogOut class="w-5 h-5 text-rose-500 group-hover:text-rose-700 transition-colors flex-shrink-0" />
			<span class="tracking-tight group-hover:text-rose-700 font-extrabold">Log Out</span>
		</button>
	</div>
</aside>
