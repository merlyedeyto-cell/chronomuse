<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { isSoundEnabled, setSoundEnabled, playClickSound } from '$lib/soundEffects.js';
	import { supabase } from '$lib/supabaseClient.js';
	import AppHeader from '$lib/AppHeader.svelte';
	import AppFooter from '$lib/AppFooter.svelte';
	import { initPWAInstall, subscribePWAStatus, promptPWAInstall, openInstalledApp } from '$lib/pwaInstall.js';

	// Modular Settings Components
	import SettingsUserProfileCard from '$lib/settings/SettingsUserProfileCard.svelte';
	import SettingsNavMenu from '$lib/settings/SettingsNavMenu.svelte';
	import PrivacyTab from '$lib/settings/PrivacyTab.svelte';
	import AudioTab from '$lib/settings/AudioTab.svelte';
	import BlockedUsersTab from '$lib/settings/BlockedUsersTab.svelte';
	import SecurityTab from '$lib/settings/SecurityTab.svelte';
	import InstallTab from '$lib/settings/InstallTab.svelte';

	import {
		Smartphone, ChevronDown, Lock, Volume2, Ban, KeyRound, LogOut
	} from 'lucide-svelte';

	let currentUser = $state(typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('chronomuse_user') || 'null') : null);

	// Active tab state: 'privacy' by default on desktop, expandable on mobile
	let activeTab = $state('privacy');

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

	function handleSelectTab(/** @type {string} */ tabId) {
		playClickSound();
		activeTab = tabId;
	}

	function toggleMobileAccordion(/** @type {string} */ tabId) {
		playClickSound();
		if (activeTab === tabId) {
			activeTab = '';
		} else {
			activeTab = tabId;
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

	async function handlePrivateAccountToggle(/** @type {any} */ e) {
		const enabled = e.target.checked;
		privateAccountEnabled = enabled;
		if (currentUser?.id) {
			try {
				localStorage.setItem(`chronomuse_private_${currentUser.id}`, enabled ? 'true' : 'false');
			} catch (err) {}

			try {
				await fetch(API_ENDPOINTS.updateProfile, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						user_id: currentUser.id,
						is_private: enabled
					})
				});
			} catch (err) {}

			try {
				const updatedUser = { ...currentUser, is_private: enabled };
				localStorage.setItem('chronomuse_user', JSON.stringify(updatedUser));
				currentUser = updatedUser;
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new Event('chronomuse_auth_change'));
				}
			} catch (err) {}
		}
		playClickSound();
		showNotification(enabled ? 'Private Account ON (Mood summary is hidden from others)' : 'Private Account OFF (Mood summary is visible)', 'success');
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

	// Dynamic tab header info derived for desktop canvas
	const activeTabHeader = $derived.by(() => {
		switch (activeTab) {
			case 'privacy':
				return {
					title: 'Privacy & Online Status',
					subtitle: 'Configure your active visibility and private account protection.',
					icon: Lock
				};
			case 'audio':
				return {
					title: 'Sound & Touch Feedback',
					subtitle: 'Customize audio effects and sound feedback on user interactions.',
					icon: Volume2
				};
			case 'blocked':
				return {
					title: 'Blocked Accounts',
					subtitle: 'Manage blocked users, prevent incoming messages and profile views.',
					icon: Ban
				};
			case 'security':
				return {
					title: 'Password & Credentials',
					subtitle: 'Update your username, email address, or set a new account password.',
					icon: KeyRound
				};
			case 'install':
				return {
					title: 'ChronoMuse App Installation',
					subtitle: 'Download ChronoMuse as a native Progressive Web App for instant access.',
					icon: Smartphone
				};
			default:
				return {
					title: 'Settings & Preferences',
					subtitle: 'Manage your account settings and preferences.',
					icon: Lock
				};
		}
	});

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
	<title>Settings & Preferences - ChronoMuse</title>
</svelte:head>

