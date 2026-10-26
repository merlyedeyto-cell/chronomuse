<script>
	import RegisterCard from '$lib/RegisterCard.svelte';
	import TopBar from '$lib/TopBar.svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { toast } from '$lib/toastService.js';

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
		toast.show(event.detail.message, event.detail.type);
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
	</TopBar>
{:else}
	<div class="min-h-screen bg-pink-50 flex items-center justify-center"></div>
{/if}
