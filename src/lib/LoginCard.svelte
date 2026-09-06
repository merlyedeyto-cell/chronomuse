<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { initPWAInstall, subscribePWAStatus, promptPWAInstall } from '$lib/pwaInstall.js';

	const dispatch = createEventDispatcher();

	let usernameOrEmail = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let isClicked = $state(false);
	let isVisible = $state(true);
	let isLoading = $state(false);
	let errorMessage = $state('');

	let pwaStatus = $state({ isPromptReady: false, isWebview: false, isMobile: false, isIOS: false, isStandalone: false });
	let installGuideMessage = $state('');
	let showInstallBanner = $state(true);

	function handleSubmit() {
		isLoading = true;
		errorMessage = '';

		fetch(API_ENDPOINTS.login, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				usernameOrEmail: usernameOrEmail,
				password: password
			})
		})
		.then(response => response.json())
		.then(data => {
			isLoading = false;
			if (data.error) {
				errorMessage = data.error;
			} else {
				isClicked = true;
				dispatch('login', data.data);
				// Clear any previous session data to prevent cross-account leaks
				localStorage.clear();
				sessionStorage.clear();
				// Store new user in localStorage
				localStorage.setItem('chronomuse_user', JSON.stringify(data.data.user));
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new Event('chronomuse_auth_change'));
				}
				// Redirect to dashboard using SvelteKit navigation
				setTimeout(() => {
					goto('/dashboard');
				}, 300);
			}
		})
		.catch(error => {
			isLoading = false;
			errorMessage = 'An error occurred. Please try again.';
			console.error('Login error:', error);
		});
	}

	function togglePassword() {
		showPassword = !showPassword;
	}

	async function handleInstallApp() {
		installGuideMessage = '';
		const result = await promptPWAInstall();
		if (result.needManualGuide) {
			installGuideMessage = result.guide;
		}
	}

	onMount(() => {
		isVisible = true;
		initPWAInstall();
		const unsub = subscribePWAStatus((/** @type {any} */ st) => {
			pwaStatus = st;
		});
		return () => unsub();
	});
</script>

<div
	class="max-w-md w-full mx-auto px-2 sm:px-0 transition-all duration-300"
	class:scale-105={isClicked}
