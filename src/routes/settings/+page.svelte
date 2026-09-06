<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import { isSoundEnabled, setSoundEnabled, playClickSound } from '$lib/soundEffects.js';
	import Sidebar from '$lib/Sidebar.svelte';
	import { initPWAInstall, subscribePWAStatus, promptPWAInstall, openInstalledApp } from '$lib/pwaInstall.js';

	let currentUser = $state(typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('chronomuse_user') || 'null') : null);
	let sidebarOpen = $state(false);

	// Accordion state: All cards listed down as compact rows by default ('').
	// Only ONE card can be open at a time; opening a new card automatically closes the previous one.
	let activeTab = $state(''); // '' | 'install' | 'privacy' | 'audio' | 'blocked' | 'security'

	// PWA Install State
	let pwaStatus = $state({ isPromptReady: false, isWebview: false, isMobile: false, isIOS: false, isStandalone: false, isAppInstalled: false });
	let installGuideMessage = $state('');

	// Toggle Preferences
	let activeStatusEnabled = $state(true);
	let soundEffectsEnabled = $state(typeof window !== 'undefined' ? isSoundEnabled() : true);
	let privateAccountEnabled = $state(false);

	// Account Edit Fields
	let editUsername = $state('');
	let editEmail = $state('');
	let editNewPassword = $state('');
	let editConfirmPassword = $state('');
	let isSavingProfile = $state(false);

	// Blocked Users State
	let blockedUsers = $state(/** @type {any[]} */ ([]));
	
	// Live Search & Select User to Block
	let blockSearchInput = $state('');
	let searchResults = $state(/** @type {any[]} */ ([]));
	let isSearchingUsers = $state(false);
	let selectedUserToBlock = $state(/** @type {any} */ (null));
	let showConfirmBlockModal = $state(false);
	let searchDebounceTimer = /** @type {any} */ (null);

	// Confirmation Modals
	let showLogoutModal = $state(false);

	// Toast Notification State
	let toastMessage = $state('');
	let showToast = $state(false);
	let toastType = $state('success');

	function showNotification(/** @type {string} */ msg, type = 'success') {
		toastMessage = msg;
		toastType = type;
		showToast = true;
		setTimeout(() => {
			showToast = false;
		}, 3500);
	}

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	// Accordion handler: Automatically closes the previously opened card when a new card is clicked
	function toggleTab(/** @type {string} */ tabId) {
		playClickSound();
		if (activeTab === tabId) {
			activeTab = ''; // Close if clicking the currently open card
		} else {
			activeTab = tabId; // Automatically close previous card and open selected card
		}
	}

	function handleActiveStatusToggle(/** @type {any} */ e) {
		const enabled = e.target.checked;
		activeStatusEnabled = enabled;
		if (currentUser?.id) {
			try {
				localStorage.setItem(`chronomuse_active_status_${currentUser.id}`, enabled ? 'true' : 'false');
				fetch(API_ENDPOINTS.updateActivity, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ user_id: currentUser.id, is_active: enabled })
				}).catch(() => {});
			} catch (err) {}
		}
		playClickSound();
		showNotification(enabled ? 'Active status is now ON (Visible)' : 'Active status is now OFF (Hidden)', 'success');
	}

	function handleSoundToggle(/** @type {any} */ e) {
		const enabled = e.target.checked;
		soundEffectsEnabled = enabled;
		setSoundEnabled(enabled);
		showNotification(enabled ? 'Touch sound effects turned ON' : 'Touch sound effects turned OFF', 'success');
	}

	function handlePrivateAccountToggle(/** @type {any} */ e) {
		const enabled = e.target.checked;
		privateAccountEnabled = enabled;
		if (currentUser?.id) {
			try {
				localStorage.setItem(`chronomuse_private_${currentUser.id}`, enabled ? 'true' : 'false');
			} catch (err) {}
		}
		playClickSound();
		showNotification(enabled ? 'Private Account Mode turned ON' : 'Public Account Mode turned ON', 'success');
	}

	async function loadBlockedUsers() {
		if (typeof window === 'undefined' || !currentUser?.id) return;
		try {
			const stored = localStorage.getItem(`chronomuse_blocked_${currentUser.id}`);
			if (stored) blockedUsers = JSON.parse(stored);
		} catch (e) {}

		try {
			const res = await fetch(API_ENDPOINTS.blockUser, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: currentUser.id, action: 'get_blocked' })
			});
			const data = await res.json();
			if (data.success && Array.isArray(data.data)) {
				blockedUsers = data.data;
				saveBlockedUsers(data.data);
			}
		} catch (e) {}
	}

	function saveBlockedUsers(/** @type {any[]} */ list) {
		if (typeof window === 'undefined' || !currentUser?.id) return;
		try {
			localStorage.setItem(`chronomuse_blocked_${currentUser.id}`, JSON.stringify(list));
			blockedUsers = list;
		} catch (e) {}
	}

	async function handleUserBlockToggle(/** @type {any} */ userItem, /** @type {any} */ e) {
		const isBlocked = e.target.checked;
		playClickSound();
		if (!currentUser?.id || !userItem) return;
		const targetId = userItem.id || userItem.friend_id;

		if (!isBlocked) {
			try {
				await fetch(API_ENDPOINTS.blockUser, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ user_id: currentUser.id, target_id: targetId, action: 'unblock' })
				});
			} catch (err) {}
			const updated = blockedUsers.filter(b => String(b.id || b.friend_id) !== String(targetId));
			saveBlockedUsers(updated);
			showNotification(`Unblocked @${userItem.username}`, 'success');
		} else {
			try {
				await fetch(API_ENDPOINTS.blockUser, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ user_id: currentUser.id, target_id: targetId, action: 'block' })
				});
			} catch (err) {}
			const exists = blockedUsers.some(b => String(b.id || b.friend_id) === String(targetId));
			if (!exists) {
				const updated = [...blockedUsers, userItem];
				saveBlockedUsers(updated);
			}
			showNotification(`Blocked @${userItem.username}`, 'success');
		}
	}

	function handleBlockSearchInput(/** @type {any} */ e) {
		const val = e.target.value;
		blockSearchInput = val;

		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

		if (!val.trim()) {
			searchResults = [];
			isSearchingUsers = false;
			return;
		}

		isSearchingUsers = true;
		searchDebounceTimer = setTimeout(async () => {
			try {
				const res = await fetch(API_ENDPOINTS.searchUsers, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						user_id: currentUser?.id,
						query: val.trim().replace(/^@/, '')
					})
				});
				const data = await res.json();
				if (data.success && data.data?.users) {
					searchResults = data.data.users.filter((/** @type {any} */ u) => String(u.id) !== String(currentUser?.id));
				} else {
					searchResults = [];
				}
			} catch (err) {
				searchResults = [];
			} finally {
				isSearchingUsers = false;
			}
		}, 300);
	}

	function selectUserForBlocking(/** @type {any} */ userItem) {
		playClickSound();
		selectedUserToBlock = userItem;
		showConfirmBlockModal = true;
		searchResults = [];
	}

	async function confirmBlockSelectedUser() {
		if (!selectedUserToBlock || !currentUser?.id) return;
		playClickSound();

		const uname = selectedUserToBlock.username || selectedUserToBlock.email?.split('@')[0] || 'User';
		const targetId = selectedUserToBlock.id || selectedUserToBlock.friend_id;

		try {
			await fetch(API_ENDPOINTS.blockUser, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: currentUser.id, target_id: targetId, action: 'block' })
			});
		} catch (e) {}

		const updated = [
			...blockedUsers.filter(b => String(b.id || b.friend_id) !== String(targetId)),
			{
				id: targetId,
				username: uname,
				email: selectedUserToBlock.email || `${uname}@user.com`,
				avatar_url: selectedUserToBlock.avatar_url || null,
				blocked_at: new Date().toISOString()
			}
		];

		saveBlockedUsers(updated);
		showNotification(`Blocked @${uname}`, 'success');

		showConfirmBlockModal = false;
		selectedUserToBlock = null;
		blockSearchInput = '';
	}

	async function handleSaveProfileCredentials() {
		if (!editUsername.trim() || !editEmail.trim()) {
			showNotification('Username and Email are required', 'error');
			return;
		}

		if (editNewPassword && editNewPassword.length < 6) {
			showNotification('Password must be at least 6 characters', 'error');
			return;
		}

		if (editNewPassword && editNewPassword !== editConfirmPassword) {
			showNotification('New passwords do not match', 'error');
			return;
		}

		playClickSound();
		isSavingProfile = true;
		try {
			const res = await fetch(API_ENDPOINTS.updateProfile, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: currentUser.id,
					username: editUsername.trim(),
					email: editEmail.trim(),
					new_password: editNewPassword.trim() || undefined
				})
			});

			const data = await res.json();
			if (data.success && data.user) {
				const updatedStored = { ...currentUser, ...data.user };
				localStorage.setItem('chronomuse_user', JSON.stringify(updatedStored));
				currentUser = updatedStored;

				editNewPassword = '';
				editConfirmPassword = '';

				if (typeof window !== 'undefined') {
					window.dispatchEvent(new Event('chronomuse_auth_change'));
				}
				showNotification('Account credentials saved successfully!');
			} else {
				showNotification(data.error || 'Failed to save credentials', 'error');
			}
		} catch (err) {
			showNotification('Error saving account settings', 'error');
		} finally {
			isSavingProfile = false;
		}
	}

	function handleLogout() {
		try {
			supabase.removeAllChannels();
		} catch (e) {}

		// Preserve user active status setting before wiping local storage
		const savedActiveStatus = currentUser?.id ? localStorage.getItem(`chronomuse_active_status_${currentUser.id}`) : null;
		const savedPrivateStatus = currentUser?.id ? localStorage.getItem(`chronomuse_private_${currentUser.id}`) : null;

		localStorage.clear();
		sessionStorage.clear();

		if (currentUser?.id) {
			if (savedActiveStatus !== null) localStorage.setItem(`chronomuse_active_status_${currentUser.id}`, savedActiveStatus);
			if (savedPrivateStatus !== null) localStorage.setItem(`chronomuse_private_${currentUser.id}`, savedPrivateStatus);
		}

		if (typeof window !== 'undefined') {
			window.dispatchEvent(new Event('chronomuse_auth_change'));
		}
		goto('/');
	}

	async function handleInstallAppFromSettings() {
		playClickSound();
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
		const stored = localStorage.getItem('chronomuse_user');
		if (!stored) {
			goto('/');
			return;
		}
		currentUser = JSON.parse(stored);
		editUsername = currentUser.username || '';
		editEmail = currentUser.email || '';

		if (currentUser?.id) {
			const activeSaved = localStorage.getItem(`chronomuse_active_status_${currentUser.id}`);
			activeStatusEnabled = activeSaved !== 'false';
			const privateSaved = localStorage.getItem(`chronomuse_private_${currentUser.id}`);
			privateAccountEnabled = privateSaved === 'true';
		}
		loadBlockedUsers();

		initPWAInstall();
		const unsubPwa = subscribePWAStatus((/** @type {any} */ st) => {
			pwaStatus = st;
		});
		return () => unsubPwa();
	});
