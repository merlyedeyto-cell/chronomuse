<script>
	import { createEventDispatcher } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

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
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 sm:w-5.5 sm:h-5.5">
										<path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 1-1.06 1.061l-.97-.97V19.5a2.25 2.25 0 0 1-2.25 2.25H6.06A2.25 2.25 0 0 1 3.81 19.5V12.62l-.97.97a.75.75 0 0 1-1.06-1.06l8.69-8.69Z" />
									</svg>
								{:else if item.id === 'about'}
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 sm:w-5.5 sm:h-5.5">
										<path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clip-rule="evenodd" />
									</svg>
								{:else if item.id === 'contact'}
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 sm:w-5.5 sm:h-5.5">
										<path d="M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3.75 3.75 0 0 1-3.144 0L1.5 8.67Z" />
										<path d="M22.5 6.908V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.158l9.714 5.978a1.5 1.5 0 0 0 1.572 0L22.5 6.908Z" />
									</svg>
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

