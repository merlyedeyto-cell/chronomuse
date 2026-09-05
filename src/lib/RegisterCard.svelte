<script>
	import { createEventDispatcher } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';

	const dispatch = createEventDispatcher();

	let username = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);
	let isClicked = $state(false);
	let isLoading = $state(false);
	let errorMessage = $state('');

	function handleSubmit() {
		if (password !== confirmPassword) {
			errorMessage = 'Passwords do not match!';
			return;
		}

		isLoading = true;
		errorMessage = '';

		fetch(API_ENDPOINTS.register, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				username: username,
				email: email,
				password: password
			})
		})
		.then(response => {
			const contentType = response.headers.get('content-type');
			if (!contentType || !contentType.includes('application/json')) {
				return response.text().then(text => {
					throw new Error('Server returned HTML instead of JSON: ' + text.substring(0, 200));
				});
			}
			return response.json();
		})
		.then(data => {
			isLoading = false;
			if (data.error) {
				errorMessage = data.error;
				dispatch('showToast', { message: 'Register Failed', type: 'error' });
			} else {
				dispatch('showToast', { message: 'Register Successful!', type: 'success' });
				isClicked = true;
				setTimeout(() => {
					isClicked = false;
				}, 300);
				setTimeout(() => {
					goto('/');
				}, 1500);
			}
		})
		.catch(error => {
			isLoading = false;
			errorMessage = error.message || 'An error occurred. Please try again.';
			console.error('Registration error:', error);
		});
	}

	function togglePassword() {
		showPassword = !showPassword;
	}

	function toggleConfirmPassword() {
		showConfirmPassword = !showConfirmPassword;
	}
</script>

<div
	class="max-w-md w-full transition-all duration-300 hover:scale-105"
	class:scale-105={isClicked}
>
	<div class="bg-white/85 backdrop-blur-md rounded-2xl shadow-xl p-4 sm:p-5 border-2 border-pink-300 transition-all duration-300 hover:shadow-2xl">
		<!-- Header -->
		<div class="text-center mb-3">
			<img src="/logo.png" alt="ChronoMuse" class="w-10 h-10 sm:w-11 sm:h-11 mx-auto mb-1 rounded-xl object-contain shadow-sm border border-pink-200 hover:scale-105 transition-transform duration-300" />
			<h1 class="text-lg sm:text-xl font-extrabold text-pink-500 mb-0.5 tracking-wider uppercase">CHRONOMUSE</h1>
			<p class="text-pink-600 text-xs font-medium">Create your account</p>
		</div>

		<!-- Error Message -->
		{#if errorMessage}
			<div class="mb-3 p-2 bg-red-100/90 border border-red-300 rounded-xl text-red-700 text-xs font-medium text-center">
				{errorMessage}
			</div>
		{/if}

		<!-- Form -->
		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-2.5">
			<!-- Username Field -->
			<div>
				<input
					type="text"
					bind:value={username}
					class="w-full px-3 py-2 bg-white/90 border-2 border-pink-300 rounded-xl text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 text-xs sm:text-sm text-center font-medium"
					placeholder="Username"
					required
					disabled={isLoading}
				/>
			</div>

			<!-- Email Field -->
			<div>
				<input
					type="email"
					bind:value={email}
					class="w-full px-3 py-2 bg-white/90 border-2 border-pink-300 rounded-xl text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 text-xs sm:text-sm text-center font-medium"
					placeholder="Email @example.com"
					required
					disabled={isLoading}
				/>
			</div>

			<!-- Password Field -->
			<div class="relative flex items-center">
				<input
					type={showPassword ? 'text' : 'password'}
					bind:value={password}
					class="w-full pl-3 pr-9 py-2 bg-white/90 border-2 border-pink-300 rounded-xl text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 text-xs sm:text-sm text-center font-medium"
					placeholder="Password"
					required
					disabled={isLoading}
				/>
				<button
					type="button"
					onclick={togglePassword}
					class="absolute right-2.5 text-pink-400 hover:text-pink-600 focus:outline-none p-1"
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

			<!-- Confirm Password Field -->
			<div class="relative flex items-center">
				<input
					type={showConfirmPassword ? 'text' : 'password'}
					bind:value={confirmPassword}
					class="w-full pl-3 pr-9 py-2 bg-white/90 border-2 border-pink-300 rounded-xl text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 text-xs sm:text-sm text-center font-medium"
					placeholder="Confirm Password"
					required
					disabled={isLoading}
				/>
				<button
					type="button"
					onclick={toggleConfirmPassword}
					class="absolute right-2.5 text-pink-400 hover:text-pink-600 focus:outline-none p-1"
					disabled={isLoading}
				>
					{#if showConfirmPassword}
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
				class="w-full py-2 px-4 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-xl font-bold hover:from-pink-500 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-400 shadow-md transform hover:-translate-y-0.5 active:scale-95 transition-all duration-200 text-xs uppercase tracking-wider disabled:opacity-50 flex items-center justify-center space-x-2"
			>
				{#if isLoading}
					<div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
					<span>Registering...</span>
				{:else}
					<span>REGISTER</span>
				{/if}
			</button>
		</form>

		<!-- Login Link -->
		<div class="mt-2.5 text-center">
			<p class="text-pink-700 text-xs font-medium">
				Already have an account?
				<a href="/" class="text-pink-600 hover:text-pink-800 font-bold transition-colors duration-200 underline">
					Sign In
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