</script>

<svelte:head>
	<title>Account Settings - ChronoMuse</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-pink-100 via-pink-200 to-pink-300 flex flex-col font-sans animate-fade-in">
	<!-- Top Navigation Bar -->
	<nav class="bg-white/85 backdrop-blur-md border-b-2 border-pink-300 shadow-lg sticky top-0 z-50 animate-slide-down">
		<div class="container mx-auto px-4 py-3 flex items-center justify-between">
			<div class="flex items-center space-x-3 min-w-0">
				<!-- Hamburger Menu Button -->
				<button
					onclick={toggleSidebar}
					class="p-1.5 sm:p-2 text-pink-500 hover:bg-pink-100 rounded-lg transition-colors flex-shrink-0 active:scale-95 cursor-pointer"
					aria-label="Toggle menu"
					title="Toggle menu"
				>
					{#if sidebarOpen}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
						</svg>
					{/if}
				</button>
				
				<div class="flex items-center space-x-2.5 cursor-pointer" onclick={() => goto('/dashboard')}>
					<img src="/logo.png" alt="ChronoMuse" class="w-9 h-9 sm:w-10 sm:h-10 rounded-md object-contain flex-shrink-0" />
					<span class="text-base sm:text-lg font-bold text-pink-500 truncate">ChronoMuse</span>
				</div>
			</div>

			<div class="flex items-center space-x-2 sm:space-x-4 flex-shrink-0 ml-2">
				<button
					onclick={() => goto('/profile')}
					class="hidden md:block text-pink-700 hover:text-pink-900 transition-colors font-medium cursor-pointer text-left active:scale-95"
					title="View Profile"
				>
					<span class="text-sm">Welcome, <strong>{currentUser?.username}</strong></span>
				</button>
				<!-- Soft Pink Glassmorphic Gear Settings Icon Button -->
				<button
					onclick={() => goto('/settings')}
					class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-pink-100 hover:bg-pink-200 border border-pink-300 text-pink-600 shadow-2xs flex items-center justify-center transition-all cursor-pointer active:scale-95 flex-shrink-0"
					title="Settings"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
				</button>
			</div>
		</div>
	</nav>

	<!-- Sidebar Component -->
	<Sidebar bind:isOpen={sidebarOpen} on:logout={handleLogout} />

	<!-- Main Settings Container -->
	<main class="flex-grow container mx-auto px-4 py-6 sm:py-8 max-w-2xl space-y-4">
		<!-- Page Title Banner -->
		<div class="flex items-center space-x-3.5 pb-3 border-b-2 border-pink-300">
			<div class="w-10 h-10 rounded-xl bg-pink-100 text-pink-600 border border-pink-200 flex items-center justify-center flex-shrink-0 shadow-2xs">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
			</div>
			<div>
				<h1 class="text-xl sm:text-2xl font-black text-pink-950">Settings & Preferences</h1>
				<p class="text-xs text-pink-600 font-medium">Click any setting item below to view options. Opening one automatically closes the previous card.</p>
			</div>
		</div>

		<!-- SINGLE-EXPANSION ACCORDION LIST -->
		<div class="space-y-4">
			
			<!-- ITEM 0: INSTALL CHRONOMUSE APP -->
			<div class="bg-gradient-to-r from-pink-500/10 via-white to-pink-500/10 rounded-2xl border-2 border-pink-400 shadow-md overflow-hidden transition-all duration-300">
				<!-- List Header Row (Clickable) -->
				<button
					type="button"
					onclick={() => toggleTab('install')}
					class="w-full p-3.5 sm:p-4 flex items-center justify-between text-left hover:bg-pink-100/50 transition-colors cursor-pointer"
				>
					<div class="flex items-center space-x-3 min-w-0 pr-2">
						<div class="w-9 h-9 rounded-xl bg-pink-500 text-white border border-pink-600 flex items-center justify-center flex-shrink-0 shadow-sm">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
							</svg>
						</div>
						<div class="min-w-0">
							<h3 class="text-xs sm:text-sm font-bold text-pink-950 truncate flex items-center gap-1.5">
								<span>Install ChronoMuse App</span>
							</h3>
							<p class="text-[11px] text-pink-600 font-medium truncate">Download app to home screen for native mobile experience</p>
						</div>
					</div>

					<div class="flex items-center space-x-2 flex-shrink-0">
						<span class="text-xs font-bold px-2.5 py-1 rounded-lg border {pwaStatus.isStandalone || pwaStatus.isAppInstalled ? 'bg-green-100 text-green-700 border-green-300' : 'bg-pink-500 text-white border-pink-600'}">
							{pwaStatus.isStandalone || pwaStatus.isAppInstalled ? 'Open App' : 'Install App'}
						</span>
						<div class="w-7 h-7 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center transition-transform duration-300 {activeTab === 'install' ? 'rotate-180 bg-pink-500 text-white' : ''}">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
							</svg>
						</div>
					</div>
				</button>

				<!-- Expanded Content Section -->
				{#if activeTab === 'install'}
					<div class="px-5 pb-6 sm:px-6 space-y-4 border-t border-pink-200 pt-4 bg-pink-50/40">
						<div class="max-w-xl space-y-3">
							<div class="flex items-start space-x-3 bg-white p-3.5 rounded-xl border border-pink-200 shadow-2xs">
								<img src="/logo.png" alt="ChronoMuse" class="w-12 h-12 rounded-xl object-contain border border-pink-200 shadow-sm flex-shrink-0" />
								<div>
									<h4 class="text-xs sm:text-sm font-bold text-pink-900">ChronoMuse Mobile App</h4>
									<p class="text-xs text-pink-600 font-medium leading-relaxed">
										Install ChronoMuse on your smartphone or PC. Get faster load times, fullscreen calendar mode, and quick home screen access!
									</p>
								</div>
							</div>

							{#if pwaStatus.isStandalone || pwaStatus.isAppInstalled}
								<button
									type="button"
									onclick={handleInstallAppFromSettings}
									class="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-xs sm:text-sm rounded-xl hover:from-green-600 hover:to-emerald-700 shadow-md active:scale-95 transition-all flex items-center justify-center space-x-2"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
										<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
									</svg>
									<span>Open ChronoMuse App</span>
								</button>
							{:else}
								<button
									type="button"
									onclick={handleInstallAppFromSettings}
									class="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-pink-500 to-pink-600 text-white font-bold text-xs sm:text-sm rounded-xl hover:from-pink-600 hover:to-pink-700 shadow-md active:scale-95 transition-all flex items-center justify-center space-x-2"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
										<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
									</svg>
									<span>Install ChronoMuse App</span>
								</button>
							{/if}

							{#if installGuideMessage}
								<div class="p-3 bg-white rounded-xl border border-pink-300 text-xs font-semibold text-pink-800 text-center animate-fade-in shadow-2xs">
									{installGuideMessage}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<!-- ITEM 1: PRIVACY & ONLINE ACTIVE STATUS -->
			<div class="bg-white rounded-2xl border-2 border-pink-300 shadow-md overflow-hidden transition-all duration-300">
				<!-- List Header Row (Clickable) -->
				<button
					type="button"
					onclick={() => toggleTab('privacy')}
					class="w-full p-3.5 sm:p-4 flex items-center justify-between text-left hover:bg-pink-50/60 transition-colors cursor-pointer"
				>
					<div class="flex items-center space-x-3 min-w-0 pr-2">
						<div class="w-9 h-9 rounded-xl bg-pink-100 text-pink-600 border border-pink-200 flex items-center justify-center flex-shrink-0 shadow-2xs">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
							</svg>
						</div>
						<div class="min-w-0">
							<h3 class="text-xs sm:text-sm font-bold text-pink-950 truncate">Privacy & Active Online Status</h3>
							<p class="text-[11px] text-pink-600 font-medium truncate">Hide/show active online status and account privacy controls</p>
						</div>
					</div>
					
					<div class="flex items-center space-x-2 flex-shrink-0">
						<span class="text-xs font-bold px-2.5 py-1 rounded-lg border {activeStatusEnabled ? 'bg-pink-100 text-pink-700 border-pink-300' : 'bg-gray-100 text-gray-600 border-gray-300'}">
							{activeStatusEnabled ? 'Active ON' : 'Active OFF'}
						</span>
						<div class="w-7 h-7 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center transition-transform duration-300 {activeTab === 'privacy' ? 'rotate-180 bg-pink-500 text-white' : ''}">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
							</svg>
						</div>
					</div>
				</button>

				<!-- Expanded Content Section -->
				{#if activeTab === 'privacy'}
					<div class="px-5 pb-6 sm:px-6 space-y-4 border-t border-pink-100 pt-4 bg-pink-50/20">
						
						<!-- Active Status Toggle Card -->
						<div class="p-4 sm:p-5 bg-white border-2 border-pink-200/90 rounded-2xl flex items-center justify-between gap-4 shadow-2xs">
							<div class="space-y-1 min-w-0 flex-1">
								<div class="flex items-center space-x-2">
									<span class="w-3 h-3 rounded-full {activeStatusEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-pink-300'} flex-shrink-0"></span>
									<h4 class="text-xs sm:text-sm font-extrabold text-pink-950">Show Active / Online Status</h4>
								</div>
								<p class="text-xs text-pink-600 font-medium leading-relaxed">
									When turned OFF, other users cannot see when you are online or your active status indicator.
								</p>
							</div>

							<div class="flex items-center space-x-2.5 flex-shrink-0 pl-2">
								<label class="relative inline-flex items-center cursor-pointer select-none">
									<input
										type="checkbox"
										checked={activeStatusEnabled}
										onchange={handleActiveStatusToggle}
										class="sr-only peer"
									/>
									<div class="w-14 h-7 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-7 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-pink-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-md peer-checked:bg-gradient-to-r peer-checked:from-pink-500 peer-checked:to-rose-600 shadow-inner"></div>
									<span class="ml-2.5 text-xs font-black uppercase tracking-wider {activeStatusEnabled ? 'text-pink-600' : 'text-gray-400'}">
										{activeStatusEnabled ? 'ON' : 'OFF'}
									</span>
								</label>
							</div>
						</div>

						<!-- Private Profile Protection Toggle Card -->
						<div class="p-4 sm:p-5 bg-white border-2 border-pink-200/90 rounded-2xl flex items-center justify-between gap-4 shadow-2xs">
							<div class="space-y-1 min-w-0 flex-1">
								<h4 class="text-xs sm:text-sm font-extrabold text-pink-950">Private Account Protection</h4>
								<p class="text-xs text-pink-600 font-medium leading-relaxed">
									Require friend request approval before users can view your full profile and activities.
								</p>
							</div>

							<div class="flex items-center space-x-2.5 flex-shrink-0 pl-2">
								<label class="relative inline-flex items-center cursor-pointer select-none">
									<input
										type="checkbox"
										checked={privateAccountEnabled}
										onchange={handlePrivateAccountToggle}
										class="sr-only peer"
									/>
									<div class="w-14 h-7 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-7 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-pink-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-md peer-checked:bg-gradient-to-r peer-checked:from-pink-500 peer-checked:to-rose-600 shadow-inner"></div>
									<span class="ml-2.5 text-xs font-black uppercase tracking-wider {privateAccountEnabled ? 'text-pink-600' : 'text-gray-400'}">
										{privateAccountEnabled ? 'ON' : 'OFF'}
									</span>
								</label>
							</div>
						</div>

					</div>
				{/if}
			</div>

			<!-- ITEM 2: SOUND & TOUCH FEEDBACK -->
			<div class="bg-white rounded-2xl border-2 border-pink-300 shadow-md overflow-hidden transition-all duration-300">
				<!-- List Header Row (Clickable) -->
				<button
					type="button"
					onclick={() => toggleTab('audio')}
					class="w-full p-3.5 sm:p-4 flex items-center justify-between text-left hover:bg-pink-50/60 transition-colors cursor-pointer"
				>
					<div class="flex items-center space-x-3 min-w-0 pr-2">
						<div class="w-9 h-9 rounded-xl bg-pink-100 text-pink-600 border border-pink-200 flex items-center justify-center flex-shrink-0 shadow-2xs">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.287a5.25 5.25 0 010 7.426M12 5.25v13.5m0-13.5L7.5 9H4.5A1.5 1.5 0 003 10.5v3A1.5 1.5 0 004.5 15h3l4.5 3.75v-13.5z" />
							</svg>
						</div>
						<div class="min-w-0">
							<h3 class="text-xs sm:text-sm font-bold text-pink-950 truncate">Sound & Touch Feedback</h3>
							<p class="text-[11px] text-pink-600 font-medium truncate">Control touch sound effects and interactive audio</p>
						</div>
					</div>

					<div class="flex items-center space-x-2 flex-shrink-0">
						<span class="text-xs font-bold px-2.5 py-1 rounded-lg border {soundEffectsEnabled ? 'bg-pink-100 text-pink-700 border-pink-300' : 'bg-gray-100 text-gray-600 border-gray-300'}">
							{soundEffectsEnabled ? 'Sound ON' : 'Sound OFF'}
						</span>
						<div class="w-7 h-7 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center transition-transform duration-300 {activeTab === 'audio' ? 'rotate-180 bg-pink-500 text-white' : ''}">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
							</svg>
						</div>
					</div>
				</button>

				<!-- Expanded Content Section -->
				{#if activeTab === 'audio'}
					<div class="px-5 pb-6 sm:px-6 space-y-4 border-t border-pink-100 pt-4 bg-pink-50/20">
						
						<!-- Touch Sound Toggle Card -->
						<div class="p-4 sm:p-5 bg-white border-2 border-pink-200/90 rounded-2xl flex items-center justify-between gap-4 shadow-2xs">
							<div class="space-y-1 min-w-0 flex-1">
								<h4 class="text-xs sm:text-sm font-extrabold text-pink-950">Touch & Interaction Sound Effects</h4>
								<p class="text-xs text-pink-600 font-medium leading-relaxed">
									Play audio feedback sounds whenever you touch or tap buttons and UI components.
								</p>
							</div>

							<div class="flex items-center space-x-2.5 flex-shrink-0 pl-2">
								<label class="relative inline-flex items-center cursor-pointer select-none">
									<input
										type="checkbox"
										checked={soundEffectsEnabled}
										onchange={handleSoundToggle}
										class="sr-only peer"
									/>
									<div class="w-14 h-7 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-7 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-pink-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-md peer-checked:bg-gradient-to-r peer-checked:from-pink-500 peer-checked:to-rose-600 shadow-inner"></div>
									<span class="ml-2.5 text-xs font-black uppercase tracking-wider {soundEffectsEnabled ? 'text-pink-600' : 'text-gray-400'}">
										{soundEffectsEnabled ? 'ON' : 'OFF'}
									</span>
								</label>
							</div>
						</div>

					</div>
				{/if}
			</div>

			<!-- ITEM 3: BLOCKED ACCOUNTS & USERS -->
			<div class="bg-white rounded-2xl border-2 border-pink-300 shadow-md overflow-hidden transition-all duration-300">
				<!-- List Header Row (Clickable) -->
				<button
					type="button"
					onclick={() => toggleTab('blocked')}
					class="w-full p-3.5 sm:p-4 flex items-center justify-between text-left hover:bg-pink-50/60 transition-colors cursor-pointer"
				>
					<div class="flex items-center space-x-3 min-w-0 pr-2">
						<div class="w-9 h-9 rounded-xl bg-pink-100 text-pink-600 border border-pink-200 flex items-center justify-center flex-shrink-0 shadow-2xs">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
							</svg>
						</div>
						<div class="min-w-0">
							<h3 class="text-xs sm:text-sm font-bold text-pink-950 truncate">Blocked Accounts Management</h3>
							<p class="text-[11px] text-pink-600 font-medium truncate">Search and select users to block or toggle unblock status</p>
						</div>
					</div>

					<div class="flex items-center space-x-2 flex-shrink-0">
						<span class="text-xs font-bold px-2.5 py-1 rounded-lg border bg-pink-100 text-pink-700 border-pink-300">
							{blockedUsers.length} Blocked
						</span>
						<div class="w-7 h-7 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center transition-transform duration-300 {activeTab === 'blocked' ? 'rotate-180 bg-pink-500 text-white' : ''}">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
							</svg>
						</div>
					</div>
				</button>

				<!-- Expanded Content Section -->
				{#if activeTab === 'blocked'}
					<div class="px-5 pb-6 sm:px-6 space-y-4 border-t border-pink-100 pt-4 bg-pink-50/20">
						
						<!-- Live Search & Select User Bar -->
						<div class="relative space-y-2">
							<label class="block text-xs font-extrabold text-pink-950">Search User to Block</label>
							
							<div class="relative">
								<input
									type="text"
									value={blockSearchInput}
									oninput={handleBlockSearchInput}
									placeholder="Type username or name to search..."
									class="w-full pl-9 pr-10 py-2.5 bg-white border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-semibold text-pink-950 focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all shadow-2xs"
								/>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-400 absolute left-3 top-3">
									<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
								</svg>

								{#if isSearchingUsers}
									<div class="absolute right-3 top-3 w-4 h-4 border-2 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
								{/if}
							</div>

							<!-- Autocomplete Search Dropdown List -->
							{#if searchResults.length > 0}
								<div class="absolute left-0 right-0 top-full mt-1.5 bg-white border-2 border-pink-300 rounded-2xl shadow-xl z-30 max-h-60 overflow-y-auto divide-y divide-pink-100 animate-fade-in">
									{#each searchResults as sUser}
										<button
											type="button"
											onclick={() => selectUserForBlocking(sUser)}
											class="w-full p-3 flex items-center justify-between hover:bg-pink-50 transition-colors text-left group cursor-pointer"
										>
											<div class="flex items-center space-x-3 min-w-0">
												<div class="w-9 h-9 rounded-full bg-gradient-to-tr from-pink-400 to-rose-500 text-white flex items-center justify-center font-bold text-xs shadow-2xs overflow-hidden flex-shrink-0">
													{#if sUser.avatar_url}
														<img src={sUser.avatar_url} alt={sUser.username} class="w-full h-full object-cover" />
													{:else}
														{sUser.username?.charAt(0).toUpperCase()}
													{/if}
												</div>
												<div class="min-w-0 pr-2">
													<p class="text-xs sm:text-sm font-bold text-pink-950 group-hover:text-rose-600 truncate">@{sUser.username}</p>
													<p class="text-[11px] text-pink-500 truncate">{sUser.email}</p>
												</div>
											</div>

											<span class="px-3 py-1 bg-rose-50 border border-rose-200 text-rose-600 font-bold text-xs rounded-xl group-hover:bg-rose-600 group-hover:text-white transition-all shadow-2xs flex-shrink-0">
												Select to Block
											</span>
										</button>
									{/each}
								</div>
							{:else if blockSearchInput.trim() && !isSearchingUsers}
								<div class="p-3.5 bg-white border border-pink-200 rounded-xl text-xs font-semibold text-pink-600 text-center">
									No users found matching "{blockSearchInput}".
								</div>
							{/if}
						</div>

						<!-- Blocked List -->
						{#if blockedUsers.length === 0}
							<div class="p-6 text-center border-2 border-dashed border-pink-200 rounded-2xl bg-white">
								<p class="text-xs font-semibold text-pink-600">No blocked accounts found.</p>
							</div>
						{:else}
							<div class="space-y-3 pt-2">
								<h4 class="text-xs font-extrabold text-pink-950">Currently Blocked Accounts ({blockedUsers.length})</h4>
								{#each blockedUsers as bUser}
									<div class="p-4 bg-white border-2 border-pink-200/90 rounded-2xl flex items-center justify-between gap-4 shadow-2xs">
										<div class="flex items-center space-x-3 min-w-0 flex-1">
											<div class="w-9 h-9 rounded-full bg-gradient-to-tr from-pink-400 to-rose-500 text-white flex items-center justify-center font-bold text-xs shadow-2xs overflow-hidden flex-shrink-0">
												{#if bUser.avatar_url}
													<img src={bUser.avatar_url} alt={bUser.username} class="w-full h-full object-cover" />
												{:else}
													{bUser.username?.charAt(0).toUpperCase()}
												{/if}
											</div>
											<div class="min-w-0 pr-1">
												<p class="text-xs sm:text-sm font-bold text-pink-950 truncate">@{bUser.username}</p>
												<p class="text-[11px] text-pink-500 font-medium truncate">{bUser.email || 'Blocked Account'}</p>
											</div>
										</div>

										<!-- Individual Block/Unblock Toggle Switch -->
										<div class="flex items-center space-x-2.5 flex-shrink-0 pl-2">
											<label class="relative inline-flex items-center cursor-pointer select-none">
												<input
													type="checkbox"
													checked={true}
													onchange={(e) => handleUserBlockToggle(bUser, e)}
													class="sr-only peer"
												/>
												<div class="w-14 h-7 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-7 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-pink-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-md peer-checked:bg-rose-600 shadow-inner"></div>
												<span class="ml-2.5 text-xs font-black uppercase tracking-wider text-rose-600">
													BLOCKED
												</span>
											</label>
										</div>
									</div>
								{/each}
							</div>
						{/if}

					</div>
				{/if}
			</div>

			<!-- ITEM 4: PASSWORDS & EMAIL SECURITY -->
			<div class="bg-white rounded-2xl border-2 border-pink-300 shadow-md overflow-hidden transition-all duration-300">
				<!-- List Header Row (Clickable) -->
				<button
					type="button"
					onclick={() => toggleTab('security')}
					class="w-full p-3.5 sm:p-4 flex items-center justify-between text-left hover:bg-pink-50/60 transition-colors cursor-pointer"
				>
					<div class="flex items-center space-x-3 min-w-0 pr-2">
						<div class="w-9 h-9 rounded-xl bg-pink-100 text-pink-600 border border-pink-200 flex items-center justify-center flex-shrink-0 shadow-2xs">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
							</svg>
						</div>
						<div class="min-w-0">
							<h3 class="text-xs sm:text-sm font-bold text-pink-950 truncate">Password & Email Credentials</h3>
							<p class="text-[11px] text-pink-600 font-medium truncate">Update username, email address, and security password</p>
						</div>
					</div>

					<div class="flex items-center space-x-2 flex-shrink-0">
						<span class="text-xs font-bold px-2.5 py-1 rounded-lg border bg-pink-100 text-pink-700 border-pink-300">
							Credentials
						</span>
						<div class="w-7 h-7 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center transition-transform duration-300 {activeTab === 'security' ? 'rotate-180 bg-pink-500 text-white' : ''}">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
							</svg>
						</div>
					</div>
				</button>

				<!-- Expanded Content Section -->
				{#if activeTab === 'security'}
					<div class="px-5 pb-6 sm:px-6 space-y-4 border-t border-pink-100 pt-4 bg-pink-50/20">
						
						<form onsubmit={(e) => { e.preventDefault(); handleSaveProfileCredentials(); }} class="space-y-4 max-w-xl">
							<div>
								<label class="block text-xs font-bold text-pink-800 mb-1">Username</label>
								<input
									type="text"
									bind:value={editUsername}
									class="w-full px-3.5 py-2 bg-white border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-semibold text-pink-950 focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all"
									placeholder="Your username"
									required
								/>
							</div>

							<div>
								<label class="block text-xs font-bold text-pink-800 mb-1">Email Address</label>
								<input
									type="email"
									bind:value={editEmail}
									class="w-full px-3.5 py-2 bg-white border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-semibold text-pink-950 focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all"
									placeholder="Your email address"
									required
								/>
							</div>

							<div class="pt-2 space-y-3">
								<h4 class="text-xs font-bold text-pink-900">Change Password (Leave blank to keep current)</h4>

								<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
									<div>
										<label class="block text-[11px] font-semibold text-pink-700 mb-1">New Password</label>
										<input
											type="password"
											bind:value={editNewPassword}
											placeholder="At least 6 characters"
											class="w-full px-3 py-2 bg-white border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-medium text-pink-950 focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all"
										/>
									</div>

									<div>
										<label class="block text-[11px] font-semibold text-pink-700 mb-1">Confirm New Password</label>
										<input
											type="password"
											bind:value={editConfirmPassword}
											placeholder="Re-type new password"
											class="w-full px-3 py-2 bg-white border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-medium text-pink-950 focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all"
										/>
									</div>
								</div>
							</div>

							<div class="pt-3 flex items-center justify-between gap-3">
								<button
									type="submit"
									disabled={isSavingProfile}
									class="px-6 py-2.5 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md transition-all flex items-center space-x-2 active:scale-95 disabled:opacity-50 cursor-pointer"
								>
									{#if isSavingProfile}
										<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
										<span>Saving...</span>
									{:else}
										<span>Save Credentials</span>
									{/if}
								</button>

								<button
									type="button"
									onclick={() => showLogoutModal = true}
									class="px-4 py-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer border border-rose-200"
								>
									Log Out
								</button>
							</div>
						</form>

					</div>
				{/if}
			</div>

		</div>
	</main>

	<!-- Confirm Block User Selection Modal -->
	{#if showConfirmBlockModal && selectedUserToBlock}
		<div
			class="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
			onclick={(e) => { if (e.target === e.currentTarget) showConfirmBlockModal = false; }}
		>
			<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center relative overflow-hidden">
				<div class="w-16 h-16 rounded-full bg-gradient-to-tr from-pink-400 to-rose-500 text-white flex items-center justify-center font-extrabold text-xl shadow-md overflow-hidden mx-auto mb-3">
					{#if selectedUserToBlock.avatar_url}
						<img src={selectedUserToBlock.avatar_url} alt={selectedUserToBlock.username} class="w-full h-full object-cover" />
					{:else}
						{(selectedUserToBlock.username || selectedUserToBlock.email)?.charAt(0).toUpperCase()}
					{/if}
				</div>

				<h3 class="text-base sm:text-lg font-black text-pink-950 mb-0.5">
					Block @{selectedUserToBlock.username || selectedUserToBlock.email?.split('@')[0]}?
				</h3>
				<p class="text-xs text-pink-500 font-medium mb-4">{selectedUserToBlock.email}</p>

				<p class="text-xs text-pink-600 mb-6 font-medium bg-pink-50 p-3 rounded-xl border border-pink-200">
					Are you sure you want to block this account? They will no longer be able to message you or view your profile.
				</p>

				<div class="flex items-center space-x-3">
					<button
						type="button"
						onclick={() => { showConfirmBlockModal = false; selectedUserToBlock = null; }}
						class="w-1/2 py-2.5 bg-pink-100 text-pink-700 hover:bg-pink-200 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={confirmBlockSelectedUser}
						class="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md active:scale-95 cursor-pointer"
					>
						Confirm Block
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Logout Confirmation Modal -->
	{#if showLogoutModal}
		<div
			class="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
			onclick={(e) => { if (e.target === e.currentTarget) showLogoutModal = false; }}
		>
			<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center relative overflow-hidden">
				<h3 class="text-base sm:text-lg font-black text-pink-950 mb-1.5">Log Out of ChronoMuse?</h3>
				<p class="text-xs text-pink-600 mb-6 font-medium">
					Are you sure you want to log out of your account?
				</p>

				<div class="flex items-center space-x-3">
					<button
						type="button"
						onclick={() => showLogoutModal = false}
						class="w-1/2 py-2.5 bg-pink-100 text-pink-700 hover:bg-pink-200 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={handleLogout}
						class="w-1/2 py-2.5 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md active:scale-95 cursor-pointer"
					>
						Log Out
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Toast Notification Banner -->
	{#if showToast}
		<div class="fixed bottom-5 right-5 z-50 animate-bounce">
			<div class="px-4 py-3 rounded-2xl shadow-xl border-2 flex items-center space-x-2.5 {toastType === 'error' ? 'bg-rose-500 border-rose-600 text-white' : 'bg-emerald-600 border-emerald-700 text-white'}">
				<span class="text-xs sm:text-sm font-bold">{toastMessage}</span>
			</div>
		</div>
	{/if}

	<!-- Footer -->
	<footer class="bg-white/85 backdrop-blur-md border-t-2 border-pink-300 mt-auto py-3 text-center">
		<p class="text-[11px] sm:text-xs text-pink-700 font-medium">
			© 2026 CHRONOMUSE. All rights reserved. Developed by Merlye Deyto
		</p>
	</footer>
</div>
