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
	<header class="bg-pink-100/90 sm:bg-pink-100/95 backdrop-blur-md sticky top-0 z-40 transition-all border-b border-pink-200/60">
		<div class="max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex items-center justify-between">
			<!-- Logo -->
			<button type="button" onclick={handleLogoClick} class="flex items-center space-x-3 group cursor-pointer select-none text-left">
				<div class="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-2xl bg-black flex items-center justify-center p-1 shadow-sm group-hover:scale-105 transition-transform duration-200">
					<img src="/logo.png" alt="ChronoMuse Mascot" class="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 object-contain pointer-events-none" />
				</div>
				<span class="text-xl sm:text-2xl md:text-3xl font-black font-sans text-[#ff3e88] tracking-tight group-hover:text-pink-600 transition-colors select-none">ChronoMuse</span>
			</button>

			<!-- Navigation -->
			{#if showNav}
				<div class="flex items-center space-x-3 sm:space-x-4 lg:space-x-5">
					<nav class="flex items-center space-x-1.5 bg-white/90 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-pink-200/90 shadow-2xs font-sans">
						<button
							type="button"
							onclick={() => handleTabClick('home')}
							class="px-3.5 lg:px-4 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-black transition-all flex items-center space-x-1.5 cursor-pointer select-none active:scale-95 {activeTab === 'home' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-600 hover:text-[#f43f8e] hover:bg-pink-50'}"
						>
							Home
						</button>
						<button
							type="button"
							onclick={() => handleTabClick('about')}
							class="px-3.5 lg:px-4 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-black transition-all flex items-center space-x-1.5 cursor-pointer select-none active:scale-95 {activeTab === 'about' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-600 hover:text-[#f43f8e] hover:bg-pink-50'}"
						>
							About
						</button>
						<button
							type="button"
							onclick={() => handleTabClick('contact')}
							class="px-3.5 lg:px-4 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-black transition-all flex items-center space-x-1.5 cursor-pointer select-none active:scale-95 {activeTab === 'contact' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-600 hover:text-[#f43f8e] hover:bg-pink-50'}"
						>
							Contact
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

