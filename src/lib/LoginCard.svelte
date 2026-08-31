<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';

	const dispatch = createEventDispatcher();

	let usernameOrEmail = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let isClicked = $state(false);
	let isVisible = $state(false);
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
	class="max-w-md w-full transition-all duration-500"
	class:scale-105={isClicked}
	class:opacity-0={!isVisible}
	class:translate-y-8={!isVisible}
>
	<div class="bg-white/80 backdrop-blur-md rounded-2xl shadow-2xl p-8 border-2 border-pink-300 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl">
		<!-- Header -->
		<div class="text-center mb-8">
			<h1 class="text-4xl font-extrabold text-pink-500 mb-2 tracking-widest uppercase">CHRONOMUSE</h1>
			<p class="text-pink-700 text-sm">Sign in to your account</p>
		</div>

		<!-- Error Message -->
		{#if errorMessage}
			<div class="mb-5 p-3 bg-red-100 border border-red-300 rounded-xl text-red-700 text-sm">
				{errorMessage}
			</div>
		{/if}

		<!-- Form -->
		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-5">
			<!-- Username or Email Field -->
			<div>
				<input
					type="text"
					bind:value={usernameOrEmail}
					class="w-full px-4 py-3 bg-white/90 border-2 border-pink-300 rounded-xl text-pink-700 placeholder-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 text-center"
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
					class="w-full px-4 py-3 bg-white/90 border-2 border-pink-300 rounded-xl text-pink-700 placeholder-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 text-center"
					placeholder="Password"
					required
					disabled={isLoading}
				/>
				<button
					type="button"
					onclick={togglePassword}
					class="absolute -right-3 top-1/2 -translate-y-1/2 p-2 bg-white border-2 border-pink-300 rounded-lg text-pink-400 hover:text-pink-600 hover:border-pink-500 transition-all duration-200 shadow-md z-10"
					disabled={isLoading}
				>
					{#if showPassword}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
					{/if}
				</button>
			</div>

			<!-- Submit Button -->
			<button
				type="submit"
				class="w-full py-3 px-4 bg-gradient-to-r from-pink-400 to-pink-600 hover:from-pink-500 hover:to-pink-700 text-white font-semibold rounded-xl shadow-lg transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
				disabled={isLoading}
			>
				{#if isLoading}
					Signing In...
				{:else}
					Sign In
				{/if}
			</button>
		</form>

		<!-- Register Link -->
		<div class="mt-6 text-center">
			<p class="text-pink-700 text-sm">
				Don't have an account?
				<a href="/register" class="text-pink-500 hover:text-pink-700 font-medium transition-colors duration-200">
					Register
				</a>
			</p>
		</div>
	</div>

	<!-- Credit Line -->
	<div class="mt-5 text-center">
		<p class="text-xs text-pink-600 bg-white/60 backdrop-blur-sm py-3 px-4 rounded-lg border border-pink-200">
			© 2026 CHRONOMUSE. All rights reserved. Developed by Merlye Deyto
		</p>
	</div>
</div>
