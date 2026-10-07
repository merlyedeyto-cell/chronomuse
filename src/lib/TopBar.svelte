<script>
	import { createEventDispatcher } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Home, Info, Mail } from 'lucide-svelte';

	let { showNav = true, showFooter = true, activeTab = 'home', children } = $props();

	const dispatch = createEventDispatcher();

	const navTabs = [
		{ id: 'home', label: 'Home' },
		{ id: 'about', label: 'About' },
		{ id: 'contact', label: 'Contact' }
	];

	function handleTabClick(tab) {
		dispatch('navigate', tab);
	}

	function handleLogoClick(e) {
		e.preventDefault();
		dispatch('navigate', 'home');
		if ($page.url.pathname !== '/') {
			goto('/');
		}
	}
</script>

<div class="flex flex-col min-h-screen bg-[#fff0f5] font-sans text-sm select-none antialiased">
	<!-- Top Bar / Header Matching AppHeader Aesthetic -->
	<header class="bg-white/95 backdrop-blur-md sticky top-0 z-40 transition-all border-b border-pink-100/90 shadow-2xs">
		<div class="max-w-6xl xl:max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-2.5 flex items-center justify-between gap-3">
			<!-- Left: Logo & App Brand -->
			<button type="button" onclick={handleLogoClick} class="flex items-center space-x-2.5 sm:space-x-3 group cursor-pointer select-none text-left min-w-0">
				<div class="w-9 h-9 sm:w-10 sm:h-10 md:w-10.5 md:h-10.5 rounded-xl sm:rounded-2xl bg-black flex items-center justify-center p-1 shadow-xs group-hover:scale-105 transition-transform duration-200 flex-shrink-0">
					<img src="/logo.png" alt="ChronoMuse Mascot" class="w-7 h-7 sm:w-8 sm:h-8 md:w-8.5 md:h-8.5 object-contain pointer-events-none" />
				</div>
				<span class="text-lg sm:text-2xl font-black font-sans text-[#ff3e88] tracking-tight group-hover:text-pink-600 transition-colors select-none truncate">ChronoMuse</span>
			</button>

			<!-- Right Container: Navigation -->
			{#if showNav}
				<div class="flex items-center space-x-4 sm:space-x-6 lg:space-x-7">
					<!-- Desktop Navigation Bar (Text only with active pink underline) -->
					<nav class="hidden md:flex items-center space-x-5 lg:space-x-7 font-sans">
						{#each navTabs as item}
							<button
								type="button"
								onclick={() => handleTabClick(item.id)}
								class="relative py-1 text-xs lg:text-[13.5px] font-black tracking-tight transition-colors cursor-pointer select-none flex items-center {activeTab === item.id ? 'text-[#f43f8e]' : 'text-pink-600 hover:text-[#f43f8e]'}"
							>
								<span class="relative">
									{item.label}
								</span>
								{#if activeTab === item.id}
									<span class="absolute -bottom-1 left-0 right-0 h-[2.5px] bg-[#f43f8e] rounded-full"></span>
								{/if}
							</button>
						{/each}
					</nav>

					<!-- Mobile Navigation Bar (Icon only matching dashboard action icons) -->
					<div class="flex md:hidden items-center space-x-1 sm:space-x-1.5">
						{#each navTabs as item}
							<button
								type="button"
								onclick={() => handleTabClick(item.id)}
								class="p-1.5 sm:p-2 rounded-xl flex items-center justify-center relative hover:bg-pink-50 active:scale-95 transition-all duration-150 cursor-pointer {activeTab === item.id ? 'text-[#f43f8e] bg-pink-50/80' : 'text-pink-500 hover:text-[#f43f8e]'}"
								aria-label={item.label}
								title={item.label}
							>
								{#if item.id === 'home'}
									<Home class="w-5 h-5 sm:w-5.5 sm:h-5.5" />
								{:else if item.id === 'about'}
									<Info class="w-5 h-5 sm:w-5.5 sm:h-5.5" />
								{:else if item.id === 'contact'}
									<Mail class="w-5 h-5 sm:w-5.5 sm:h-5.5" />
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</header>

	<!-- Main Content Area -->
	<main class="flex-grow flex flex-col justify-center items-center p-0 w-full">
		{@render children?.()}
	</main>

	<!-- Footer -->
	{#if showFooter}
		<footer class="py-4 sm:py-6 text-center">
			<p class="text-[11px] sm:text-xs font-black text-pink-500/90 tracking-normal px-4">
				© 2026 CHRONOMUSE. All rights reserved. Developed by Merlye Deyto
			</p>
		</footer>
	{/if}
</div>

