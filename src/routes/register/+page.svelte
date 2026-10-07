<script>
	import RegisterCard from '$lib/RegisterCard.svelte';
	import TopBar from '$lib/TopBar.svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { CheckCircle, AlertCircle } from 'lucide-svelte';

	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state('success');
	let isCheckingAuth = $state(true);
	let isLoggedIn = $state(false);

	if (typeof window !== 'undefined') {
		try {
			const storedUser = localStorage.getItem('chronomuse_user');
			if (storedUser) {
				const parsed = JSON.parse(storedUser);
				if (parsed && parsed.id) {
					isLoggedIn = true;
					isCheckingAuth = false;
					goto('/dashboard');
				}
			}
		} catch (e) {}
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
	});

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

{#if !isCheckingAuth && !isLoggedIn}
	<TopBar showNav={true} showFooter={true} on:navigate={handleNavigate}>
		<div class="w-full flex items-center justify-center min-h-[calc(100vh-160px)]">
			<RegisterCard on:register={handleRegister} on:showToast={showRegisterToast} />
		</div>

		<!-- Toast Notification -->
		{#if showToast}
			<div class="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
				<div
					class="px-6 py-3 rounded-2xl border flex items-center space-x-3 shadow-xl {toastType === 'success' ? 'bg-gradient-to-r from-[#f43f8e] to-pink-500 border-pink-300/40 text-white shadow-pink-500/20' : 'bg-gradient-to-r from-rose-500 to-pink-600 border-rose-400 text-white shadow-pink-500/20'}"
				>
					{#if toastType === 'success'}
						<CheckCircle class="w-5 h-5 text-white flex-shrink-0" />
					{:else}
						<AlertCircle class="w-5 h-5 text-white flex-shrink-0" />
					{/if}
					<span class="text-sm font-black">{toastMessage}</span>
				</div>
			</div>
		{/if}
	</TopBar>
{:else}
	<div class="min-h-screen bg-pink-50 flex items-center justify-center"></div>
{/if}

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
