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
	let isVisible = $state(true);
	let isLoading = $state(false);
	let errorMessage = $state('');

	let pwaStatus = $state({ isPromptReady: false, isWebview: false, isMobile: false, isIOS: false, isStandalone: false, isAppInstalled: false });
	let installGuideMessage = $state('');
	let showInstallBanner = $state(true);

	// Suspended Account Modal State
	let showSuspendedModal = $state(false);
	let suspendedUser = $state(null);
	let appealReason = $state('');
	let isSubmittingAppeal = $state(false);
	let appealSuccessMessage = $state('');
	let appealErrorMessage = $state('');

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
			if (data.is_suspended) {
				suspendedUser = data.user || {
					username: usernameOrEmail.includes('@') ? usernameOrEmail.split('@')[0] : usernameOrEmail,
					email: usernameOrEmail.includes('@') ? usernameOrEmail : ''
				};
				showSuspendedModal = true;
				appealReason = '';
				appealSuccessMessage = '';
				appealErrorMessage = '';
				errorMessage = '';
				return;
			}
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

	async function handleRequestReactivation(e) {
		if (e) e.preventDefault();
		if (!suspendedUser) return;

		isSubmittingAppeal = true;
		appealErrorMessage = '';
		appealSuccessMessage = '';

		try {
			const res = await fetch(API_ENDPOINTS.requestReactivation, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: suspendedUser.id,
					username: suspendedUser.username,
					email: suspendedUser.email,
					reason: appealReason.trim()
				})
			});
			const result = await res.json();
			if (result.success) {
				appealSuccessMessage = result.message || 'Reactivation request sent! The administrator will review your account.';
			} else {
				appealErrorMessage = result.error || 'Failed to submit reactivation request';
			}
		} catch (err) {
			appealErrorMessage = 'Network error submitting request. Please try again.';
		} finally {
			isSubmittingAppeal = false;
		}
	}

	function togglePassword() {
		showPassword = !showPassword;
	}

	async function handleInstallApp() {
		// If app is already installed, open it
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
		isVisible = true;
		initPWAInstall();
		const unsub = subscribePWAStatus((/** @type {any} */ st) => {
			pwaStatus = st;
		});
		return () => unsub();
	});
</script>

<div
	class="w-full sm:max-w-md mx-1 sm:mx-auto transition-all duration-300"
	class:scale-105={isClicked}
