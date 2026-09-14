<script>
	import { createEventDispatcher } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let { showNav = true, showFooter = true, activeTab = 'home' } = $props();

	const dispatch = createEventDispatcher();

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
	<header class="bg-pink-100/90 sm:bg-pink-100/95 backdrop-blur-md sticky top-0 z-40 transition-all border-b border-pink-200/60 shadow-xs">
		<div class="max-w-6xl xl:max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-2.5 flex items-center justify-between gap-2">
			<!-- Logo -->
			<button type="button" onclick={handleLogoClick} class="flex items-center space-x-2.5 sm:space-x-3 group cursor-pointer select-none text-left min-w-0">
				<div class="w-9 h-9 sm:w-10 sm:h-10 md:w-10.5 md:h-10.5 rounded-xl sm:rounded-2xl bg-black flex items-center justify-center p-1 shadow-xs group-hover:scale-105 transition-transform duration-200 flex-shrink-0">
					<img src="/logo.png" alt="ChronoMuse Mascot" class="w-7 h-7 sm:w-8 sm:h-8 md:w-8.5 md:h-8.5 object-contain pointer-events-none" />
				</div>
				<span class="text-lg sm:text-2xl font-black font-sans text-[#ff3e88] tracking-tight group-hover:text-pink-600 transition-colors select-none truncate">ChronoMuse</span>
			</button>

			<!-- Navigation -->
			{#if showNav}
				<div class="flex items-center flex-shrink-0">
					<nav class="flex items-center space-x-1 sm:space-x-1.5 bg-white/90 backdrop-blur-md p-1 sm:px-2.5 sm:py-1.5 rounded-full border border-pink-200/90 shadow-2xs font-sans">
						<button
							type="button"
							onclick={() => handleTabClick('home')}
							title="Home"
							aria-label="Home"
							class="p-2 sm:px-3.5 sm:py-1.5 lg:px-4 lg:py-2 rounded-full text-xs lg:text-sm font-black transition-all flex items-center justify-center space-x-1.5 cursor-pointer select-none active:scale-95 {activeTab === 'home' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-600 hover:text-[#f43f8e] hover:bg-pink-50'}"
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 flex-shrink-0">
								<path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 1-1.06 1.061l-.97-.97V19.5a2.25 2.25 0 0 1-2.25 2.25H6.06A2.25 2.25 0 0 1 3.81 19.5V12.62l-.97.97a.75.75 0 0 1-1.06-1.06l8.69-8.69Z" />
							</svg>
							<span class="hidden sm:inline">Home</span>
						</button>
						<button
							type="button"
							onclick={() => handleTabClick('about')}
							title="About"
							aria-label="About"
							class="p-2 sm:px-3.5 sm:py-1.5 lg:px-4 lg:py-2 rounded-full text-xs lg:text-sm font-black transition-all flex items-center justify-center space-x-1.5 cursor-pointer select-none active:scale-95 {activeTab === 'about' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-600 hover:text-[#f43f8e] hover:bg-pink-50'}"
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 flex-shrink-0">
								<path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clip-rule="evenodd" />
							</svg>
							<span class="hidden sm:inline">About</span>
						</button>
						<button
							type="button"
							onclick={() => handleTabClick('contact')}
							title="Contact"
							aria-label="Contact"
							class="p-2 sm:px-3.5 sm:py-1.5 lg:px-4 lg:py-2 rounded-full text-xs lg:text-sm font-black transition-all flex items-center justify-center space-x-1.5 cursor-pointer select-none active:scale-95 {activeTab === 'contact' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-600 hover:text-[#f43f8e] hover:bg-pink-50'}"
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 flex-shrink-0">
								<path d="M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3.75 3.75 0 0 1-3.144 0L1.5 8.67Z" />
								<path d="M22.5 6.908V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.158l9.714 5.978a1.5 1.5 0 0 0 1.572 0L22.5 6.908Z" />
							</svg>
							<span class="hidden sm:inline">Contact</span>
						</button>
					</nav>
				</div>
			{/if}
		</div>
	</header>

	<!-- Main Content Area -->
	<main class="flex-grow flex flex-col justify-center items-center p-0 w-full">
		<slot />
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

