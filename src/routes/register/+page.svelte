<script>
	import RegisterCard from '$lib/RegisterCard.svelte';
	import TopBar from '$lib/TopBar.svelte';
	import { goto } from '$app/navigation';

	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state('success');

	function handleRegister(event) {
		console.log('Register attempt:', event.detail);
	}

	function showRegisterToast(event) {
		toastMessage = event.detail.message;
		toastType = event.detail.type;
		showToast = true;

		setTimeout(() => {
			showToast = false;
		}, 3000);
	}

	function handleNavigate(event) {
		const tab = event.detail;
		if (tab === 'home') {
			goto('/');
		} else if (tab === 'about') {
			goto('/?tab=about');
		} else if (tab === 'contact') {
			goto('/?tab=contact');
		}
	}
</script>

<TopBar showNav={true} showFooter={true} on:navigate={handleNavigate}>
	<div class="w-full flex items-center justify-center min-h-[calc(100vh-160px)]">
		<RegisterCard on:register={handleRegister} on:showToast={showRegisterToast} />
	</div>

	<!-- Toast Notification -->
	{#if showToast}
		<div class="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
			<div
				class="px-6 py-3 rounded-2xl border flex items-center space-x-3 shadow-lg {toastType === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-rose-500 border-rose-400 text-white'}"
			>
				{#if toastType === 'success'}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
					</svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
					</svg>
				{/if}
				<span class="text-sm font-black">{toastMessage}</span>
			</div>
		</div>
	{/if}
</TopBar>

<style>
	@keyframes bounce-in {
		0% {
			opacity: 0;
			transform: translate(-50%, -100px) scale(0.3);
		}
		50% {
			transform: translate(-50%, 0) scale(1.05);
		}
		70% {
			transform: translate(-50%, 0) scale(0.9);
		}
		100% {
			opacity: 1;
			transform: translate(-50%, 0) scale(1);
		}
	}

	.animate-bounce-in {
		animation: bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
	}
</style>