<div class="min-h-screen bg-[#fff0f5] flex flex-col font-sans animate-fade-in text-pink-950">
	<!-- Top Navigation -->
	<AppHeader />

	<!-- Main Settings Container -->
	<main class="flex-grow container mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8 pb-24 max-w-6xl">
		
		<!-- DESKTOP VIEW: 2-Column Sidebar + Detail Canvas (Hidden on mobile) -->
		<div class="hidden md:grid md:grid-cols-12 md:gap-6 lg:gap-8 items-start">
			
			<!-- LEFT SIDEBAR COLUMN (Navigation & Profile) -->
			<div class="md:col-span-4 lg:col-span-4 xl:col-span-4 space-y-4 sticky top-20">
				<!-- User Mini Profile Card -->
				<SettingsUserProfileCard
					{currentUser}
					{activeStatusEnabled}
				/>

				<!-- Vertical Navigation Menu -->
				<SettingsNavMenu
					{activeTab}
					onSelectTab={handleSelectTab}
					{activeStatusEnabled}
					{soundEffectsEnabled}
					blockedCount={blockedUsers.length}
					{pwaStatus}
					onOpenLogoutModal={() => showLogoutModal = true}
				/>
			</div>

			<!-- RIGHT DETAIL CANVAS (Active Setting Card) -->
			<div class="md:col-span-8 lg:col-span-8 xl:col-span-8 space-y-4">
				<!-- Canvas Title Card -->
				<div class="bg-white rounded-2xl p-5 shadow-xs border border-pink-100/90 flex items-center justify-between gap-4">
					<div class="flex items-center space-x-3.5 min-w-0">
						<div class="w-10 h-10 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center text-[#f43f8e] flex-shrink-0 shadow-2xs">
							<activeTabHeader.icon class="w-5 h-5" />
						</div>
						<div class="min-w-0">
							<h2 class="text-base sm:text-lg font-black text-pink-950 tracking-tight truncate">
								{activeTabHeader.title}
							</h2>
							<p class="text-xs text-pink-400 font-medium truncate mt-0.5">
								{activeTabHeader.subtitle}
							</p>
						</div>
					</div>

					<span class="text-[10px] font-black px-3 py-1 rounded-full bg-pink-50 text-[#f43f8e] border border-pink-200 uppercase tracking-wider flex-shrink-0">
						Settings
					</span>
				</div>

				<!-- Active Content Panel Component -->
				<div class="bg-white/80 backdrop-blur-xs rounded-2xl p-5 sm:p-6 shadow-xs border border-pink-100/90 min-h-[420px]">
					{#if activeTab === 'privacy'}
						<PrivacyTab
							{activeStatusEnabled}
							{privateAccountEnabled}
							onToggleActiveStatus={handleActiveStatusToggle}
							onTogglePrivateAccount={handlePrivateAccountToggle}
						/>
					{:else if activeTab === 'audio'}
						<AudioTab
							{soundEffectsEnabled}
							onToggleSound={handleSoundToggle}
						/>
					{:else if activeTab === 'blocked'}
						<BlockedUsersTab
							{blockSearchInput}
							onBlockSearchInput={handleBlockSearchInput}
							{searchResults}
							{isSearchingUsers}
							onSelectUserToBlock={selectUserForBlocking}
							{blockedUsers}
							onUserBlockToggle={handleUserBlockToggle}
						/>
					{:else if activeTab === 'security'}
						<SecurityTab
							bind:editUsername
							bind:editEmail
							bind:editNewPassword
							bind:editConfirmPassword
							{isSavingProfile}
							onSaveCredentials={handleSaveProfileCredentials}
							onOpenLogoutModal={() => showLogoutModal = true}
						/>
					{:else if activeTab === 'install'}
						<InstallTab
							{pwaStatus}
							{installGuideMessage}
							onInstallApp={handleInstallAppFromSettings}
						/>
					{/if}
				</div>
			</div>

		</div>

		<!-- MOBILE VIEW: Compact Accordion List (Visible on mobile only < md) -->
		<div class="md:hidden space-y-3.5">
			<!-- Top Profile Card -->
			<SettingsUserProfileCard
				{currentUser}
				{activeStatusEnabled}
			/>

			<!-- Accordion Items List -->
			<div class="space-y-2.5">
				
				<!-- ITEM: PRIVACY -->
				<div class="bg-white rounded-2xl shadow-xs border border-pink-100/90 overflow-hidden transition-all">
					<button
						type="button"
						onclick={() => toggleMobileAccordion('privacy')}
						class="w-full p-3.5 flex items-center justify-between text-left hover:bg-pink-50/40 transition-colors cursor-pointer"
					>
						<div class="flex items-center space-x-3 min-w-0 pr-2">
							<div class="w-9 h-9 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e] shadow-xs">
								<Lock class="w-4 h-4" />
							</div>
							<div class="min-w-0">
								<h3 class="text-xs sm:text-sm font-extrabold text-pink-950 truncate">Privacy & Online Status</h3>
								<p class="text-[11px] text-pink-400 font-bold truncate mt-0.5">Online status and private account</p>
							</div>
						</div>
						<div class="flex items-center space-x-1.5 flex-shrink-0">
							<span class="text-[10px] font-black px-2.5 py-0.5 rounded-full border bg-pink-50 text-[#f43f8e] border-pink-200">
								{activeStatusEnabled ? 'Active' : 'Hidden'}
							</span>
							<div class="w-5 h-5 flex items-center justify-center text-pink-400 transition-transform duration-300 {activeTab === 'privacy' ? 'rotate-180 text-[#f43f8e]' : ''}">
								<ChevronDown class="w-3.5 h-3.5" strokeWidth={2.5} />
							</div>
						</div>
					</button>

					{#if activeTab === 'privacy'}
						<div class="border-t border-pink-100/80 p-3.5 bg-pink-50/20 animate-fade-in">
							<PrivacyTab
								{activeStatusEnabled}
								{privateAccountEnabled}
								onToggleActiveStatus={handleActiveStatusToggle}
								onTogglePrivateAccount={handlePrivateAccountToggle}
							/>
						</div>
					{/if}
				</div>

				<!-- ITEM: AUDIO -->
				<div class="bg-white rounded-2xl shadow-xs border border-pink-100/90 overflow-hidden transition-all">
					<button
						type="button"
						onclick={() => toggleMobileAccordion('audio')}
						class="w-full p-3.5 flex items-center justify-between text-left hover:bg-pink-50/40 transition-colors cursor-pointer"
					>
						<div class="flex items-center space-x-3 min-w-0 pr-2">
							<div class="w-9 h-9 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e] shadow-xs">
								<Volume2 class="w-4 h-4" />
							</div>
							<div class="min-w-0">
								<h3 class="text-xs sm:text-sm font-extrabold text-pink-950 truncate">Sound & Touch Feedback</h3>
								<p class="text-[11px] text-pink-400 font-bold truncate mt-0.5">Touch audio tones and feedback</p>
							</div>
						</div>
						<div class="flex items-center space-x-1.5 flex-shrink-0">
							<span class="text-[10px] font-black px-2.5 py-0.5 rounded-full border bg-pink-50 text-[#f43f8e] border-pink-200">
								{soundEffectsEnabled ? 'Sound ON' : 'Muted'}
							</span>
							<div class="w-5 h-5 flex items-center justify-center text-pink-400 transition-transform duration-300 {activeTab === 'audio' ? 'rotate-180 text-[#f43f8e]' : ''}">
								<ChevronDown class="w-3.5 h-3.5" strokeWidth={2.5} />
							</div>
						</div>
					</button>

					{#if activeTab === 'audio'}
						<div class="border-t border-pink-100/80 p-3.5 bg-pink-50/20 animate-fade-in">
							<AudioTab
								{soundEffectsEnabled}
								onToggleSound={handleSoundToggle}
							/>
						</div>
					{/if}
				</div>

				<!-- ITEM: BLOCKED USERS -->
				<div class="bg-white rounded-2xl shadow-xs border border-pink-100/90 overflow-hidden transition-all">
					<button
						type="button"
						onclick={() => toggleMobileAccordion('blocked')}
						class="w-full p-3.5 flex items-center justify-between text-left hover:bg-pink-50/40 transition-colors cursor-pointer"
					>
						<div class="flex items-center space-x-3 min-w-0 pr-2">
							<div class="w-9 h-9 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e] shadow-xs">
								<Ban class="w-4 h-4" />
							</div>
							<div class="min-w-0">
								<h3 class="text-xs sm:text-sm font-extrabold text-pink-950 truncate">Blocked Accounts</h3>
								<p class="text-[11px] text-pink-400 font-bold truncate mt-0.5">Manage blocked users & search</p>
							</div>
						</div>
						<div class="flex items-center space-x-1.5 flex-shrink-0">
							<span class="text-[10px] font-black px-2.5 py-0.5 rounded-full border bg-pink-50 text-[#f43f8e] border-pink-200">
								{blockedUsers.length} Blocked
							</span>
							<div class="w-5 h-5 flex items-center justify-center text-pink-400 transition-transform duration-300 {activeTab === 'blocked' ? 'rotate-180 text-[#f43f8e]' : ''}">
								<ChevronDown class="w-3.5 h-3.5" strokeWidth={2.5} />
							</div>
						</div>
					</button>

					{#if activeTab === 'blocked'}
						<div class="border-t border-pink-100/80 p-3.5 bg-pink-50/20 animate-fade-in">
							<BlockedUsersTab
								{blockSearchInput}
								onBlockSearchInput={handleBlockSearchInput}
								{searchResults}
								{isSearchingUsers}
								onSelectUserToBlock={selectUserForBlocking}
								{blockedUsers}
								onUserBlockToggle={handleUserBlockToggle}
							/>
						</div>
					{/if}
				</div>

				<!-- ITEM: CREDENTIALS & SECURITY -->
				<div class="bg-white rounded-2xl shadow-xs border border-pink-100/90 overflow-hidden transition-all">
					<button
						type="button"
						onclick={() => toggleMobileAccordion('security')}
						class="w-full p-3.5 flex items-center justify-between text-left hover:bg-pink-50/40 transition-colors cursor-pointer"
					>
						<div class="flex items-center space-x-3 min-w-0 pr-2">
							<div class="w-9 h-9 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e] shadow-xs">
								<KeyRound class="w-4 h-4" />
							</div>
							<div class="min-w-0">
								<h3 class="text-xs sm:text-sm font-extrabold text-pink-950 truncate">Password & Credentials</h3>
								<p class="text-[11px] text-pink-400 font-bold truncate mt-0.5">Username, email and password</p>
							</div>
						</div>
						<div class="flex items-center space-x-1.5 flex-shrink-0">
							<span class="text-[10px] font-black px-2.5 py-0.5 rounded-full border bg-pink-50 text-[#f43f8e] border-pink-200">
								Security
							</span>
							<div class="w-5 h-5 flex items-center justify-center text-pink-400 transition-transform duration-300 {activeTab === 'security' ? 'rotate-180 text-[#f43f8e]' : ''}">
								<ChevronDown class="w-3.5 h-3.5" strokeWidth={2.5} />
							</div>
						</div>
					</button>

					{#if activeTab === 'security'}
						<div class="border-t border-pink-100/80 p-3.5 bg-pink-50/20 animate-fade-in">
							<SecurityTab
								bind:editUsername
								bind:editEmail
								bind:editNewPassword
								bind:editConfirmPassword
								{isSavingProfile}
								onSaveCredentials={handleSaveProfileCredentials}
								onOpenLogoutModal={() => showLogoutModal = true}
							/>
						</div>
					{/if}
				</div>

				<!-- ITEM: INSTALL APP -->
				<div class="bg-white rounded-2xl shadow-xs border border-pink-100/90 overflow-hidden transition-all">
					<button
						type="button"
						onclick={() => toggleMobileAccordion('install')}
						class="w-full p-3.5 flex items-center justify-between text-left hover:bg-pink-50/40 transition-colors cursor-pointer"
					>
						<div class="flex items-center space-x-3 min-w-0 pr-2">
							<div class="w-9 h-9 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e] shadow-xs">
								<Smartphone class="w-4 h-4" />
							</div>
							<div class="min-w-0">
								<h3 class="text-xs sm:text-sm font-extrabold text-pink-950 truncate">Install ChronoMuse App</h3>
								<p class="text-[11px] text-pink-400 font-bold truncate mt-0.5">Download app to home screen</p>
							</div>
						</div>
						<div class="flex items-center space-x-1.5 flex-shrink-0">
							<span class="text-[10px] font-black px-2.5 py-0.5 rounded-full border bg-pink-50 text-[#f43f8e] border-pink-200">
								{pwaStatus.isStandalone ? 'Installed' : 'Install'}
							</span>
							<div class="w-5 h-5 flex items-center justify-center text-pink-400 transition-transform duration-300 {activeTab === 'install' ? 'rotate-180 text-[#f43f8e]' : ''}">
								<ChevronDown class="w-3.5 h-3.5" strokeWidth={2.5} />
							</div>
						</div>
					</button>

					{#if activeTab === 'install'}
						<div class="border-t border-pink-100/80 p-3.5 bg-pink-50/20 animate-fade-in">
							<InstallTab
								{pwaStatus}
								{installGuideMessage}
								onInstallApp={handleInstallAppFromSettings}
							/>
						</div>
					{/if}
				</div>

			</div>
		</div>

	</main>

	<!-- Confirm Block User Selection Modal -->
	{#if showConfirmBlockModal && selectedUserToBlock}
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-block-title"
			tabindex="-1"
			onkeydown={(e) => { if (e.key === 'Escape') { showConfirmBlockModal = false; selectedUserToBlock = null; } }}
			class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-3.5 animate-fade-in"
			onclick={(e) => { if (e.target === e.currentTarget) showConfirmBlockModal = false; }}
		>
			<div class="bg-white border border-pink-200 rounded-2xl max-w-xs w-full p-5 text-center relative overflow-hidden shadow-2xl">
				<div class="w-12 h-12 rounded-full bg-[#f43f8e] text-white flex items-center justify-center font-black text-lg overflow-hidden mx-auto mb-2.5 shadow-xs">
					{#if selectedUserToBlock.avatar_url}
						<img src={selectedUserToBlock.avatar_url} alt={selectedUserToBlock.username} class="w-full h-full object-cover" />
					{:else}
						{(selectedUserToBlock.username || selectedUserToBlock.email)?.charAt(0).toUpperCase()}
					{/if}
				</div>

				<h3 id="confirm-block-title" class="text-sm font-black text-pink-950 mb-0.5">
					Block @{selectedUserToBlock.username || selectedUserToBlock.email?.split('@')[0]}?
				</h3>
				<p class="text-[11px] text-pink-400 font-bold mb-3">{selectedUserToBlock.email}</p>

				<p class="text-[11px] text-pink-600 mb-4 font-semibold bg-pink-50 p-2.5 rounded-xl border border-pink-100 leading-tight">
					Are you sure you want to block this account? They will no longer be able to message you.
				</p>

				<div class="flex items-center space-x-2">
					<button
						type="button"
						onclick={() => { showConfirmBlockModal = false; selectedUserToBlock = null; }}
						class="w-1/2 py-2 bg-pink-50 text-pink-700 hover:bg-pink-100 rounded-xl font-black text-xs transition-all cursor-pointer"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={confirmBlockSelectedUser}
						class="w-1/2 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs transition-all active:scale-95 cursor-pointer shadow-xs"
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
			class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-3.5 sm:p-4 animate-fade-in"
			onclick={(e) => { if (e.target === e.currentTarget) showLogoutModal = false; }}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onkeydown={(e) => { if (e.key === 'Escape') showLogoutModal = false; }}
		>
			<div class="bg-white border border-pink-100/90 rounded-3xl max-w-xs sm:max-w-md w-full p-5 sm:p-7 text-center relative overflow-hidden shadow-2xl animate-scale-up">
				<div class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center mx-auto mb-3 shadow-2xs">
					<LogOut class="w-6 h-6 sm:w-7 sm:h-7 text-[#f43f8e]" />
				</div>

				<h3 class="text-sm sm:text-lg font-black text-pink-950 mb-1 sm:mb-1.5">Log Out of ChronoMuse?</h3>
				<p class="text-xs sm:text-sm text-pink-400 mb-5 sm:mb-6 font-medium">
					Are you sure you want to log out of your account?
				</p>

				<div class="flex items-center space-x-2.5 sm:space-x-3">
					<button
						type="button"
						onclick={() => showLogoutModal = false}
						class="w-1/2 py-2.5 sm:py-3 bg-pink-50 text-pink-700 hover:bg-pink-100 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm transition-all cursor-pointer active:scale-95 shadow-2xs"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={handleLogout}
						class="w-1/2 py-2.5 sm:py-3 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shadow-md"
					>
						Log Out
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Toast Notification Banner -->
	{#if showToast}
		<div class="fixed bottom-24 right-5 z-50 animate-bounce">
			<div class="px-4 py-3 rounded-2xl shadow-xl flex items-center space-x-2.5 {toastType === 'error' ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white border border-rose-300/40 shadow-pink-500/20' : 'bg-gradient-to-r from-[#f43f8e] to-pink-500 text-white border border-pink-300/40 shadow-pink-500/20'}">
				<span class="text-xs sm:text-sm font-black">{toastMessage}</span>
			</div>
		</div>
	{/if}

	<!-- Bottom Navigation Bar (Footer) -->
	<AppFooter />
</div>
