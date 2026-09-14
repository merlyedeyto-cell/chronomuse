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
	class="w-full max-w-[360px] sm:max-w-[410px] mx-auto transition-all duration-300"
	class:scale-[1.02]={isClicked}
>
	<div class="bg-white rounded-[32px] sm:rounded-[36px] p-6 sm:p-8 md:p-9 shadow-[0_16px_45px_rgba(244,114,182,0.2)] border border-pink-100/90 text-center transition-all duration-300">
		<!-- Mascot Logo Header -->
		<div class="text-center mb-5">
			<div class="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-black flex items-center justify-center p-1.5 mx-auto mb-3 shadow-xs hover:scale-105 transition-transform duration-200">
				<img src="/logo.png" alt="ChronoMuse" class="w-9 h-9 sm:w-10.5 sm:h-10.5 object-contain pointer-events-none" />
			</div>
			<h1 class="text-xl sm:text-2xl font-black text-[#f43f8e] mb-0.5 tracking-tight uppercase">CHRONOMUSE</h1>
			<p class="text-pink-400 text-xs sm:text-[13px] font-bold">Create your account</p>
		</div>

		<!-- Error Message -->
		{#if errorMessage}
			<div class="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-600 text-xs font-bold text-center">
				{errorMessage}
			</div>
		{/if}

		<!-- Form -->
		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-3 sm:space-y-3.5">
			<!-- Username Field -->
			<div>
				<input
					type="text"
					bind:value={username}
					class="w-full px-5 sm:px-6 py-3 sm:py-3.5 bg-white border-2 border-pink-200/90 rounded-full text-pink-900 placeholder-pink-300 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all text-xs sm:text-sm font-bold text-left"
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
					class="w-full px-5 sm:px-6 py-3 sm:py-3.5 bg-white border-2 border-pink-200/90 rounded-full text-pink-900 placeholder-pink-300 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all text-xs sm:text-sm font-bold text-left"
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
					class="w-full pl-5 sm:pl-6 pr-12 py-3 sm:py-3.5 bg-white border-2 border-pink-200/90 rounded-full text-pink-900 placeholder-pink-300 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all text-xs sm:text-sm font-bold text-left"
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

			<!-- Confirm Password Field -->
			<div class="relative flex items-center">
				<input
					type={showConfirmPassword ? 'text' : 'password'}
					bind:value={confirmPassword}
					class="w-full pl-5 sm:pl-6 pr-12 py-3 sm:py-3.5 bg-white border-2 border-pink-200/90 rounded-full text-pink-900 placeholder-pink-300 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all text-xs sm:text-sm font-bold text-left"
					placeholder="Confirm Password"
					required
					disabled={isLoading}
				/>
				<button
					type="button"
					onclick={toggleConfirmPassword}
					class="absolute right-4 text-pink-300 hover:text-pink-500 focus:outline-none p-1 cursor-pointer transition-colors"
					aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
					disabled={isLoading}
				>
					{#if showConfirmPassword}
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
				class="w-full py-3.5 sm:py-3.5 bg-[#f43f8e] hover:bg-[#e11d48] text-white rounded-full font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_8px_20px_rgba(244,63,94,0.28)] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-2 mt-2"
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
		<div class="mt-5 sm:mt-6 text-center">
			<p class="text-pink-400 text-xs sm:text-[13px] font-bold">
				Already have an account?
				<a href="/" class="text-[#f43f8e] hover:text-pink-700 font-black transition-colors ml-1">
					Sign In
				</a>
			</p>
		</div>
	</div>
</div>

