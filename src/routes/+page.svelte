<script>
	import LoginCard from '$lib/LoginCard.svelte';
	import TopBar from '$lib/TopBar.svelte';
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let activeTab = $state('home');
	let isCheckingAuth = $state(true);
	let isLoggedIn = $state(false);

	// Synchronous initial check if executed on browser
	if (typeof window !== 'undefined') {
		try {
			const storedUser = localStorage.getItem('chronomuse_user');
			if (storedUser) {
				const parsed = JSON.parse(storedUser);
				if (parsed && parsed.id) {
					isLoggedIn = true;
					isCheckingAuth = false;
					const urlParams = new URLSearchParams(window.location.search);
					const paramRedirect = urlParams.get('redirect');
					const sessionRedirect = sessionStorage.getItem('chronomuse_redirect_after_login');
					let redirectTarget = '/dashboard';
					if (paramRedirect) {
						redirectTarget = decodeURIComponent(paramRedirect);
					} else if (sessionRedirect) {
						redirectTarget = sessionRedirect;
					}
					sessionStorage.removeItem('chronomuse_redirect_after_login');
					goto(redirectTarget || '/dashboard');
				}
			}
		} catch (e) {}
	}

	function handleLogin(event) {
		console.log('Login attempt:', event.detail);
	}

	function scrollToSection(sectionName) {
		if (sectionName === 'home') {
			if (typeof window !== 'undefined') {
				window.scrollTo({ top: 0, behavior: 'smooth' });
				activeTab = 'home';
			}
			return;
		}
		const target = document.getElementById(`${sectionName}-section`);
		if (target) {
			target.scrollIntoView({ behavior: 'smooth' });
			activeTab = sectionName;
		}
	}

	function handleNavigate(event) {
		const section = event.detail;
		scrollToSection(section);
	}

	onMount(() => {
		try {
			const storedUser = localStorage.getItem('chronomuse_user');
			if (storedUser) {
				const parsed = JSON.parse(storedUser);
				if (parsed && parsed.id) {
					isLoggedIn = true;
					isCheckingAuth = false;
					goto('/dashboard');
					return;
				}
			}
		} catch (e) {}

		isCheckingAuth = false;
		isLoggedIn = false;

		// Scroll to tab if specified in URL
		const tabParam = $page.url.searchParams.get('tab');
		if (tabParam) {
			tick().then(() => {
				scrollToSection(tabParam);
			});
		}

		// Intersection Observer to update active tab as user scrolls
		const sections = ['home', 'about', 'contact'];
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						const id = entry.target.id.replace('-section', '');
						if (id) activeTab = id;
					}
				});
			},
			{ threshold: 0.4 }
		);

		sections.forEach((sec) => {
			const el = document.getElementById(`${sec}-section`);
			if (el) observer.observe(el);
		});

		return () => observer.disconnect();
	});
</script>

{#if !isCheckingAuth && !isLoggedIn}
	<TopBar {activeTab} on:navigate={handleNavigate}>
		<div class="w-full flex flex-col items-center">
			<!-- 1. Home / Login Section -->
			<section
				id="home-section"
				class="w-full min-h-[calc(100vh-76px)] flex items-center justify-center py-6 px-4"
			>
				<div class="w-full flex justify-center">
					<LoginCard on:login={handleLogin} />
				</div>
			</section>

			<!-- 2. About Section -->
			<section
				id="about-section"
				class="w-full min-h-[calc(100vh-140px)] flex items-center justify-center py-10 px-4"
			>
				<div class="w-full max-w-[360px] sm:max-w-[440px] mx-auto">
					<div class="bg-white rounded-[32px] sm:rounded-[38px] p-8 sm:p-10 shadow-[0_16px_50px_rgba(244,114,182,0.22)] border border-pink-100/90 text-center transition-transform hover:scale-[1.01] duration-300">
						<h2 class="text-base sm:text-lg font-black text-pink-500 mb-4 tracking-wide uppercase">ABOUT CHRONOMUSE</h2>
						<p class="text-xs sm:text-[13px] text-pink-900 font-semibold leading-relaxed">
							CHRONOMUSE is a personal memory system designed to help you remember and reflect on your daily life. It allows you to save memories, reactions, and meaningful moments in a beautiful and organized calendar.
						</p>
					</div>
				</div>
			</section>

			<!-- 3. Contact Section -->
			<section
				id="contact-section"
				class="w-full min-h-[calc(100vh-140px)] flex items-center justify-center py-10 px-4"
			>
				<div class="w-full max-w-[360px] sm:max-w-[440px] mx-auto">
					<div class="bg-white rounded-[32px] sm:rounded-[38px] p-8 sm:p-10 shadow-[0_16px_50px_rgba(244,114,182,0.22)] border border-pink-100/90 text-center transition-transform hover:scale-[1.01] duration-300">
						<h2 class="text-base sm:text-lg font-black text-pink-500 mb-4 tracking-wide uppercase">CONTACT</h2>
						<p class="text-xs sm:text-[13px] text-pink-900 font-semibold leading-relaxed mb-6">
							CHRONOMUSE is a personally developed system by Merlye Deyto.
						</p>
						<div class="space-y-2 text-xs sm:text-[13px] font-bold text-pink-600">
							<p>Email: <a href="mailto:merlyedeyto@email.com" class="text-pink-600 hover:text-pink-800 underline">merlyedeyto@email.com</a></p>
							<p>Facebook: <a href="https://facebook.com/share/1CEdsrYWof" target="_blank" class="text-pink-600 hover:text-pink-800 underline">facebook.com/share/1CEdsrYWof</a></p>
							<p>Instagram: <a href="https://instagram.com/anzu_lye" target="_blank" class="text-pink-600 hover:text-pink-800 underline">instagram.com/anzu_lye</a></p>
						</div>
					</div>
				</div>
			</section>
		</div>
	</TopBar>
{:else}
	<div class="min-h-screen bg-pink-50 flex items-center justify-center"></div>
{/if}


