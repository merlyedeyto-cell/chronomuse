<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { isSoundEnabled, setSoundEnabled, playClickSound } from '$lib/soundEffects.js';
	import AppHeader from '$lib/AppHeader.svelte';
	import AppFooter from '$lib/AppFooter.svelte';
	import { initPWAInstall, subscribePWAStatus, promptPWAInstall, openInstalledApp } from '$lib/pwaInstall.js';
	import {
		Smartphone, ChevronDown, CheckCircle2, ExternalLink, Download,
		Lock, Volume2, Ban, Search, KeyRound, LogOut
	} from 'lucide-svelte';

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
		showNotification(enabled ? 'Private Account ON (Mood summary is hidden from other users)' : 'Private Account OFF (Mood summary is visible to other users)', 'success');
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
	<title>Settings & Preferences - ChronoMuse</title>
</svelte:head>

<div class="min-h-screen bg-[#fff0f5] flex flex-col font-sans animate-fade-in text-pink-950">
	<!-- Top Navigation -->
	<AppHeader />

	<!-- Main Settings Container -->
	<main class="flex-grow container mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8 pb-24 max-w-3xl lg:max-w-4xl xl:max-w-5xl space-y-3.5 sm:space-y-4">
		<!-- Top Settings & Preferences Header Card -->
		<div class="bg-white rounded-2xl p-3.5 sm:p-4 shadow-xs border border-pink-100/90 transition-all">
			<h1 class="text-base sm:text-lg font-black text-[#f43f8e] tracking-tight">Settings & Preferences</h1>
			<p class="text-[11px] text-pink-400 font-medium mt-0.5 leading-tight">
				Click any setting item below to view options. Opening one automatically closes the previous card.
			</p>
		</div>

		<!-- SINGLE-EXPANSION ACCORDION LIST -->
		<div class="space-y-2.5">
			
			<!-- ITEM 0: INSTALL CHRONOMUSE APP -->
			<div class="bg-white rounded-2xl shadow-xs border border-pink-100/90 overflow-hidden transition-all duration-300">
				<!-- List Header Row (Clickable) -->
				<button
					type="button"
					onclick={() => toggleTab('install')}
					class="w-full p-3 sm:p-3.5 flex items-center justify-between text-left hover:bg-pink-50/40 transition-colors cursor-pointer"
				>
					<div class="flex items-center space-x-3 min-w-0 pr-2">
						<!-- Squircle Icon Box -->
						<div class="w-9 h-9 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e] shadow-xs">
							<Smartphone class="w-4 h-4" />
						</div>
						<div class="min-w-0">
							<h3 class="text-xs sm:text-sm font-extrabold text-pink-950 truncate">
								Install ChronoMuse App
							</h3>
							<p class="text-[11px] text-pink-400 font-bold truncate mt-0.5">Download app to home screen for fast access</p>
						</div>
					</div>

					<div class="flex items-center space-x-1.5 flex-shrink-0">
						<span class="text-[10px] font-black px-2.5 py-0.5 rounded-full border transition-all {pwaStatus.isStandalone || pwaStatus.isAppInstalled ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-pink-50 text-[#f43f8e] border-pink-200'}">
							{pwaStatus.isStandalone ? 'Installed' : pwaStatus.isAppInstalled ? 'Open App' : 'Install'}
						</span>
						<div class="w-5 h-5 flex items-center justify-center text-pink-400 transition-transform duration-300 {activeTab === 'install' ? 'rotate-180 text-[#f43f8e]' : ''}">
							<ChevronDown class="w-3.5 h-3.5" strokeWidth={2.5} />
						</div>
					</div>
				</button>

				<!-- Expanded Content Section -->
				{#if activeTab === 'install'}
					<div class="border-t border-pink-100/80 p-3 sm:p-3.5 space-y-2.5 bg-pink-50/20 animate-fade-in">
						<div class="p-3 bg-white rounded-xl border border-pink-100 flex items-start space-x-3 shadow-xs">
							<img src="/logo.png" alt="ChronoMuse" class="w-9 h-9 rounded-xl bg-black p-1 object-contain flex-shrink-0" />
							<div class="space-y-0.5 min-w-0">
								<h4 class="text-xs font-extrabold text-pink-950">ChronoMuse Mobile App</h4>
								<p class="text-[11px] text-pink-400 font-bold leading-relaxed">
									Install ChronoMuse on your home screen for quick offline access, full-screen calendar view, and native speed.
								</p>
							</div>
						</div>

						{#if pwaStatus.isStandalone}
							<div class="w-full py-2 px-3 bg-emerald-50 text-emerald-600 border border-emerald-200 font-extrabold text-xs rounded-xl flex items-center justify-center space-x-1.5">
								<CheckCircle2 class="w-3.5 h-3.5" strokeWidth={2.5} />
								<span>App is Already Installed</span>
							</div>
						{:else if pwaStatus.isAppInstalled}
							<button
								type="button"
								onclick={handleInstallAppFromSettings}
								class="w-full py-2 px-3 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 active:scale-95 cursor-pointer"
							>
								<ExternalLink class="w-3.5 h-3.5" strokeWidth={2.5} />
								<span>Open ChronoMuse App</span>
							</button>
						{:else}
							<button
								type="button"
								onclick={handleInstallAppFromSettings}
								class="w-full py-2 px-3 bg-[#f43f8e] hover:bg-[#e0337f] text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 active:scale-95 cursor-pointer"
							>
								<Download class="w-3.5 h-3.5" strokeWidth={2.5} />
								<span>Install ChronoMuse App</span>
							</button>
						{/if}

						{#if installGuideMessage}
							<div class="p-2.5 bg-pink-50 rounded-xl border border-pink-200 text-[11px] font-bold text-pink-800 text-center animate-fade-in">
								{installGuideMessage}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- ITEM 1: PRIVACY & ONLINE ACTIVE STATUS -->
			<div class="bg-white rounded-2xl shadow-xs border border-pink-100/90 overflow-hidden transition-all duration-300">
				<!-- List Header Row (Clickable) -->
				<button
					type="button"
					onclick={() => toggleTab('privacy')}
					class="w-full p-3 sm:p-3.5 flex items-center justify-between text-left hover:bg-pink-50/40 transition-colors cursor-pointer"
				>
					<div class="flex items-center space-x-3 min-w-0 pr-2">
						<!-- Squircle Icon Box -->
						<div class="w-9 h-9 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e] shadow-xs">
							<Lock class="w-4 h-4 fill-current" />
						</div>
						<div class="min-w-0">
							<h3 class="text-xs sm:text-sm font-extrabold text-pink-950 truncate">
								Privacy & Online Status
							</h3>
							<p class="text-[11px] text-pink-400 font-bold truncate mt-0.5">Hide/show online status and privacy</p>
						</div>
					</div>
					
					<div class="flex items-center space-x-1.5 flex-shrink-0">
						<span class="text-[10px] font-black px-2.5 py-0.5 rounded-full border bg-pink-50 text-[#f43f8e] border-pink-200 transition-all">
							{activeStatusEnabled ? 'Active ON' : 'Active OFF'}
						</span>
						<div class="w-5 h-5 flex items-center justify-center text-pink-400 transition-transform duration-300 {activeTab === 'privacy' ? 'rotate-180 text-[#f43f8e]' : ''}">
							<ChevronDown class="w-3.5 h-3.5" strokeWidth={2.5} />
						</div>
					</div>
				</button>

				<!-- Expanded Content Section -->
				{#if activeTab === 'privacy'}
					<div class="border-t border-pink-100/80 p-3 sm:p-3.5 space-y-2.5 bg-pink-50/20 animate-fade-in">
						
						<!-- Active Status Toggle Card -->
						<div class="p-3 bg-white border border-pink-100 rounded-xl flex items-center justify-between gap-3 shadow-xs">
							<div class="space-y-0.5 min-w-0 flex-1 pr-2">
								<h4 class="text-xs font-extrabold text-pink-950">Show Active / Online Status</h4>
								<p class="text-[11px] text-pink-400 font-bold leading-tight">
									When turned OFF, other users cannot see when you are online.
								</p>
							</div>

							<div class="flex items-center flex-shrink-0">
								<label class="relative inline-flex items-center cursor-pointer select-none">
									<input
										type="checkbox"
										checked={activeStatusEnabled}
										onchange={handleActiveStatusToggle}
										class="sr-only peer"
									/>
									<div class="w-10 h-6 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:bg-[#f43f8e] transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-sm after:transition-all after:duration-200 peer-checked:after:translate-x-4"></div>
								</label>
							</div>
						</div>

						<!-- Private Profile Protection Toggle Card -->
						<div class="p-3 bg-white border border-pink-100 rounded-xl flex items-center justify-between gap-3 shadow-xs">
							<div class="space-y-0.5 min-w-0 flex-1 pr-2">
								<h4 class="text-xs font-extrabold text-pink-950">Private Account Protection</h4>
								<p class="text-[11px] text-pink-400 font-bold leading-tight">
									When turned ON, your mood summary is kept private.
								</p>
							</div>

							<div class="flex items-center flex-shrink-0">
								<label class="relative inline-flex items-center cursor-pointer select-none">
									<input
										type="checkbox"
										checked={privateAccountEnabled}
										onchange={handlePrivateAccountToggle}
										class="sr-only peer"
									/>
									<div class="w-10 h-6 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:bg-[#f43f8e] transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-sm after:transition-all after:duration-200 peer-checked:after:translate-x-4"></div>
								</label>
							</div>
						</div>

					</div>
				{/if}
			</div>

			<!-- ITEM 2: SOUND & TOUCH FEEDBACK -->
			<div class="bg-white rounded-2xl shadow-xs border border-pink-100/90 overflow-hidden transition-all duration-300">
				<!-- List Header Row (Clickable) -->
				<button
					type="button"
					onclick={() => toggleTab('audio')}
					class="w-full p-3 sm:p-3.5 flex items-center justify-between text-left hover:bg-pink-50/40 transition-colors cursor-pointer"
				>
					<div class="flex items-center space-x-3 min-w-0 pr-2">
						<!-- Squircle Icon Box -->
						<div class="w-9 h-9 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e] shadow-xs">
							<Volume2 class="w-4 h-4 fill-current" />
						</div>
						<div class="min-w-0">
							<h3 class="text-xs sm:text-sm font-extrabold text-pink-950 truncate">
								Sound & Touch Feedback
							</h3>
							<p class="text-[11px] text-pink-400 font-bold truncate mt-0.5">Control touch sound effects and clicks</p>
						</div>
					</div>

					<div class="flex items-center space-x-1.5 flex-shrink-0">
						<span class="text-[10px] font-black px-2.5 py-0.5 rounded-full border bg-pink-50 text-[#f43f8e] border-pink-200 transition-all">
							{soundEffectsEnabled ? 'Sound ON' : 'Sound OFF'}
						</span>
						<div class="w-5 h-5 flex items-center justify-center text-pink-400 transition-transform duration-300 {activeTab === 'audio' ? 'rotate-180 text-[#f43f8e]' : ''}">
							<ChevronDown class="w-3.5 h-3.5" strokeWidth={2.5} />
						</div>
					</div>
				</button>

				<!-- Expanded Content Section -->
				{#if activeTab === 'audio'}
					<div class="border-t border-pink-100/80 p-3 sm:p-3.5 space-y-2.5 bg-pink-50/20 animate-fade-in">
						
						<!-- Touch Sound Toggle Card -->
						<div class="p-3 bg-white border border-pink-100 rounded-xl flex items-center justify-between gap-3 shadow-xs">
							<div class="space-y-0.5 min-w-0 flex-1 pr-2">
								<h4 class="text-xs font-extrabold text-pink-950">Touch Sound Effects</h4>
								<p class="text-[11px] text-pink-400 font-bold leading-tight">
									Play audio feedback sounds whenever you tap buttons and interactive components.
								</p>
							</div>

							<div class="flex items-center flex-shrink-0">
								<label class="relative inline-flex items-center cursor-pointer select-none">
									<input
										type="checkbox"
										checked={soundEffectsEnabled}
										onchange={handleSoundToggle}
										class="sr-only peer"
									/>
									<div class="w-10 h-6 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:bg-[#f43f8e] transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-sm after:transition-all after:duration-200 peer-checked:after:translate-x-4"></div>
								</label>
							</div>
						</div>

					</div>
				{/if}
			</div>

			<!-- ITEM 3: BLOCKED ACCOUNTS & USERS -->
			<div class="bg-white rounded-2xl shadow-xs border border-pink-100/90 overflow-hidden transition-all duration-300">
				<!-- List Header Row (Clickable) -->
				<button
					type="button"
					onclick={() => toggleTab('blocked')}
					class="w-full p-3 sm:p-3.5 flex items-center justify-between text-left hover:bg-pink-50/40 transition-colors cursor-pointer"
				>
					<div class="flex items-center space-x-3 min-w-0 pr-2">
						<!-- Squircle Icon Box -->
						<div class="w-9 h-9 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e] shadow-xs">
							<Ban class="w-4 h-4" />
						</div>
						<div class="min-w-0">
							<h3 class="text-xs sm:text-sm font-extrabold text-pink-950 truncate">
								Blocked Accounts
							</h3>
							<p class="text-[11px] text-pink-400 font-bold truncate mt-0.5">Search and select users to block</p>
						</div>
					</div>

					<div class="flex items-center space-x-1.5 flex-shrink-0">
						<span class="text-[10px] font-black px-2.5 py-0.5 rounded-full border bg-pink-50 text-[#f43f8e] border-pink-200 transition-all">
							{blockedUsers.length} Blocked
						</span>
						<div class="w-5 h-5 flex items-center justify-center text-pink-400 transition-transform duration-300 {activeTab === 'blocked' ? 'rotate-180 text-[#f43f8e]' : ''}">
							<ChevronDown class="w-3.5 h-3.5" strokeWidth={2.5} />
						</div>
					</div>
				</button>

				<!-- Expanded Content Section -->
				{#if activeTab === 'blocked'}
					<div class="border-t border-pink-100/80 p-3 sm:p-3.5 space-y-2.5 bg-pink-50/20 animate-fade-in">
						
						<!-- Live Search & Select User Bar -->
						<div class="relative space-y-1.5">
							<label class="block text-xs font-extrabold text-pink-950">Search User to Block</label>
							
							<div class="relative">
								<input
									type="text"
									value={blockSearchInput}
									oninput={handleBlockSearchInput}
									placeholder="Type username to search..."
									class="w-full pl-9 pr-9 py-2 bg-white border border-pink-200 rounded-xl text-xs font-bold text-pink-950 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/40 transition-all"
								/>
								<Search class="w-3.5 h-3.5 text-pink-400 absolute left-3 top-2.5" />

								{#if isSearchingUsers}
									<div class="absolute right-3 top-2.5 w-3.5 h-3.5 border-2 border-[#f43f8e] border-t-transparent rounded-full animate-spin"></div>
								{/if}
							</div>

							<!-- Autocomplete Search Dropdown List -->
							{#if searchResults.length > 0}
								<div class="absolute left-0 right-0 top-full mt-1 bg-white border border-pink-200 rounded-xl z-30 max-h-56 overflow-y-auto divide-y divide-pink-100 shadow-xl animate-fade-in">
									{#each searchResults as sUser}
										<button
											type="button"
											onclick={() => selectUserForBlocking(sUser)}
											class="w-full p-2.5 flex items-center justify-between hover:bg-pink-50 transition-colors text-left group cursor-pointer"
										>
											<div class="flex items-center space-x-2.5 min-w-0">
												<div class="w-7 h-7 rounded-full bg-[#f43f8e] text-white flex items-center justify-center font-black text-[11px] overflow-hidden flex-shrink-0 shadow-xs">
													{#if sUser.avatar_url}
														<img src={sUser.avatar_url} alt={sUser.username} class="w-full h-full object-cover" />
													{:else}
														{sUser.username?.charAt(0).toUpperCase()}
													{/if}
												</div>
												<div class="min-w-0 pr-1">
													<p class="text-xs font-extrabold text-pink-950 group-hover:text-[#f43f8e] truncate">@{sUser.username}</p>
													<p class="text-[10px] text-pink-400 font-medium truncate">{sUser.email}</p>
												</div>
											</div>

											<span class="px-2.5 py-0.5 bg-rose-50 border border-rose-200 text-rose-600 font-extrabold text-[10px] rounded-full group-hover:bg-rose-600 group-hover:text-white transition-all flex-shrink-0">
												Select to Block
											</span>
										</button>
									{/each}
								</div>
							{:else if blockSearchInput.trim() && !isSearchingUsers}
								<div class="p-2.5 bg-white border border-pink-200 rounded-xl text-xs font-bold text-pink-400 text-center">
									No users found matching "{blockSearchInput}".
								</div>
							{/if}
						</div>

						<!-- Blocked List -->
						{#if blockedUsers.length === 0}
							<div class="p-4 text-center border border-dashed border-pink-200 rounded-xl bg-white">
								<p class="text-[11px] font-bold text-pink-400">No blocked accounts found.</p>
							</div>
						{:else}
							<div class="space-y-2 pt-1">
								<h4 class="text-xs font-extrabold text-pink-950">Currently Blocked ({blockedUsers.length})</h4>
								{#each blockedUsers as bUser}
									<div class="p-2.5 bg-white border border-pink-100 rounded-xl flex items-center justify-between gap-2.5 shadow-xs">
										<div class="flex items-center space-x-2.5 min-w-0 flex-1">
											<div class="w-7 h-7 rounded-full bg-[#f43f8e] text-white flex items-center justify-center font-black text-[11px] overflow-hidden flex-shrink-0 shadow-xs">
												{#if bUser.avatar_url}
													<img src={bUser.avatar_url} alt={bUser.username} class="w-full h-full object-cover" />
												{:else}
													{bUser.username?.charAt(0).toUpperCase()}
												{/if}
											</div>
											<div class="min-w-0 pr-1">
												<p class="text-xs font-extrabold text-pink-950 truncate">@{bUser.username}</p>
												<p class="text-[10px] text-pink-400 font-medium truncate">{bUser.email || 'Blocked Account'}</p>
											</div>
										</div>

										<!-- Individual Block/Unblock Toggle Switch -->
										<div class="flex items-center flex-shrink-0">
											<label class="relative inline-flex items-center cursor-pointer select-none">
												<input
													type="checkbox"
													checked={true}
													onchange={(e) => handleUserBlockToggle(bUser, e)}
													class="sr-only peer"
												/>
												<div class="w-10 h-6 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:bg-rose-500 transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-sm after:transition-all after:duration-200 peer-checked:after:translate-x-4"></div>
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
			<div class="bg-white rounded-2xl shadow-xs border border-pink-100/90 overflow-hidden transition-all duration-300">
				<!-- List Header Row (Clickable) -->
				<button
					type="button"
					onclick={() => toggleTab('security')}
					class="w-full p-3 sm:p-3.5 flex items-center justify-between text-left hover:bg-pink-50/40 transition-colors cursor-pointer"
				>
					<div class="flex items-center space-x-3 min-w-0 pr-2">
						<!-- Squircle Icon Box -->
						<div class="w-9 h-9 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e] shadow-xs">
							<KeyRound class="w-4 h-4" />
						</div>
						<div class="min-w-0">
							<h3 class="text-xs sm:text-sm font-extrabold text-pink-950 truncate">
								Password & Credentials
							</h3>
							<p class="text-[11px] text-pink-400 font-bold truncate mt-0.5">Update username, email, and password</p>
						</div>
					</div>

					<div class="flex items-center space-x-1.5 flex-shrink-0">
						<span class="text-[10px] font-black px-2.5 py-0.5 rounded-full border bg-pink-50 text-[#f43f8e] border-pink-200 transition-all">
							Credentials
						</span>
						<div class="w-5 h-5 flex items-center justify-center text-pink-400 transition-transform duration-300 {activeTab === 'security' ? 'rotate-180 text-[#f43f8e]' : ''}">
							<ChevronDown class="w-3.5 h-3.5" strokeWidth={2.5} />
						</div>
					</div>
				</button>

				<!-- Expanded Content Section -->
				{#if activeTab === 'security'}
					<div class="border-t border-pink-100/80 p-3 sm:p-3.5 space-y-3 bg-pink-50/20 animate-fade-in">
						
						<form onsubmit={(e) => { e.preventDefault(); handleSaveProfileCredentials(); }} class="space-y-3">
							<div>
								<label class="block text-xs font-extrabold text-pink-950 mb-1">Username</label>
								<input
									type="text"
									bind:value={editUsername}
									class="w-full px-3 py-2 bg-white border border-pink-200 rounded-xl text-xs font-bold text-pink-950 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/40 transition-all"
									placeholder="Your username"
									required
								/>
							</div>

							<div>
								<label class="block text-xs font-extrabold text-pink-950 mb-1">Email Address</label>
								<input
									type="email"
									bind:value={editEmail}
									class="w-full px-3 py-2 bg-white border border-pink-200 rounded-xl text-xs font-bold text-pink-950 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/40 transition-all"
									placeholder="Your email address"
									required
								/>
							</div>

							<div class="pt-1.5 space-y-2">
								<h4 class="text-xs font-extrabold text-pink-950">Change Password (Leave blank to keep)</h4>

								<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
									<div>
										<label class="block text-[10px] font-bold text-pink-400 mb-0.5">New Password</label>
										<input
											type="password"
											bind:value={editNewPassword}
											placeholder="At least 6 chars"
											class="w-full px-3 py-2 bg-white border border-pink-200 rounded-xl text-xs font-bold text-pink-950 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/40 transition-all"
										/>
									</div>

									<div>
										<label class="block text-[10px] font-bold text-pink-400 mb-0.5">Confirm Password</label>
										<input
											type="password"
											bind:value={editConfirmPassword}
											placeholder="Re-type new password"
											class="w-full px-3 py-2 bg-white border border-pink-200 rounded-xl text-xs font-bold text-pink-950 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/40 transition-all"
										/>
									</div>
								</div>
							</div>

							<div class="pt-2 flex items-center justify-between gap-2.5">
								<button
									type="submit"
									disabled={isSavingProfile}
									class="h-8 py-1.5 px-4 bg-[#f43f8e] hover:bg-[#e0337f] text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center space-x-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
								>
									{#if isSavingProfile}
										<div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
										<span>Saving...</span>
									{:else}
										<span>Save Credentials</span>
									{/if}
								</button>

								<button
									type="button"
									onclick={() => showLogoutModal = true}
									class="h-8 py-1.5 px-3 text-rose-600 hover:text-rose-800 hover:bg-rose-50 text-xs font-black rounded-xl transition-all cursor-pointer border border-rose-200"
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
			class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-3 animate-fade-in"
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

				<h3 class="text-sm font-black text-pink-950 mb-0.5">
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