>
	<div class="bg-white rounded-2xl p-6 sm:p-6 border-2 border-pink-300 transition-all duration-300">
		<!-- Header -->
		<div class="text-center mb-5">
			<img src="/logo.png" alt="ChronoMuse" class="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-2 rounded-xl object-contain border border-pink-200 hover:scale-105 transition-transform duration-300" />
			<h1 class="text-xl sm:text-2xl font-extrabold text-pink-500 mb-0.5 tracking-wider uppercase">CHRONOMUSE</h1>
			<p class="text-pink-600 text-xs sm:text-sm font-medium">Sign in to your account</p>
		</div>

		<!-- Error Message -->
		{#if errorMessage}
			<div class="mb-4 p-2.5 bg-red-100 border border-red-300 rounded-xl text-red-700 text-xs font-medium text-center">
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
					class="w-full px-3.5 py-2.5 bg-pink-50 border-2 border-pink-300 rounded-xl text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 text-xs sm:text-sm text-center font-medium"
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
					class="w-full pl-3.5 pr-10 py-2.5 bg-pink-50 border-2 border-pink-300 rounded-xl text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 text-xs sm:text-sm text-center font-medium"
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
				class="w-full py-2.5 px-4 bg-pink-500 text-white rounded-xl font-bold hover:bg-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-400 active:scale-95 transition-all duration-200 text-xs sm:text-sm uppercase tracking-wider disabled:opacity-50 flex items-center justify-center space-x-2"
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
		<p class="text-[9.5px] sm:text-[11px] font-semibold text-pink-700 bg-white py-2 px-2.5 sm:px-3 rounded-xl border border-pink-300 whitespace-nowrap tracking-tight sm:tracking-normal">
			© 2026 CHRONOMUSE. All rights reserved. Developed by Merlye Deyto
		</p>
	</div>
</div>

<!-- Account Suspended Appeal Modal -->
{#if showSuspendedModal && suspendedUser}
	<div class="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center p-4 animate-fade-in">
		<div class="bg-white border-2 border-rose-300 rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl space-y-4">
			<!-- Header Icon -->
			<div class="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border-2 border-rose-200 shadow-xs">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-7 h-7">
					<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
				</svg>
			</div>

			<!-- User Info Card -->
			<div class="bg-rose-50/70 border border-rose-200 rounded-2xl p-3 flex items-center space-x-3 text-left">
				<div class="w-10 h-10 rounded-full bg-rose-300 text-rose-900 font-black flex items-center justify-center overflow-hidden flex-shrink-0 text-sm">
					{#if suspendedUser.avatar_url}
						<img src={suspendedUser.avatar_url} alt="" class="w-full h-full object-cover" />
					{:else}
						{(suspendedUser.username || suspendedUser.email)?.charAt(0).toUpperCase()}
					{/if}
				</div>
				<div class="min-w-0 flex-1">
					<p class="text-xs font-black text-rose-900 truncate">@{suspendedUser.username}</p>
					<p class="text-[10.5px] text-rose-700 truncate font-mono">{suspendedUser.email || '—'}</p>
				</div>
			</div>

			<div>
				<h3 class="text-base font-black text-rose-800">Account Suspended</h3>
				<p class="text-xs text-pink-600 font-medium mt-1 leading-relaxed">
					Your ChronoMuse account has been suspended by the administrator. You cannot sign in until your account is reactivated.
				</p>
			</div>

			{#if appealSuccessMessage}
				<div class="p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2 text-left">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-emerald-600 flex-shrink-0">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span>{appealSuccessMessage}</span>
				</div>
			{:else}
				{#if appealErrorMessage}
					<div class="p-2.5 bg-rose-100 border border-rose-300 text-rose-900 rounded-xl text-xs font-bold text-left">
						{appealErrorMessage}
					</div>
				{/if}

				<form onsubmit={handleRequestReactivation} class="space-y-3 text-left">
					<div>
						<label for="appeal_reason_input" class="block text-[11px] font-bold text-pink-800 mb-1">Appeal Note to Admin (Optional)</label>
						<textarea
							id="appeal_reason_input"
							bind:value={appealReason}
							placeholder="State why you would like your account reactivated..."
							rows="2"
							class="w-full px-3 py-2 bg-pink-50 border-2 border-pink-200 rounded-xl text-xs font-medium text-pink-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white resize-none"
						></textarea>
					</div>

					<button
						type="submit"
						disabled={isSubmittingAppeal}
						class="w-full py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
					>
						{#if isSubmittingAppeal}
							<div class="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
							<span>Sending Request...</span>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
							</svg>
							<span>Request to Reactivate My Account</span>
						{/if}
					</button>
				</form>
			{/if}

			<button
				type="button"
				onclick={() => { showSuspendedModal = false; errorMessage = ''; password = ''; }}
				class="w-full py-2 bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
			>
				Back to Sign In
			</button>
		</div>
	</div>
{/if}

<!-- Install ChronoMuse Banner -->
{#if showInstallBanner && !pwaStatus.isStandalone}
	<div class="fixed bottom-4 left-0 right-0 md:bottom-auto md:top-20 md:left-auto md:right-4 z-50 p-3 md:p-0 flex justify-center md:justify-end pointer-events-none">
		<div class="max-w-md md:max-w-xs w-full relative bg-white rounded-2xl border-2 border-pink-400 overflow-hidden animate-fade-in-up pointer-events-auto">
			<!-- Close (X) Button -->
			<button
				type="button"
				onclick={() => showInstallBanner = false}
				class="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-pink-100 hover:bg-pink-200 text-pink-700 hover:text-pink-900 transition-all duration-200 z-10"
				aria-label="Close install banner"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<div class="p-3.5 pt-3 space-y-2">
				<!-- App Info Row -->
				<div class="flex items-center space-x-3">
					<img src="/logo.png" alt="ChronoMuse" class="w-10 h-10 rounded-xl object-contain border border-pink-200 flex-shrink-0" />
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

				<!-- Install / Open App Button -->
				{#if pwaStatus.isAppInstalled}
					<button
						type="button"
						onclick={handleInstallApp}
						class="w-full py-2 px-3 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 active:scale-95 transition-all duration-200 flex items-center justify-center space-x-1.5"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
						</svg>
						<span>OPEN APP</span>
					</button>
				{:else}
					<button
						type="button"
						onclick={handleInstallApp}
						class="w-full py-2 px-3 bg-pink-500 text-white rounded-xl font-bold text-xs hover:bg-pink-600 active:scale-95 transition-all duration-200 flex items-center justify-center space-x-1.5"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
						</svg>
						<span>INSTALL</span>
					</button>
				{/if}

				{#if installGuideMessage}
					<div class="p-2 bg-pink-50 rounded-lg border border-pink-300 text-[10.5px] font-semibold text-pink-800 text-center animate-fade-in">
						{installGuideMessage}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
