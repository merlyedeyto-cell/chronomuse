<script>
	let { showNav = true, showFooter = true } = $props();

	function scrollToSection(id) {
		const section = document.getElementById(id);
		if (section) {
			section.scrollIntoView({ behavior: 'smooth' });
		}
	}

	function handleLogoClick(event) {
		event.preventDefault();
		scrollToSection('login-section');
	}
</script>

<div class="flex flex-col min-h-screen font-sans text-sm">
	<header class="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b-2 border-pink-300 shadow-lg" style="position: -webkit-sticky; position: sticky;">
		<div class="container mx-auto px-4 py-3 flex items-center justify-between">
			<!-- Logo -->
			<a href="#login-section" onclick={handleLogoClick} class="flex items-center space-x-2">
				<img src="/logo.png" alt="ChronoMuse" class="w-10 h-10 rounded-md object-contain" />
				<span class="text-lg font-bold text-pink-500">ChronoMuse</span>
			</a>

			<!-- Navigation -->
			{#if showNav}
			<nav class="flex items-center space-x-0.5">
				<button
					onclick={() => scrollToSection('login-section')}
					class="px-3 py-1.5 rounded-md text-pink-500 hover:bg-pink-100 hover:-translate-y-0.5 hover:text-pink-700 transition-all duration-200 cursor-pointer"
				>
					Home
				</button>
				<button
					onclick={() => scrollToSection('about-section')}
					class="px-3 py-1.5 rounded-md text-pink-500 hover:bg-pink-100 hover:-translate-y-0.5 hover:text-pink-700 transition-all duration-200 cursor-pointer"
				>
					About
				</button>
				<button
					onclick={() => scrollToSection('contact-section')}
					class="px-3 py-1.5 rounded-md text-pink-500 hover:bg-pink-100 hover:-translate-y-0.5 hover:text-pink-700 transition-all duration-200 cursor-pointer"
				>
					Contact
				</button>
			</nav>
			{/if}
		</div>
	</header>

	<main class="flex-grow">
		<slot />
	</main>

	<!-- Footer -->
	{#if showFooter}
	<footer class="bg-white/85 backdrop-blur-md border-t-2 border-pink-300">
		<div class="container mx-auto px-4 py-3 text-center">
			<p class="text-xs text-pink-700">
				© 2026 CHRONOMUSE. All rights reserved. Developed by Merlye Deyto
			</p>
		</div>
	</footer>
	{/if}
</div>
