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
	<!-- Top Bar / Header -->
	<header class="sticky top-0 z-50 bg-white border-b border-pink-100 shadow-[0_2px_12px_rgba(244,114,182,0.06)]">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
			<!-- Logo -->
			<button type="button" onclick={handleLogoClick} class="flex items-center space-x-3 group cursor-pointer select-none text-left">
				<div class="w-11 h-11 rounded-2xl bg-black flex items-center justify-center p-1.5 shadow-sm group-hover:scale-105 transition-transform duration-200">
					<img src="/logo.png" alt="ChronoMuse" class="w-8 h-8 object-contain pointer-events-none" />
				</div>
				<span class="text-xl sm:text-2xl font-black text-pink-500 tracking-tight group-hover:text-pink-600 transition-colors">ChronoMuse</span>
			</button>

			<!-- Navigation -->
			{#if showNav}
				<nav class="flex items-center space-x-4 sm:space-x-8">
					<button
						type="button"
						onclick={() => handleTabClick('home')}
						class="text-sm sm:text-base font-extrabold transition-all duration-150 cursor-pointer {activeTab === 'home' ? 'text-pink-600 font-black' : 'text-pink-400 hover:text-pink-600 font-bold'}"
					>
						Home
					</button>
					<button
						type="button"
						onclick={() => handleTabClick('about')}
						class="text-sm sm:text-base font-extrabold transition-all duration-150 cursor-pointer {activeTab === 'about' ? 'text-pink-600 font-black underline underline-offset-4 decoration-2' : 'text-pink-400 hover:text-pink-600 font-bold'}"
					>
						About
					</button>
					<button
						type="button"
						onclick={() => handleTabClick('contact')}
						class="text-sm sm:text-base font-extrabold transition-all duration-150 cursor-pointer {activeTab === 'contact' ? 'text-pink-600 font-black underline underline-offset-4 decoration-2' : 'text-pink-400 hover:text-pink-600 font-bold'}"
					>
						Contact
					</button>
				</nav>
			{/if}
		</div>
	</header>

	<!-- Main Content Area -->
	<main class="flex-grow flex flex-col justify-center items-center py-6 sm:py-10 px-4">
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

