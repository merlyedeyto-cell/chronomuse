<script>
	import LoginCard from '$lib/LoginCard.svelte';
	import TopBar from '$lib/TopBar.svelte';
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';

	let isLoginHighlight = $state(false);
	let isAboutHighlight = $state(false);
	let isContactHighlight = $state(false);
	let aboutCard;
	let contactCard;

	function handleLogin(event) {
		console.log('Login attempt:', event.detail);
	}

	function handleNavigate(event) {
		const section = event.detail;
		if (section === 'login' || section === 'home') {
			isLoginHighlight = true;
			document.getElementById('login-section')?.scrollIntoView({ behavior: 'smooth' });
			setTimeout(() => { isLoginHighlight = false; }, 800);
		} else if (section === 'about') {
			isAboutHighlight = true;
			document.getElementById('about-section')?.scrollIntoView({ behavior: 'smooth' });
			setTimeout(() => { isAboutHighlight = false; }, 800);
		} else if (section === 'contact') {
			isContactHighlight = true;
			document.getElementById('contact-section')?.scrollIntoView({ behavior: 'smooth' });
			setTimeout(() => { isContactHighlight = false; }, 800);
		}
	}

	onMount(() => {
		const storedUser = localStorage.getItem('chronomuse_user');
		if (storedUser) {
			try {
				const parsed = JSON.parse(storedUser);
				if (parsed && parsed.id) {
					goto('/dashboard');
					return;
				}
			} catch (e) {}
		}

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						entry.target.classList.add('is-visible');
					} else {
						entry.target.classList.remove('is-visible');
					}
				});
			},
			{ threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
		);

		tick().then(() => {
			if (aboutCard) observer.observe(aboutCard);
			if (contactCard) observer.observe(contactCard);
		});

		return () => observer.disconnect();
	});
</script>

<TopBar on:navigate={handleNavigate}>
	<div class="bg-gradient-to-br from-pink-100 via-pink-200 to-pink-300 overflow-x-hidden">
		<!-- Login / Home Section - Dedicated Full Viewport Section -->
		<section id="login-section" class="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center py-12 px-2 sm:px-4 transition-all duration-500" class:scale-105={isLoginHighlight}>
			<div class="transition-all duration-500" class:ring-4={isLoginHighlight} class:ring-pink-400={isLoginHighlight} class:rounded-2xl={isLoginHighlight}>
				<LoginCard on:login={handleLogin} />
			</div>
		</section>

		<!-- About Section - Dedicated Full Viewport Section -->
		<section
			id="about-section"
			class="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center py-12 px-4 transition-all duration-500"
		>
			<div class="container mx-auto px-4">
				<div class="max-w-sm sm:max-w-md md:max-w-lg mx-auto">
					<div
						bind:this={aboutCard}
						class="reveal-card reveal-left bg-white/90 backdrop-blur-md border-2 border-pink-300 rounded-2xl shadow-md p-5 sm:p-6 text-center hover:scale-105 hover:shadow-2xl transition-all duration-300"
						class:scale-105={isAboutHighlight}
						class:ring-4={isAboutHighlight}
						class:ring-pink-400={isAboutHighlight}
						class:shadow-2xl={isAboutHighlight}
					>
						<h2 class="text-base sm:text-lg font-bold text-pink-600 mb-2.5">About CHRONOMUSE</h2>
						<p class="text-pink-700 text-xs sm:text-sm leading-relaxed font-medium">
							CHRONOMUSE is a personal memory system designed to help you remember and reflect on your daily life. It allows you to save memories, reactions, and meaningful moments in a beautiful and organized calendar.
						</p>
						<p class="text-pink-700 text-xs sm:text-sm leading-relaxed font-medium mt-2.5">
							With CHRONOMUSE, users can easily look back on past experiences, track emotions over time, and preserve special events whether big milestones or simple everyday moments. It provides a personal digital space where time, memories, and reflection come together.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Contact Section - Dedicated Full Viewport Section -->
		<section
			id="contact-section"
			class="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center py-12 px-4 transition-all duration-500"
		>
			<div class="container mx-auto px-4">
				<div class="max-w-sm sm:max-w-md md:max-w-lg mx-auto">
					<div
						bind:this={contactCard}
						class="reveal-card reveal-right bg-white/90 backdrop-blur-md border-2 border-pink-300 rounded-2xl shadow-md p-5 sm:p-6 text-center hover:scale-105 hover:shadow-2xl transition-all duration-300"
						class:scale-105={isContactHighlight}
						class:ring-4={isContactHighlight}
						class:ring-pink-400={isContactHighlight}
						class:shadow-2xl={isContactHighlight}
					>
						<h2 class="text-base sm:text-lg font-bold text-pink-600 mb-2.5">Contact</h2>
						<p class="text-pink-700 text-xs sm:text-sm leading-relaxed font-medium">
							CHRONOMUSE is a personally developed system by Merlye Deyto.
						</p>
						<p class="text-pink-700 text-xs sm:text-sm leading-relaxed font-medium mt-2.5">
							For inquiries, feedback, or system-related concerns, you may contact the developer through the following channels:
						</p>
						<div class="mt-3 text-xs sm:text-sm leading-relaxed space-y-1">
							<p><strong class="text-pink-600 font-bold">Email:</strong> <a href="mailto:merlyedeyto@email.com" class="text-pink-700 hover:text-pink-900 font-semibold underline">merlyedeyto@email.com</a></p>
							<p><strong class="text-pink-600 font-bold">Facebook:</strong> <a href="https://facebook.com/share/1CEdsrYWof" target="_blank" class="text-pink-700 hover:text-pink-900 font-semibold underline">facebook.com/share/1CEdsrYWof</a></p>
							<p><strong class="text-pink-600 font-bold">Instagram:</strong> <a href="https://instagram.com/anzu_lye" target="_blank" class="text-pink-700 hover:text-pink-900 font-semibold underline">instagram.com/anzu_lye</a></p>
						</div>
					</div>
				</div>
			</div>
		</section>
	</div>
</TopBar>

<style>
	:global(.reveal-card) {
		opacity: 0;
		transition: opacity 0.6s ease-out, transform 0.6s ease-out;
	}

	:global(.reveal-card.reveal-left) {
		transform: translateX(-50px);
	}

	:global(.reveal-card.reveal-right) {
		transform: translateX(50px);
	}

	:global(.reveal-card.is-visible) {
		opacity: 1;
		transform: translateX(0) !important;
	}
</style>