>
	<div class="bg-white/85 backdrop-blur-md rounded-2xl shadow-xl p-6 sm:p-6 border-2 border-pink-300 transition-all duration-300 hover:shadow-2xl">
		<!-- Header -->
		<div class="text-center mb-5">
			<img src="/logo.png" alt="ChronoMuse" class="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-2 rounded-xl object-contain shadow-sm border border-pink-200 hover:scale-105 transition-transform duration-300" />
			<h1 class="text-xl sm:text-2xl font-extrabold text-pink-500 mb-0.5 tracking-wider uppercase">CHRONOMUSE</h1>
			<p class="text-pink-600 text-xs sm:text-sm font-medium">Sign in to your account</p>
		</div>

		<!-- Error Message -->
		{#if errorMessage}
			<div class="mb-4 p-2.5 bg-red-100/90 border border-red-300 rounded-xl text-red-700 text-xs font-medium text-center">
				{errorMessage}
			</div>
		{/if}

		<!-- Form -->
		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
			<!-- Username or Email Field -->
			<div>
				<input
					type="text"
					bind:value={usernameOrEmail}
					class="w-full px-3.5 py-2.5 bg-white/90 border-2 border-pink-300 rounded-xl text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 text-xs sm:text-sm text-center font-medium"
					placeholder="Username or Email"
					required
					disabled={isLoading}
				/>
			</div>

			<!-- Password Field -->
			<div class="relative flex items-center">
				<input
					type={showPassword ? 'text' : 'password'}
					bind:value={password}
					class="w-full pl-3.5 pr-10 py-2.5 bg-white/90 border-2 border-pink-300 rounded-xl text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 text-xs sm:text-sm text-center font-medium"
					placeholder="Password"
					required
					disabled={isLoading}
				/>
				<button
					type="button"
					onclick={togglePassword}
					class="absolute right-3 text-pink-400 hover:text-pink-600 focus:outline-none p-1"
					aria-label={showPassword ? 'Hide password' : 'Show password'}
					disabled={isLoading}
				>
					{#if showPassword}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12c1.274 4.057 5.064 7 9.542 7 4.477 0 8.268-2.943 9.542-7-1.274-4.057-5.064-7-9.542-7-4.477 0-8.268 2.943-9.542 7z" />
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
					{/if}
				</button>
			</div>

			<!-- Submit Button -->
			<button
				type="submit"
				disabled={isLoading}
				class="w-full py-2.5 px-4 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-xl font-bold hover:from-pink-500 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-400 shadow-md transform hover:-translate-y-0.5 active:scale-95 transition-all duration-200 text-xs sm:text-sm uppercase tracking-wider disabled:opacity-50 flex items-center justify-center space-x-2"
			>
				{#if isLoading}
					<div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
					<span>Signing in...</span>
				{:else}
					<span>SIGN IN</span>
				{/if}
			</button>
		</form>

		<!-- Register Link -->
		<div class="mt-4 text-center">
			<p class="text-pink-700 text-xs font-medium">
				Don't have an account?
				<a href="/register" class="text-pink-600 hover:text-pink-800 font-bold transition-colors duration-200 underline">
					Register
				</a>
			</p>
		</div>
	</div>

	<!-- Credit Line -->
	<div class="mt-3.5 text-center flex items-center justify-center">
		<p class="text-[9.5px] sm:text-[11px] font-semibold text-pink-700 bg-white/40 backdrop-blur-md py-2 px-2.5 sm:px-3 rounded-xl border border-pink-300/80 shadow-sm whitespace-nowrap tracking-tight sm:tracking-normal">
			© 2026 CHRONOMUSE. All rights reserved. Developed by Merlye Deyto
		</p>
	</div>
</div>

<!-- Install ChronoMuse Banner (fixed bottom, doesn't affect login card position) -->
{#if showInstallBanner && !pwaStatus.isStandalone}
	<div class="fixed bottom-4 left-0 right-0 md:bottom-auto md:top-20 md:left-auto md:right-4 z-50 p-3 md:p-0 flex justify-center md:justify-end pointer-events-none">
		<div class="max-w-md md:max-w-xs w-full relative bg-white/95 backdrop-blur-md rounded-2xl border-2 border-pink-400 shadow-2xl overflow-hidden animate-fade-in-up pointer-events-auto">
			<!-- Close (X) Button -->
			<button
				type="button"
				onclick={() => showInstallBanner = false}
				class="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-pink-200/80 hover:bg-pink-300 text-pink-700 hover:text-pink-900 transition-all duration-200 z-10"
				aria-label="Close install banner"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<div class="p-3.5 pt-3 space-y-2">
				<!-- App Info Row -->
				<div class="flex items-center space-x-3">
					<img src="/logo.png" alt="ChronoMuse" class="w-10 h-10 rounded-xl object-contain border border-pink-200 shadow-sm flex-shrink-0" />
					<div class="min-w-0 flex-1 pr-5">
						<h4 class="text-xs sm:text-sm font-extrabold text-pink-900 leading-tight">ChronoMuse</h4>
						<p class="text-[10.5px] text-pink-600 font-medium leading-tight">Memory Calendar & Mood Tracker</p>
					</div>
				</div>

				{#if pwaStatus.isWebview}
					<p class="text-[10.5px] text-pink-700 font-medium leading-tight text-center bg-pink-50 p-2 rounded-lg border border-pink-200">
						Open in your browser to install the app for best experience!
					</p>
				{/if}

				<!-- Install Button -->
				<button
					type="button"
					onclick={handleInstallApp}
					class="w-full py-2 px-3 bg-gradient-to-r from-pink-500 to-pink-600 text-white rounded-xl font-bold text-xs hover:from-pink-600 hover:to-pink-700 shadow-md active:scale-95 transition-all duration-200 flex items-center justify-center space-x-1.5"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
					</svg>
					<span>INSTALL</span>
				</button>

				{#if installGuideMessage}
					<div class="p-2 bg-pink-50 rounded-lg border border-pink-300 text-[10.5px] font-semibold text-pink-800 text-center animate-fade-in">
						{installGuideMessage}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

