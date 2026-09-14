<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { initPWAInstall, subscribePWAStatus, promptPWAInstall, openInstalledApp } from '$lib/pwaInstall.js';

	const dispatch = createEventDispatcher();

	let usernameOrEmail = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let isClicked = $state(false);
	let isLoading = $state(false);
	let errorMessage = $state('');

	let pwaStatus = $state({ isPromptReady: false, isWebview: false, isMobile: false, isIOS: false, isStandalone: false, isAppInstalled: false });
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
				let redirectTarget = '/dashboard';
				if (typeof window !== 'undefined') {
					const urlParams = new URLSearchParams(window.location.search);
					const paramRedirect = urlParams.get('redirect');
					const sessionRedirect = sessionStorage.getItem('chronomuse_redirect_after_login');
					if (paramRedirect) {
						redirectTarget = decodeURIComponent(paramRedirect);
					} else if (sessionRedirect) {
						redirectTarget = sessionRedirect;
					}
				}
				localStorage.clear();
				sessionStorage.clear();
				localStorage.setItem('chronomuse_user', JSON.stringify(data.data.user));
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new Event('chronomuse_auth_change'));
				}
				goto(redirectTarget || '/dashboard');
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
		if (pwaStatus.isAppInstalled) {
			openInstalledApp();
			return;
		}
		installGuideMessage = '';
		const result = await promptPWAInstall();
		if (result.needManualGuide) {
			installGuideMessage = result.guide;
		}
	}

	onMount(() => {
		initPWAInstall();
		const unsub = subscribePWAStatus((/** @type {any} */ st) => {
			pwaStatus = st;
		});
		return () => unsub();
	});
</script>

<div
	class="w-full max-w-[360px] sm:max-w-[420px] mx-auto transition-all duration-300"
	class:scale-[1.02]={isClicked}
>
	<div class="bg-white rounded-[32px] sm:rounded-[38px] p-7 sm:p-9 shadow-[0_16px_50px_rgba(244,114,182,0.22)] border border-pink-100/90 text-center transition-all duration-300">
		<!-- Mascot Logo Header -->
		<div class="text-center mb-6">
			<div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-black flex items-center justify-center p-1.5 mx-auto mb-3.5 shadow-sm hover:scale-105 transition-transform duration-200">
				<img src="/logo.png" alt="ChronoMuse" class="w-10 h-10 sm:w-11 sm:h-11 object-contain pointer-events-none" />
			</div>
			<h1 class="text-xl sm:text-2xl font-black text-pink-500 mb-1 tracking-wide uppercase">CHRONOMUSE</h1>
			<p class="text-pink-400 text-xs sm:text-sm font-bold">Sign in to your account</p>
		</div>

		<!-- Error Message -->
		{#if errorMessage}
			<div class="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-600 text-xs font-bold text-center">
				{errorMessage}
			</div>
		{/if}

		<!-- Form -->
		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-3.5 sm:space-y-4">
			<!-- Username or Email Field -->
			<div>
				<input
					type="text"
					bind:value={usernameOrEmail}
					class="w-full px-5 sm:px-6 py-3.5 sm:py-4 bg-white border-2 border-pink-200/90 rounded-full text-pink-800 placeholder-pink-300 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all text-xs sm:text-sm font-bold text-left"
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
					class="w-full pl-5 sm:pl-6 pr-12 py-3.5 sm:py-4 bg-white border-2 border-pink-200/90 rounded-full text-pink-800 placeholder-pink-300 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all text-xs sm:text-sm font-bold text-left"
					placeholder="Password"
					required
					disabled={isLoading}
				/>
				<button
					type="button"
					onclick={togglePassword}
					class="absolute right-4 text-pink-300 hover:text-pink-500 focus:outline-none p-1 cursor-pointer transition-colors"
					aria-label={showPassword ? 'Hide password' : 'Show password'}
					disabled={isLoading}
				>
					{#if showPassword}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
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
				class="w-full py-3.5 sm:py-4 bg-[#f43f8e] hover:bg-[#e11d48] text-white rounded-full font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_8px_22px_rgba(244,63,94,0.32)] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-2"
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
		<div class="mt-6 text-center">
			<p class="text-pink-400 text-xs sm:text-sm font-bold">
				Don't have an account?
				<a href="/register" class="text-pink-600 hover:text-pink-800 font-black transition-colors ml-1">
					Register
				</a>
			</p>
		</div>
	</div>
</div>

<!-- Install ChronoMuse Banner -->
{#if showInstallBanner && !pwaStatus.isStandalone}
	<div class="fixed bottom-4 left-0 right-0 md:bottom-auto md:top-20 md:left-auto md:right-4 z-50 p-3 md:p-0 flex justify-center md:justify-end pointer-events-none">
		<div class="max-w-md md:max-w-xs w-full relative bg-white rounded-3xl border-2 border-pink-300 shadow-[0_10px_30px_rgba(244,114,182,0.25)] overflow-hidden animate-fade-in-up pointer-events-auto">
			<button
				type="button"
				onclick={() => showInstallBanner = false}
				class="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-full bg-pink-100 hover:bg-pink-200 text-pink-700 hover:text-pink-900 transition-all z-10 cursor-pointer"
				aria-label="Close banner"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<div class="p-4 pt-3.5 space-y-2.5">
				<div class="flex items-center space-x-3">
					<div class="w-10 h-10 rounded-xl bg-black flex items-center justify-center p-1 flex-shrink-0">
						<img src="/logo.png" alt="ChronoMuse" class="w-7 h-7 object-contain" />
					</div>
					<div class="min-w-0 flex-1 pr-4">
						<h4 class="text-xs sm:text-sm font-black text-pink-950 leading-tight">ChronoMuse</h4>
						<p class="text-[10.5px] text-pink-500 font-bold leading-tight">Memory Calendar & Mood Tracker</p>
					</div>
				</div>

				{#if pwaStatus.isWebview}
					<p class="text-[10.5px] text-pink-700 font-bold leading-tight text-center bg-pink-50 p-2 rounded-xl border border-pink-200">
						Open in your browser to install the app for best experience!
					</p>
				{/if}

				{#if pwaStatus.isAppInstalled}
					<button
						type="button"
						onclick={handleInstallApp}
						class="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-black text-xs active:scale-95 transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm"
					>
						<span>OPEN APP</span>
					</button>
				{:else}
					<button
						type="button"
						onclick={handleInstallApp}
						class="w-full py-2.5 px-3 bg-[#f43f8e] hover:bg-[#e11d48] text-white rounded-full font-black text-xs active:scale-95 transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm"
					>
						<span>INSTALL APP</span>
					</button>
				{/if}

				{#if installGuideMessage}
					<div class="p-2 bg-pink-50 rounded-xl border border-pink-200 text-[10.5px] font-bold text-pink-800 text-center">
						{installGuideMessage}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

