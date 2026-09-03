<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';

	const dispatch = createEventDispatcher();

	let usernameOrEmail = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let isClicked = $state(false);
	let isVisible = $state(true);
	let isLoading = $state(false);
	let errorMessage = $state('');

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
				// Store user in localStorage
				localStorage.setItem('chronomuse_user', JSON.stringify(data.data.user));
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

	onMount(() => {
		isVisible = true;
	});
</script>

<div
	class="max-w-md w-full transition-all duration-300"
	class:scale-105={isClicked}
>
	<div class="bg-white/85 backdrop-blur-md rounded-2xl shadow-xl p-5 sm:p-6 border-2 border-pink-300 transition-all duration-300 hover:shadow-2xl">
		<!-- Header -->
		<div class="text-center mb-6">
			<h1 class="text-xl sm:text-2xl font-extrabold text-pink-500 mb-1 tracking-wider uppercase">CHRONOMUSE</h1>
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
	<div class="mt-3.5 text-center">
		<p class="text-[11px] font-semibold text-pink-700 bg-white/40 backdrop-blur-md py-2 px-3 rounded-xl border border-pink-300/80 shadow-sm">
			© 2026 CHRONOMUSE. All rights reserved. Developed by Merlye Deyto
		</p>
	</div>
</div>
