<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabaseClient';

	const ADMIN_PASSCODE = '041205';

	let isAuthenticated = $state(false);
	let passcodeInput = $state('');
	let authError = $state('');
	let isCheckingAuth = $state(true);

	// Dashboard Data
	let metrics = $state({
		total_users: 0,
		total_memories: 0,
		total_pinned_dates: 0,
		total_notes: 0,
		total_messages: 0,
		active_today: 0,
		pending_reactivations: 0,
		db_latency_ms: 0,
		database_status: 'Operational',
		server_time: new Date().toISOString()
	});

	let usersList = $state([]);
	let reactivationRequests = $state([]);
	let userSearchQuery = $state('');
	let selectedStatusFilter = $state('all');
	let showFilterModal = $state(false);
	const statusFilterLabels = {
		all: 'All Accounts',
		active: 'Active Only',
		suspended: 'Suspended Only',
		appeals: 'Appeals Pending'
	};
	let isLoadingData = $state(false);
	let actionMessage = $state('');
	let errorMessage = $state('');
	let isTogglingStatus = $state(false);
	let isProcessingAppeal = $state(false);

	// Modals State
	let showAppealsListModal = $state(false);
	let viewingAppealModal = $state(null);
	let selectedUserForPasswordReset = $state(null);
	let newPasswordInput = $state('');
	let isResettingPassword = $state(false);

	let selectedUserForDelete = $state(null);
	let isDeletingUser = $state(false);

	let currentTime = $state(Date.now());

	// PWA Install State for Admin Portal
	let deferredInstallPrompt = $state(null);
	let isInstallable = $state(false);
	let isAppInstalled = $state(false);
	let showInstallHelper = $state(false);

	function handleInstallAdminApp() {
		if (deferredInstallPrompt) {
			deferredInstallPrompt.prompt();
			deferredInstallPrompt.userChoice.then((choiceResult) => {
				if (choiceResult.outcome === 'accepted') {
					showNotice('Installing ChronoMuse Admin app...');
					isInstallable = false;
				}
				deferredInstallPrompt = null;
			});
		} else {
			showInstallHelper = true;
		}
	}

	// Table Drag-to-Slide (Desktop & Touch)
	let tableContainerEl = $state(null);
	let isTableDragging = $state(false);
	let tableStartX = 0;
	let tableScrollLeft = 0;

	function onTableMouseDown(e) {
		if (e.target.closest('button, input, a, select, textarea, [role="button"]')) return;
		isTableDragging = true;
		tableStartX = e.pageX - (tableContainerEl?.offsetLeft || 0);
		tableScrollLeft = tableContainerEl?.scrollLeft || 0;
	}

	function onTableMouseMove(e) {
		if (!isTableDragging || !tableContainerEl) return;
		e.preventDefault();
		const x = e.pageX - (tableContainerEl?.offsetLeft || 0);
		const walk = (x - tableStartX) * 1.5;
		tableContainerEl.scrollLeft = tableScrollLeft - walk;
	}

	function onTableMouseUp() {
		isTableDragging = false;
	}

	onMount(() => {
		if (typeof window !== 'undefined') {
			const savedAuth = sessionStorage.getItem('chronomuse_admin_auth');
			if (savedAuth === ADMIN_PASSCODE) {
				isAuthenticated = true;
				loadAdminData();
			}

			// PWA Install Listeners
			const handleBeforeInstall = (e) => {
				e.preventDefault();
				deferredInstallPrompt = e;
				isInstallable = true;
			};

			const handleAppInstalled = () => {
				deferredInstallPrompt = null;
				isInstallable = false;
				isAppInstalled = true;
				showNotice('ChronoMuse Admin installed to Home Screen!');
			};

			window.addEventListener('beforeinstallprompt', handleBeforeInstall);
			window.addEventListener('appinstalled', handleAppInstalled);

			if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
				isAppInstalled = true;
			}
		}
		isCheckingAuth = false;

		// Timer to keep relative times (e.g. "Active now", "6m ago") live and precise
		const timerInterval = setInterval(() => {
			currentTime = Date.now();
		}, 15000);

		// Auto-refresh admin data every 30s to keep metrics and active statuses fresh
		const autoRefreshInterval = setInterval(() => {
			if (isAuthenticated && !isLoadingData) {
				loadAdminData(true);
			}
		}, 30000);

		// Listen for realtime reactivation appeal submissions from users
		const channel = supabase.channel('chronomuse_admin_notifications');
		channel
			.on('broadcast', { event: 'reactivation_appeal_submitted' }, (payload) => {
				loadAdminData();
				showNotice(`New reactivation appeal received from @${payload?.payload?.username || 'user'}`);
			})
			.subscribe();

		return () => {
			clearInterval(timerInterval);
			clearInterval(autoRefreshInterval);
			try {
				supabase.removeChannel(channel);
			} catch (e) {}
		};
	});

	function handlePasscodeSubmit(e) {
		if (e) e.preventDefault();
		authError = '';

		if (passcodeInput.trim() === ADMIN_PASSCODE) {
			isAuthenticated = true;
			if (typeof window !== 'undefined') {
				sessionStorage.setItem('chronomuse_admin_auth', ADMIN_PASSCODE);
			}
			loadAdminData();
		} else {
			authError = 'Access Denied: Invalid Security Passcode';
			passcodeInput = '';
		}
	}

	function handleLogout() {
		isAuthenticated = false;
		passcodeInput = '';
		if (typeof window !== 'undefined') {
			sessionStorage.removeItem('chronomuse_admin_auth');
		}
	}

	function showNotice(msg, isError = false) {
		if (isError) {
			errorMessage = msg;
			setTimeout(() => errorMessage = '', 4000);
		} else {
			actionMessage = msg;
			setTimeout(() => actionMessage = '', 4000);
		}
	}

	async function loadAdminData(isBackground = false) {
		if (!isBackground) {
			isLoadingData = true;
			actionMessage = '';
			errorMessage = '';
		}

		try {
			const [metricsRes, usersRes, reactivationsRes] = await Promise.all([
				fetch('/api/admin', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ passcode: ADMIN_PASSCODE, action: 'get_metrics' })
				}).then(r => r.json()),
				fetch('/api/admin', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ passcode: ADMIN_PASSCODE, action: 'get_users', limit: 300 })
				}).then(r => r.json()),
				fetch('/api/admin', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ passcode: ADMIN_PASSCODE, action: 'get_reactivations' })
				}).then(r => r.json())
			]);

			if (metricsRes?.success && metricsRes.data?.metrics) {
				metrics = metricsRes.data.metrics;
			}
			if (usersRes?.success && Array.isArray(usersRes.data?.users)) {
				usersList = usersRes.data.users;
			}
			if (reactivationsRes?.success && Array.isArray(reactivationsRes.data?.requests)) {
				reactivationRequests = reactivationsRes.data.requests;
			}
		} catch (err) {
			console.error('Error loading admin data:', err);
			if (!isBackground) {
				showNotice('Failed to connect to Admin API', true);
			}
		} finally {
			if (!isBackground) {
				isLoadingData = false;
			}
		}
	}

	async function toggleUserStatus(targetUser) {
		if (isTogglingStatus) return;
		isTogglingStatus = true;

		const nextStatus = targetUser.status === 'suspended' ? 'active' : 'suspended';
		const oldStatus = targetUser.status;
		targetUser.status = nextStatus;

		try {
			const res = await fetch('/api/admin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passcode: ADMIN_PASSCODE,
					action: 'toggle_user_status',
					user_id: targetUser.id,
					new_status: nextStatus
				})
			});
			const data = await res.json();
			if (data.success) {
				showNotice(`Status for @${targetUser.username} updated to ${nextStatus}`);
				if (nextStatus === 'active') {
					targetUser.has_pending_reactivation = false;
					reactivationRequests = reactivationRequests.filter(r => r.user_id !== targetUser.id);
				}
			} else {
				targetUser.status = oldStatus;
				showNotice(data.error || 'Failed to update user status', true);
			}
		} catch (err) {
			targetUser.status = oldStatus;
			showNotice('Network error updating user status', true);
		} finally {
			isTogglingStatus = false;
		}
	}

	async function respondReactivation(reqItem, actionType) {
		if (isProcessingAppeal) return;
		isProcessingAppeal = true;

		try {
			const res = await fetch('/api/admin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passcode: ADMIN_PASSCODE,
					action: 'respond_reactivation',
					request_id: reqItem.id,
					user_id: reqItem.user_id,
					action_type: actionType
				})
			});
			const data = await res.json();
			if (data.success) {
				reactivationRequests = reactivationRequests.filter(r => r.id !== reqItem.id);
				const userInList = usersList.find(u => u.id === reqItem.user_id);
				if (userInList) {
					userInList.has_pending_reactivation = false;
					if (actionType === 'approve') {
						userInList.status = 'active';
					}
				}
				metrics.pending_reactivations = Math.max(0, metrics.pending_reactivations - 1);
				showNotice(actionType === 'approve' ? `Account @${reqItem.username} reactivated!` : `Appeal from @${reqItem.username} dismissed.`);
			} else {
				showNotice(data.error || 'Failed to process appeal', true);
			}
		} catch (err) {
			showNotice('Network error processing appeal', true);
		} finally {
			isProcessingAppeal = false;
		}
	}

	let unreadAppealsCount = $derived(reactivationRequests.filter(r => !r.is_read).length);

	function openAppealReview(appealItem) {
		if (!appealItem) return;
		viewingAppealModal = appealItem;

		// Mark as read if not already read
		if (!appealItem.is_read) {
			appealItem.is_read = true;
			const userInList = usersList.find(u => u.id === appealItem.user_id);
			if (userInList?.reactivation_request) {
				userInList.reactivation_request.is_read = true;
			}
			fetch('/api/admin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passcode: ADMIN_PASSCODE,
					action: 'mark_appeal_read',
					request_id: appealItem.id,
					user_id: appealItem.user_id
				})
			}).catch(() => {});
		}
	}

	function openAppealsListModal() {
		showAppealsListModal = true;
		if (unreadAppealsCount > 0) {
			markAllAppealsAsRead(false);
		}
	}

	async function markAllAppealsAsRead(showToast = true) {
		reactivationRequests.forEach(r => r.is_read = true);
		usersList.forEach(u => {
			if (u.reactivation_request) u.reactivation_request.is_read = true;
		});

		try {
			await fetch('/api/admin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passcode: ADMIN_PASSCODE,
					action: 'mark_all_appeals_read'
				})
			});
			if (showToast) {
				showNotice('All reactivation appeals marked as read');
			}
		} catch (e) {
			if (showToast) {
				showNotice('Network error marking appeals as read', true);
			}
		}
	}

	function scrollToAppealsSection() {
		const el = document.getElementById('appeals-section');
		if (el) {
			el.scrollIntoView({ behavior: 'smooth' });
		} else {
			selectedStatusFilter = 'appeals';
		}
	}

	async function handleResetPassword(e) {
		if (e) e.preventDefault();
		if (!selectedUserForPasswordReset || !newPasswordInput || newPasswordInput.trim().length < 6) {
			showNotice('Password must be at least 6 characters long', true);
			return;
		}

		isResettingPassword = true;
		try {
			const res = await fetch('/api/admin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passcode: ADMIN_PASSCODE,
					action: 'reset_password',
					user_id: selectedUserForPasswordReset.id,
					new_password: newPasswordInput.trim()
				})
			});
			const data = await res.json();
			if (data.success) {
				showNotice(`Password updated successfully for @${selectedUserForPasswordReset.username}`);
				selectedUserForPasswordReset = null;
				newPasswordInput = '';
			} else {
				showNotice(data.error || 'Failed to reset password', true);
			}
		} catch (err) {
			showNotice('Network error resetting password', true);
		} finally {
			isResettingPassword = false;
		}
	}

	async function handleDeleteUser() {
		if (!selectedUserForDelete) return;

		isDeletingUser = true;
		const userIdToDelete = selectedUserForDelete.id;
		const username = selectedUserForDelete.username;

		try {
			const res = await fetch('/api/admin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passcode: ADMIN_PASSCODE,
					action: 'delete_user',
					user_id: userIdToDelete
				})
			});
			const data = await res.json();
			if (data.success) {
				usersList = usersList.filter(u => u.id !== userIdToDelete);
				reactivationRequests = reactivationRequests.filter(r => r.user_id !== userIdToDelete);
				metrics.total_users = Math.max(0, metrics.total_users - 1);
				showNotice(`Account @${username} and all records deleted`);
				selectedUserForDelete = null;
			} else {
				showNotice(data.error || 'Failed to delete user', true);
			}
		} catch (err) {
			showNotice('Network error deleting user', true);
		} finally {
			isDeletingUser = false;
		}
	}

	function formatDate(isoStr) {
		if (!isoStr) return '—';
		try {
			const d = new Date(isoStr);
			return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
		} catch (e) {
			return isoStr;
		}
	}

	function formatLastActive(lastActive, nowTimestamp = currentTime) {
		if (!lastActive) {
			return { label: 'No activity yet', isActiveNow: false, isOffline: true };
		}

		try {
			const activeTime = new Date(lastActive).getTime();
			if (isNaN(activeTime)) {
				return { label: 'No activity yet', isActiveNow: false, isOffline: true };
			}

			const diffMs = (nowTimestamp || Date.now()) - activeTime;
			if (diffMs < 0) {
				return { label: 'Active now', isActiveNow: true, isOffline: false };
			}

			const diffMins = Math.floor(diffMs / 60000);
			if (diffMins < 5) {
				return { label: 'Active now', isActiveNow: true, isOffline: false };
			}
			if (diffMins < 60) {
				return { label: `${diffMins}m ago`, isActiveNow: false, isOffline: false };
			}

			const diffHours = Math.floor(diffMins / 60);
			if (diffHours < 24) {
				return { label: `${diffHours}h ago`, isActiveNow: false, isOffline: false };
			}

			const diffDays = Math.floor(diffHours / 24);
			if (diffDays === 1) {
				return { label: '1d ago', isActiveNow: false, isOffline: false };
			}
			if (diffDays < 7) {
				return { label: `${diffDays}d ago`, isActiveNow: false, isOffline: false };
			}

			const diffWeeks = Math.floor(diffDays / 7);
			if (diffWeeks < 5) {
				return { label: `${diffWeeks}w ago`, isActiveNow: false, isOffline: false };
			}

			const diffMonths = Math.floor(diffDays / 30);
			if (diffMonths < 12) {
				return { label: `${diffMonths}mo ago`, isActiveNow: false, isOffline: false };
			}

			const diffYears = Math.floor(diffDays / 365);
			return { label: `${diffYears}y ago`, isActiveNow: false, isOffline: false };
		} catch (e) {
			return { label: '—', isActiveNow: false, isOffline: true };
		}
	}

	let filteredUsers = $derived(
		usersList.filter(u => {
			const query = userSearchQuery.trim().toLowerCase();
			const matchesSearch = !query || 
				u.username?.toLowerCase().includes(query) || 
				u.email?.toLowerCase().includes(query) ||
				String(u.id).includes(query);
			
			const matchesStatus = selectedStatusFilter === 'all' || 
				u.status === selectedStatusFilter ||
				(selectedStatusFilter === 'appeals' && u.has_pending_reactivation);

			return matchesSearch && matchesStatus;
		})
	);

	let appealSearchQuery = $state('');

	function isAppealNew(item) {
		if (!item) return false;
		try {
			const appealTime = new Date(item.created_at || item.updated_at || 0).getTime();
			if (!appealTime) return false;
			// 24 hours in milliseconds (1 day)
			return (currentTime - appealTime) < 24 * 60 * 60 * 1000;
		} catch (e) {
			return false;
		}
	}

	let filteredAppeals = $derived(
		reactivationRequests.filter(r => {
			if (!appealSearchQuery.trim()) return true;
			const q = appealSearchQuery.trim().toLowerCase();
			return (
				(r.username && r.username.toLowerCase().includes(q)) ||
				(r.email && r.email.toLowerCase().includes(q)) ||
				(r.reason && r.reason.toLowerCase().includes(q)) ||
				String(r.user_id).includes(q)
			);
		})
	);
</script>

<svelte:head>
	<title>Admin Portal - ChronoMuse</title>
	<link rel="manifest" href="/manifest-admin.json" />
	<meta name="apple-mobile-web-app-title" content="ChronoMuse Admin" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="theme-color" content="#ff4fae" />
</svelte:head>

<svelte:window onmouseup={onTableMouseUp} />

<div class="min-h-screen bg-pink-100 text-pink-950 font-sans p-4 sm:p-6 flex flex-col antialiased">
	{#if isCheckingAuth}
		<div class="flex-1 flex items-center justify-center">
			<div class="animate-spin h-8 w-8 border-3 border-pink-300 border-t-pink-600 rounded-full"></div>
		</div>
	{:else if !isAuthenticated}
		<!-- Secret Admin Passcode Screen -->
		<div class="flex-1 flex items-center justify-center p-4">
			<div class="bg-white border-2 border-pink-300 shadow-md rounded-3xl max-w-sm w-full p-6 text-center">
				<div class="w-14 h-14 bg-pink-100 text-pink-600 border-2 border-pink-300 rounded-2xl flex items-center justify-center mx-auto mb-4">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-7 h-7">
						<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
					</svg>
				</div>

				<h1 class="text-lg font-black text-pink-700 mb-1">Administrative Access</h1>
				<p class="text-xs text-pink-500 mb-5 font-medium">ChronoMuse Central Platform Console</p>

				{#if authError}
					<div class="mb-4 p-2.5 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2 text-left">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 flex-shrink-0">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
						</svg>
						<span>{authError}</span>
					</div>
				{/if}

				<form onsubmit={handlePasscodeSubmit} class="space-y-4">
					<div>
						<label for="passcode_input" class="block text-xs font-bold text-pink-700 text-left mb-1">Security Passcode</label>
						<input
							id="passcode_input"
							type="password"
							maxlength="12"
							bind:value={passcodeInput}
							placeholder="Enter passcode..."
							class="w-full px-3.5 py-2.5 bg-pink-50 border-2 border-pink-200 rounded-xl text-center text-lg font-mono tracking-widest text-pink-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white"
						/>
					</div>

					<button
						type="submit"
						class="w-full py-2.5 bg-pink-500 hover:bg-pink-600 active:scale-95 text-white font-bold text-sm rounded-xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
						</svg>
						<span>Authenticate Console</span>
					</button>

					<div class="flex items-center gap-2">
						<button
							type="button"
							onclick={() => goto('/dashboard')}
							class="w-1/2 py-2 bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
						>
							Return to App
						</button>
						<button
							type="button"
							onclick={handleInstallAdminApp}
							class="w-1/2 py-2 bg-pink-50 hover:bg-pink-100 text-pink-700 font-bold text-xs rounded-xl border border-pink-200 transition-all cursor-pointer flex items-center justify-center gap-1"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
							</svg>
							<span>Install App</span>
						</button>
					</div>
				</form>
			</div>
		</div>
	{:else}
		<!-- Authenticated Admin Dashboard (Pink Theme) -->
		<div class="container mx-auto max-w-6xl space-y-4">
			<!-- Header -->
			<div class="bg-white border-2 border-pink-300 shadow-sm rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
				<div class="flex items-center space-x-3 min-w-0">
					<img src="/logo.png" alt="ChronoMuse" class="w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-contain border border-pink-200 flex-shrink-0 bg-white shadow-2xs" />
					<div class="min-w-0 flex items-center gap-2 flex-wrap">
						<h1 class="text-base sm:text-lg font-black text-pink-700 truncate">ChronoMuse Admin</h1>
						<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[11px] font-bold border border-emerald-300 whitespace-nowrap">
							<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
							Connected
						</span>
					</div>
				</div>

				<div class="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
					<!-- Install Admin App Button -->
					{#if !isAppInstalled}
						<button
							type="button"
							onclick={handleInstallAdminApp}
							class="flex-1 sm:flex-initial px-3 py-2 bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
							title="Install ChronoMuse Admin as a standalone app on your device"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-pink-600">
								<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
							</svg>
							<span>Install Admin</span>
						</button>
					{/if}

					<!-- All Appeals Button -->
					<button
						onclick={openAppealsListModal}
						class="flex-1 sm:flex-initial px-3.5 py-2 {reactivationRequests.length > 0 ? (unreadAppealsCount > 0 ? 'bg-pink-600 hover:bg-pink-700 text-white shadow-md ring-2 ring-pink-300 animate-pulse' : 'bg-pink-100 hover:bg-pink-200 text-pink-900 border border-pink-300') : 'bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200'} rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
						title="Open all pending reactivation appeals"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 {unreadAppealsCount > 0 ? 'text-white' : 'text-pink-600'}">
							<path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
						</svg>
						<span>All Appeals</span>
						{#if reactivationRequests.length > 0}
							<span class="px-1.5 py-0.2 rounded-full text-[10px] font-black {unreadAppealsCount > 0 ? 'bg-rose-600 text-white' : 'bg-pink-200 text-pink-900'}">
								{reactivationRequests.length}
							</span>
							{#if unreadAppealsCount > 0}
								<span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
							{/if}
						{/if}
					</button>

					<button
						onclick={() => goto('/dashboard')}
						class="flex-1 sm:flex-initial px-3 py-2 bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 font-bold text-xs rounded-xl transition-all cursor-pointer text-center whitespace-nowrap"
					>
						Go to App
					</button>
					<button
						onclick={handleLogout}
						class="flex-1 sm:flex-initial px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
						</svg>
						<span>Exit</span>
					</button>
				</div>
			</div>

			<!-- Notice Alerts -->
			{#if actionMessage}
				<div class="p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-emerald-600 flex-shrink-0">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span>{actionMessage}</span>
				</div>
			{/if}

			{#if errorMessage}
				<div class="p-3 bg-rose-100 border border-rose-300 text-rose-900 rounded-xl text-xs font-bold flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-rose-600 flex-shrink-0">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
					</svg>
					<span>{errorMessage}</span>
				</div>
			{/if}

			<!-- Metric Cards Grid (Compact on Mobile) -->
			<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
				<!-- Registered Users -->
				<div class="bg-white border-2 border-pink-300 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 flex flex-col justify-between shadow-2xs">
					<div class="flex items-center justify-between mb-1 sm:mb-2">
						<span class="text-[10px] sm:text-[11px] font-bold text-pink-600 uppercase tracking-wider">Users</span>
						<div class="p-1 sm:p-1.5 bg-pink-100 text-pink-600 rounded-md sm:rounded-lg">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 sm:w-4 sm:h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
							</svg>
						</div>
					</div>
					<div>
						<p class="text-xl sm:text-2xl font-black text-pink-900">{metrics.total_users}</p>
						<p class="text-[9px] sm:text-[10px] text-pink-400 font-medium">Registered Accounts</p>
					</div>
				</div>

				<!-- Active Today -->
				<div class="bg-white border-2 border-emerald-300 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 flex flex-col justify-between shadow-2xs">
					<div class="flex items-center justify-between mb-1 sm:mb-2">
						<span class="text-[10px] sm:text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Active (24h)</span>
						<div class="p-1 sm:p-1.5 bg-emerald-100 text-emerald-600 rounded-md sm:rounded-lg">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 sm:w-4 sm:h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</div>
					</div>
					<div>
						<p class="text-xl sm:text-2xl font-black text-emerald-900">{metrics.active_today}</p>
						<p class="text-[9px] sm:text-[10px] text-emerald-600 font-medium">Logged in 24h</p>
					</div>
				</div>

				<!-- Memories Recorded -->
				<div class="bg-white border-2 border-pink-300 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 flex flex-col justify-between shadow-2xs">
					<div class="flex items-center justify-between mb-1 sm:mb-2">
						<span class="text-[10px] sm:text-[11px] font-bold text-pink-600 uppercase tracking-wider">Memories</span>
						<div class="p-1 sm:p-1.5 bg-pink-100 text-pink-600 rounded-md sm:rounded-lg">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 sm:w-4 sm:h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
							</svg>
						</div>
					</div>
					<div>
						<p class="text-xl sm:text-2xl font-black text-pink-900">{metrics.total_memories}</p>
						<p class="text-[9px] sm:text-[10px] text-pink-400 font-medium">Calendar Entries</p>
					</div>
				</div>

				<!-- Pinned Dates -->
				<div class="bg-white border-2 border-pink-300 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 flex flex-col justify-between shadow-2xs">
					<div class="flex items-center justify-between mb-1 sm:mb-2">
						<span class="text-[10px] sm:text-[11px] font-bold text-pink-600 uppercase tracking-wider">Pinned Dates</span>
						<div class="p-1 sm:p-1.5 bg-pink-100 text-pink-600 rounded-md sm:rounded-lg">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 sm:w-4 sm:h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
							</svg>
						</div>
					</div>
					<div>
						<p class="text-xl sm:text-2xl font-black text-pink-900">{metrics.total_pinned_dates}</p>
						<p class="text-[9px] sm:text-[10px] text-pink-400 font-medium">Pinned Days</p>
					</div>
				</div>

				<!-- Live Thoughts / Notes -->
				<div class="bg-white border-2 border-pink-300 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 flex flex-col justify-between shadow-2xs">
					<div class="flex items-center justify-between mb-1 sm:mb-2">
						<span class="text-[10px] sm:text-[11px] font-bold text-pink-600 uppercase tracking-wider">Notes</span>
						<div class="p-1 sm:p-1.5 bg-pink-100 text-pink-600 rounded-md sm:rounded-lg">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 sm:w-4 sm:h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
							</svg>
						</div>
					</div>
					<div>
						<p class="text-xl sm:text-2xl font-black text-pink-900">{metrics.total_notes}</p>
						<p class="text-[9px] sm:text-[10px] text-pink-400 font-medium">Live Thoughts</p>
					</div>
				</div>

				<!-- Messages Exchanged -->
				<div class="bg-white border-2 border-pink-300 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 flex flex-col justify-between shadow-2xs">
					<div class="flex items-center justify-between mb-1 sm:mb-2">
						<span class="text-[10px] sm:text-[11px] font-bold text-pink-600 uppercase tracking-wider">Messages</span>
						<div class="p-1 sm:p-1.5 bg-pink-100 text-pink-600 rounded-md sm:rounded-lg">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 sm:w-4 sm:h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
							</svg>
						</div>
					</div>
					<div>
						<p class="text-xl sm:text-2xl font-black text-pink-900">{metrics.total_messages}</p>
						<p class="text-[9px] sm:text-[10px] text-pink-400 font-medium">Chat Transcripts</p>
					</div>
				</div>
			</div>


			<!-- Users Management Directory -->
			<div class="bg-white border-2 border-pink-300 shadow-sm rounded-2xl p-4 sm:p-5 space-y-4">
				<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
					<div>
						<h2 class="text-base font-black text-pink-800">Platform Accounts Directory ({filteredUsers.length})</h2>
						<p class="text-xs text-pink-500 font-medium">Search, moderate, change passwords, and manage registered profiles</p>
					</div>

					<div class="flex items-center gap-2 w-full sm:w-auto">
						<div class="relative flex-1 sm:w-64">
							<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-pink-400">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
								</svg>
							</div>
							<input
								type="text"
								bind:value={userSearchQuery}
								placeholder="Search username or email..."
								class="w-full pl-8 pr-3 py-1.5 bg-pink-50 border border-pink-300 rounded-xl text-xs font-bold text-pink-900 placeholder:text-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all"
							/>
						</div>

						<!-- Filter Button triggering Modal -->
						<button
							type="button"
							onclick={() => showFilterModal = true}
							class="px-3 py-1.5 bg-pink-50 hover:bg-pink-100 text-pink-800 border border-pink-300 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-between sm:justify-start gap-1.5 whitespace-nowrap shadow-2xs min-w-[120px]"
							title="Filter accounts directory"
						>
							<div class="flex items-center gap-1.5">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-pink-600">
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
								</svg>
								<span>{statusFilterLabels[selectedStatusFilter]}</span>
							</div>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3 text-pink-500">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
							</svg>
						</button>
					</div>
				</div>

				<!-- Users Table (Slideable on Desktop & Mobile) -->
				<div
					bind:this={tableContainerEl}
					onmousedown={onTableMouseDown}
					onmousemove={onTableMouseMove}
					onmouseup={onTableMouseUp}
					onmouseleave={onTableMouseUp}
					role="region"
					aria-label="Accounts table"
					class="overflow-x-auto rounded-xl border border-pink-100 scrollbar-thin scroll-smooth {isTableDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}"
				>
					<table class="w-full min-w-[980px] text-left text-xs">
						<thead>
							<tr class="bg-pink-100 text-pink-800 border-b-2 border-pink-200">
								<th class="py-2.5 px-3 font-bold whitespace-nowrap">User</th>
								<th class="py-2.5 px-3 font-bold whitespace-nowrap">Email</th>
								<th class="py-2.5 px-3 font-bold text-center whitespace-nowrap">Memories</th>
								<th class="py-2.5 px-3 font-bold text-center whitespace-nowrap">Pinned</th>
								<th class="py-2.5 px-3 font-bold text-center whitespace-nowrap">Notes</th>
								<th class="py-2.5 px-3 font-bold text-center whitespace-nowrap">Messages</th>
								<th class="py-2.5 px-3 font-bold whitespace-nowrap">Joined Date</th>
								<th class="py-2.5 px-3 font-bold whitespace-nowrap">Last Active</th>
								<th class="py-2.5 px-3 font-bold whitespace-nowrap">Account Status</th>
								<th class="py-2.5 px-3 font-bold text-right whitespace-nowrap">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-pink-100">
							{#if isLoadingData && usersList.length === 0}
								<tr>
									<td colspan="10" class="text-center py-8 text-pink-400 font-medium">
										<div class="inline-flex items-center gap-2">
											<div class="animate-spin h-4 w-4 border-2 border-pink-300 border-t-pink-600 rounded-full"></div>
											<span>Loading registered accounts...</span>
										</div>
									</td>
								</tr>
							{:else if filteredUsers.length === 0}
								<tr>
									<td colspan="10" class="text-center py-8 text-pink-400 font-medium">
										No user accounts found matching your criteria.
									</td>
								</tr>
							{:else}
								{#each filteredUsers as userRow (userRow.id)}
									<tr class="hover:bg-pink-50/70 transition-colors">
										<td class="py-2.5 px-3">
											<div class="flex items-center space-x-2.5">
												<div class="w-7 h-7 rounded-full bg-pink-400 text-white font-bold flex items-center justify-center overflow-hidden flex-shrink-0 text-xs">
													{#if userRow.avatar_url}
														<img src={userRow.avatar_url} alt="" class="w-full h-full object-cover" />
													{:else}
														{userRow.username?.charAt(0).toUpperCase()}
													{/if}
												</div>
												<div>
													<span class="font-bold text-pink-900 block">@{userRow.username}</span>
													<span class="text-[10px] text-pink-400 font-mono">ID: #{userRow.id}</span>
												</div>
											</div>
										</td>
										<td class="py-2.5 px-3 text-pink-700 font-mono text-[11px]">{userRow.email || '—'}</td>
										<td class="py-2.5 px-3 text-center">
											<span class="px-2 py-0.5 bg-pink-100 text-pink-800 rounded-md font-bold text-[11px] border border-pink-200">
												{userRow.memories_count || 0}
											</span>
										</td>
										<td class="py-2.5 px-3 text-center">
											<span class="px-2 py-0.5 bg-pink-100 text-pink-800 rounded-md font-bold text-[11px] border border-pink-200">
												{userRow.pinned_count || 0}
											</span>
										</td>
										<td class="py-2.5 px-3 text-center">
											<span class="px-2 py-0.5 bg-pink-100 text-pink-800 rounded-md font-bold text-[11px] border border-pink-200">
												{userRow.notes_count || 0}
											</span>
										</td>
										<td class="py-2.5 px-3 text-center">
											<span class="px-2 py-0.5 bg-pink-100 text-pink-800 rounded-md font-bold text-[11px] border border-pink-200">
												{userRow.messages_count || 0}
											</span>
										</td>
										<td class="py-2.5 px-3 text-pink-700 font-medium whitespace-nowrap">
											{formatDate(userRow.created_at)}
										</td>
										<td class="py-2.5 px-3 whitespace-nowrap">
											{#if !userRow.last_activity}
												<span class="inline-flex items-center gap-1.5 text-slate-400 font-medium text-[11px]" title="No activity recorded">
													<span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
													<span class="italic">No activity yet</span>
												</span>
											{:else}
												{@const statusInfo = formatLastActive(userRow.last_activity, currentTime)}
												<span 
													class="inline-flex items-center gap-1.5" 
													title={`Exact timestamp: ${formatDate(userRow.last_activity)}`}
												>
													<span class="w-2 h-2 rounded-full {statusInfo.isActiveNow ? 'bg-emerald-500 ring-2 ring-emerald-200 animate-pulse' : 'bg-slate-300'}"></span>
													<span class="{statusInfo.isActiveNow ? 'text-emerald-700 font-bold' : 'text-slate-600 font-medium'} text-xs">
														{statusInfo.label}
													</span>
												</span>
											{/if}
										</td>
										<td class="py-2.5 px-3 whitespace-nowrap">
											{#if userRow.status === 'suspended'}
												<div class="flex flex-col gap-1">
													<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full text-[10px] font-bold border border-rose-300 w-max">
														<span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
														Suspended
													</span>
													{#if userRow.has_pending_reactivation}
														<button
															type="button"
															onclick={() => openAppealReview(userRow.reactivation_request || { id: null, user_id: userRow.id, username: userRow.username, email: userRow.email, reason: '', is_read: false, created_at: new Date().toISOString() })}
															class="inline-flex items-center gap-1 px-2 py-0.5 {userRow.reactivation_request && !userRow.reactivation_request.is_read ? 'bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-300 animate-pulse' : 'bg-pink-100 hover:bg-pink-200 text-pink-800 border-pink-300'} rounded-full text-[9.5px] font-bold border transition-all cursor-pointer shadow-xs w-max"
															title="Click to read appeal note & message"
														>
															{#if userRow.reactivation_request && !userRow.reactivation_request.is_read}
																<span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
															{:else}
																<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 text-pink-600">
																	<path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
																</svg>
															{/if}
															<span>{userRow.reactivation_request && !userRow.reactivation_request.is_read ? 'New Appeal' : 'Appeal Note'}</span>
														</button>
													{/if}
												</div>
											{:else}
												<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full text-[10px] font-bold border border-pink-200">
													Active
												</span>
											{/if}
										</td>
										<td class="py-2.5 px-3 text-right">
											<div class="flex items-center justify-end gap-1.5">
												<!-- Toggle Status Button -->
												<button
													onclick={() => toggleUserStatus(userRow)}
													disabled={isTogglingStatus}
													title={userRow.status === 'suspended' ? 'Reactivate Account' : 'Suspend Account'}
													class="px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer {userRow.status === 'suspended' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-pink-100 hover:bg-pink-200 text-pink-700 border border-pink-300'}"
												>
													{userRow.status === 'suspended' ? 'Reactivate' : 'Suspend'}
												</button>

												<!-- Reset Password Button -->
												<button
													onclick={() => { selectedUserForPasswordReset = userRow; newPasswordInput = ''; }}
													title="Reset Password"
													class="p-1.5 text-pink-600 hover:text-pink-800 hover:bg-pink-100 rounded-lg transition-all cursor-pointer border border-pink-200"
												>
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
														<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
													</svg>
												</button>

												<!-- Delete User Button -->
												<button
													onclick={() => { selectedUserForDelete = userRow; }}
													title="Delete User"
													class="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-100 rounded-lg transition-all cursor-pointer border border-rose-200"
												>
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
														<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
													</svg>
												</button>
											</div>
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Password Reset Modal -->
{#if selectedUserForPasswordReset}
	<div class="fixed inset-0 z-50 bg-black/10 backdrop-blur-[1.5px] flex items-center justify-center p-4 animate-fade-in">
		<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-xl max-w-sm w-full p-6 space-y-4">
			<div class="flex items-center justify-between border-b border-pink-100 pb-3">
				<div class="flex items-center gap-2 text-pink-900 font-black text-sm">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-500">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
					</svg>
					<span>Reset Password</span>
				</div>
				<button
					onclick={() => { selectedUserForPasswordReset = null; newPasswordInput = ''; }}
					aria-label="Close"
					class="text-pink-400 hover:text-pink-600 cursor-pointer"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<p class="text-xs text-pink-600 font-medium">
				Setting new password for <span class="font-bold text-pink-900">@{selectedUserForPasswordReset.username}</span>:
			</p>

			<form onsubmit={handleResetPassword} class="space-y-3">
				<div>
					<label for="new_pw_input" class="block text-xs font-bold text-pink-700 mb-1">New Password (min. 6 chars)</label>
					<input
						id="new_pw_input"
						type="text"
						bind:value={newPasswordInput}
						placeholder="Enter new password..."
						class="w-full px-3 py-2 bg-pink-50 border-2 border-pink-200 rounded-xl text-xs font-mono text-pink-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all"
					/>
				</div>

				<div class="flex items-center justify-end gap-2 pt-2">
					<button
						type="button"
						onclick={() => { selectedUserForPasswordReset = null; newPasswordInput = ''; }}
						class="px-3.5 py-1.5 bg-pink-100 hover:bg-pink-200 text-pink-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={isResettingPassword || !newPasswordInput || newPasswordInput.trim().length < 6}
						class="px-3.5 py-1.5 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
					>
						{isResettingPassword ? 'Saving...' : 'Save Password'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Confirm Delete User Modal -->
{#if selectedUserForDelete}
	<div class="fixed inset-0 z-50 bg-black/10 backdrop-blur-[1.5px] flex items-center justify-center p-4 animate-fade-in">
		<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-xl max-w-sm w-full p-6 space-y-4">
			<div class="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl border border-rose-200 flex items-center justify-center mx-auto">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
				</svg>
			</div>

			<div class="text-center space-y-1">
				<h3 class="text-sm font-black text-pink-950">Delete Account @{selectedUserForDelete.username}?</h3>
				<p class="text-xs text-pink-600 font-medium leading-relaxed">
					This action cannot be undone. All memories, notes, pinned dates, and friendships will be deleted permanently.
				</p>
			</div>

			<div class="flex items-center justify-center gap-2 pt-2">
				<button
					type="button"
					onclick={() => { selectedUserForDelete = null; }}
					class="w-1/2 py-2 bg-pink-100 hover:bg-pink-200 text-pink-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={handleDeleteUser}
					disabled={isDeletingUser}
					class="w-1/2 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
				>
					{isDeletingUser ? 'Deleting...' : 'Confirm Delete'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- All Pending Reactivation Appeals List Modal -->
{#if showAppealsListModal}
	<div class="fixed inset-0 z-50 bg-black/10 backdrop-blur-[1.5px] flex items-center justify-center p-3 sm:p-5 animate-fade-in">
		<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-2xl w-full p-5 sm:p-6 space-y-3.5 max-h-[90vh] flex flex-col animate-modal-content">
			<!-- Modal Header -->
			<div class="flex items-start justify-between border-b border-pink-100 pb-3 flex-shrink-0 gap-3">
				<div class="flex items-center gap-3">
					<div class="w-10 h-10 bg-pink-100 text-pink-600 rounded-2xl border border-pink-200 flex items-center justify-center flex-shrink-0">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
						</svg>
					</div>
					<div>
						<div class="flex items-center gap-2 flex-wrap">
							<h3 class="text-sm sm:text-base font-black text-pink-950 whitespace-nowrap">All Appeals Directory</h3>
							<span class="px-2.5 py-0.5 bg-pink-100 text-pink-900 border border-pink-300 rounded-full text-xs font-bold font-mono whitespace-nowrap">
								{reactivationRequests.length} {reactivationRequests.length === 1 ? 'appeal' : 'appeals'}
							</span>
						</div>
						<p class="text-xs text-pink-500 font-medium mt-0.5">Click any user account to view details, verify profile, or resolve appeal</p>
					</div>
				</div>

				<div class="flex items-center gap-2 flex-shrink-0">
					<button
						onclick={() => showAppealsListModal = false}
						aria-label="Close"
						class="text-pink-400 hover:text-pink-600 cursor-pointer p-1.5 rounded-xl hover:bg-pink-50 transition-colors"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			<!-- Search Bar for fast searching in case of many appeals -->
			{#if reactivationRequests.length > 0}
				<div class="relative flex-shrink-0">
					<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-pink-400">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
						</svg>
					</div>
					<input
						type="text"
						bind:value={appealSearchQuery}
						placeholder="Search appeals by username, email, or message..."
						class="w-full pl-8 pr-3 py-1.5 bg-pink-50 border border-pink-300 rounded-xl text-xs font-bold text-pink-950 placeholder:text-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all"
					/>
				</div>
			{/if}

			<!-- Appeals List (Scrollable - Compact Chat Style) -->
			<div class="overflow-y-auto flex-1 space-y-2 pr-1">
				{#if reactivationRequests.length === 0}
					<div class="text-center py-12 bg-pink-50/50 rounded-2xl border border-pink-100">
						<div class="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-2 border border-emerald-200">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
								<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</div>
						<p class="text-sm font-bold text-pink-900">No Pending Appeals</p>
						<p class="text-xs text-pink-500 font-medium mt-0.5">All account suspension appeals have been reviewed and resolved.</p>
					</div>
				{:else if filteredAppeals.length === 0}
					<div class="text-center py-8 text-pink-400 font-medium text-xs">
						No appeals match "{appealSearchQuery}".
					</div>
				{:else}
					{#each filteredAppeals as reqItem (reqItem.id || reqItem.user_id)}
						{@const reqUser = usersList.find(u => u.id === reqItem.user_id || u.username === reqItem.username)}
						{@const isNew = isAppealNew(reqItem)}
						<!-- Chat-like compact user row with green highlight if new within 1 day -->
						<button
							type="button"
							onclick={() => openAppealReview(reqItem)}
							class="w-full p-2.5 sm:p-3 rounded-2xl border-2 transition-all flex items-center justify-between gap-3 text-left cursor-pointer group shadow-2xs {isNew ? 'bg-emerald-50/60 hover:bg-emerald-100/60 border-emerald-300 hover:border-emerald-400' : 'bg-white hover:bg-pink-50/70 border-pink-200 hover:border-pink-300'}"
						>
							<!-- Avatar & User Info -->
							<div class="flex items-center space-x-3 min-w-0">
								<div class="relative flex-shrink-0">
									<div class="w-10 h-10 rounded-full text-white font-bold flex items-center justify-center text-xs shadow-xs overflow-hidden border group-hover:scale-105 transition-transform {isNew ? 'bg-emerald-500 border-emerald-300' : 'bg-pink-400 border-pink-300'}">
										{#if (reqUser?.avatar_url || reqItem.avatar_url)}
											<img src={reqUser?.avatar_url || reqItem.avatar_url} alt="" class="w-full h-full object-cover" />
										{:else}
											{(reqItem.username || reqItem.email)?.charAt(0).toUpperCase()}
										{/if}
									</div>
									{#if isNew}
										<span class="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white ring-2 ring-emerald-300"></span>
									{:else if !reqItem.is_read}
										<span class="absolute -top-0.5 -right-0.5 w-3 h-3 bg-pink-500 rounded-full border-2 border-white ring-2 ring-pink-300"></span>
									{/if}
								</div>
								<div class="min-w-0">
									<div class="flex items-center gap-1.5 flex-wrap">
										<span class="font-bold text-sm text-pink-950 group-hover:text-pink-600 transition-colors truncate">@{reqItem.username}</span>
										<span class="text-[10px] text-pink-400 font-mono flex-shrink-0">#{reqItem.user_id}</span>
										{#if isNew}
											<span class="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
												NEW
											</span>
										{/if}
									</div>
									<span class="text-xs text-pink-500 font-mono block truncate">{reqItem.email || '—'}</span>
								</div>
							</div>

							<!-- Right Meta & View Button -->
							<div class="flex items-center gap-2 flex-shrink-0">
								<span class="text-[10px] {isNew ? 'text-emerald-700 font-bold' : 'text-pink-400'} font-mono hidden sm:inline-block">
									{formatDate(reqItem.created_at || reqItem.updated_at)}
								</span>
								<div class="px-2.5 py-1 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 {isNew ? 'bg-emerald-100 group-hover:bg-emerald-200 text-emerald-800 border border-emerald-300' : 'bg-pink-100 group-hover:bg-pink-200 text-pink-700'}">
									<span>View</span>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3">
										<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
									</svg>
								</div>
							</div>
						</button>
					{/each}
				{/if}
			</div>

			<!-- Modal Footer -->
			<div class="border-t border-pink-100 pt-3 flex justify-end flex-shrink-0">
				<button
					type="button"
					onclick={() => showAppealsListModal = false}
					class="px-4 py-2 bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Dedicated Individual Appeal Review Details Modal -->
{#if viewingAppealModal}
	{@const appealUser = usersList.find(u => u.id === viewingAppealModal.user_id || u.username === viewingAppealModal.username)}
	{@const isNew = isAppealNew(viewingAppealModal)}
	<div class="fixed inset-0 z-50 bg-black/10 backdrop-blur-[1.5px] flex items-center justify-center p-4 animate-fade-in">
		<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-modal-content max-h-[90vh] flex flex-col">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-pink-100 pb-3 flex-shrink-0">
				<div class="flex items-center gap-2.5">
					<div class="p-2 {isNew ? 'bg-emerald-100 text-emerald-600' : 'bg-pink-100 text-pink-600'} rounded-xl">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
						</svg>
					</div>
					<div>
						<div class="flex items-center gap-2">
							<h3 class="text-sm font-black text-pink-950">Review Appeal</h3>
							{#if isNew}
								<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
									NEW
								</span>
							{/if}
						</div>
						<p class="text-[11px] text-pink-500 font-medium">Submitted by @{viewingAppealModal.username}</p>
					</div>
				</div>
				<button
					onclick={() => viewingAppealModal = null}
					aria-label="Close"
					class="text-pink-400 hover:text-pink-600 cursor-pointer p-1 rounded-lg hover:bg-pink-50"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- User Details Card -->
			<div class="overflow-y-auto flex-1 space-y-3.5 pr-1">
				<div class="flex items-center space-x-3.5 p-3.5 border rounded-2xl {isNew ? 'bg-emerald-50/50 border-emerald-200' : 'bg-pink-50/70 border-pink-200'}">
					<div class="w-12 h-12 rounded-full {isNew ? 'bg-emerald-500 border-emerald-300' : 'bg-pink-400 border-pink-300'} text-white font-bold flex items-center justify-center text-sm flex-shrink-0 shadow-xs overflow-hidden border-2">
						{#if (appealUser?.avatar_url || viewingAppealModal.avatar_url)}
							<img src={appealUser?.avatar_url || viewingAppealModal.avatar_url} alt="" class="w-full h-full object-cover" />
						{:else}
							{(viewingAppealModal.username || viewingAppealModal.email)?.charAt(0).toUpperCase()}
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-1.5 flex-wrap">
							<span class="font-bold text-sm text-pink-950">@{viewingAppealModal.username}</span>
							<span class="text-[10px] text-pink-400 font-mono">#{viewingAppealModal.user_id}</span>
							<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">Suspended</span>
						</div>
						<span class="text-xs text-pink-500 font-mono block truncate">{viewingAppealModal.email || '—'}</span>
						<span class="text-[10px] {isNew ? 'text-emerald-700 font-bold' : 'text-pink-400 font-medium'} block mt-0.5">Submitted: {formatDate(viewingAppealModal.created_at || viewingAppealModal.updated_at)}</span>
					</div>
				</div>

				<!-- Appeal Message Box -->
				<div class="space-y-1.5">
					<div class="flex items-center justify-between text-[11px] font-bold text-pink-800">
						<span>Appeal Reason / Explanation:</span>
					</div>
					<div class="p-3.5 bg-pink-50/50 border border-pink-200 rounded-2xl text-xs text-pink-950 font-medium whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-y-auto">
						{#if viewingAppealModal.reason}
							"{viewingAppealModal.reason}"
						{:else}
							<span class="text-slate-400 italic">No custom appeal note provided by user.</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Actions -->
			<div class="border-t border-pink-100 pt-3 flex items-center justify-between gap-2 flex-shrink-0">
				<button
					type="button"
					onclick={() => viewingAppealModal = null}
					class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
				>
					Back
				</button>
				<div class="flex items-center gap-2">
					<button
						type="button"
						onclick={async () => {
							const item = viewingAppealModal;
							viewingAppealModal = null;
							await respondReactivation(item, 'dismiss');
						}}
						disabled={isProcessingAppeal}
						class="px-3.5 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap"
					>
						Dismiss
					</button>
					<button
						type="button"
						onclick={async () => {
							const item = viewingAppealModal;
							viewingAppealModal = null;
							await respondReactivation(item, 'approve');
						}}
						disabled={isProcessingAppeal}
						class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm whitespace-nowrap"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
						</svg>
						<span>Approve & Reactivate</span>
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Account Status Filter Modal -->
{#if showFilterModal}
	<div class="fixed inset-0 z-50 bg-black/10 backdrop-blur-[1.5px] flex items-center justify-center p-4 animate-fade-in">
		<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-sm w-full p-5 space-y-4 animate-modal-content">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-pink-100 pb-3">
				<div class="flex items-center gap-2.5">
					<div class="p-1.5 bg-pink-100 text-pink-600 rounded-xl">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
						</svg>
					</div>
					<div>
						<h3 class="text-sm font-black text-pink-950">Filter Accounts</h3>
						<p class="text-[11px] text-pink-500 font-medium">Select view criteria for directory</p>
					</div>
				</div>
				<button
					onclick={() => showFilterModal = false}
					aria-label="Close"
					class="text-pink-400 hover:text-pink-600 cursor-pointer p-1 rounded-lg hover:bg-pink-50"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Filter Options List -->
			<div class="space-y-2">
				{#each [
					{ id: 'all', label: 'All Accounts', count: usersList.length, badgeBg: 'bg-pink-100 text-pink-800' },
					{ id: 'active', label: 'Active Only', count: usersList.filter(u => u.status === 'active').length, badgeBg: 'bg-emerald-100 text-emerald-800 border border-emerald-300' },
					{ id: 'suspended', label: 'Suspended Only', count: usersList.filter(u => u.status === 'suspended').length, badgeBg: 'bg-rose-100 text-rose-800 border border-rose-300' },
					{ id: 'appeals', label: 'Appeals Pending', count: reactivationRequests.length, badgeBg: 'bg-amber-100 text-amber-900 border border-amber-300' }
				] as opt}
					<button
						type="button"
						onclick={() => { selectedStatusFilter = opt.id; showFilterModal = false; }}
						class="w-full p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between {selectedStatusFilter === opt.id ? 'bg-pink-50 border-pink-400 shadow-2xs' : 'bg-white hover:bg-pink-50/50 border-pink-200'}"
					>
						<div class="flex items-center gap-2.5">
							<div class="w-4 h-4 rounded-full border-2 flex items-center justify-center {selectedStatusFilter === opt.id ? 'border-pink-500 bg-pink-500 text-white' : 'border-pink-300 bg-white'}">
								{#if selectedStatusFilter === opt.id}
									<div class="w-1.5 h-1.5 rounded-full bg-white"></div>
								{/if}
							</div>
							<span class="text-xs font-bold {selectedStatusFilter === opt.id ? 'text-pink-950' : 'text-pink-800'}">{opt.label}</span>
						</div>
						<span class="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono {opt.badgeBg}">
							{opt.count}
						</span>
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<!-- Install Admin App Instructions Modal -->
{#if showInstallHelper}
	<div class="fixed inset-0 z-50 bg-black/10 backdrop-blur-[1.5px] flex items-center justify-center p-4 animate-fade-in">
		<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-sm w-full p-5 space-y-4 animate-modal-content">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-pink-100 pb-3">
				<div class="flex items-center gap-2.5">
					<div class="p-2 bg-pink-100 text-pink-600 rounded-xl">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
						</svg>
					</div>
					<div>
						<h3 class="text-sm font-black text-pink-950">Install Admin App</h3>
						<p class="text-[11px] text-pink-500 font-medium">Add to your Home Screen</p>
					</div>
				</div>
				<button
					onclick={() => showInstallHelper = false}
					aria-label="Close"
					class="text-pink-400 hover:text-pink-600 cursor-pointer p-1 rounded-lg hover:bg-pink-50"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Steps -->
			<div class="space-y-3 py-1 text-left text-xs text-pink-950">
				<div class="p-3 bg-pink-50/70 border border-pink-200 rounded-2xl space-y-2">
					<div class="flex items-start gap-2.5">
						<span class="w-5 h-5 rounded-full bg-pink-500 text-white font-bold flex items-center justify-center text-[10px] flex-shrink-0">1</span>
						<p class="leading-relaxed">In your mobile browser menu (or Safari Share button <span class="font-bold text-pink-600">⎋</span> / Chrome menu <span class="font-bold text-pink-600">⋮</span>), tap <span class="font-bold text-pink-700">Share / Options</span>.</p>
					</div>
					<div class="flex items-start gap-2.5">
						<span class="w-5 h-5 rounded-full bg-pink-500 text-white font-bold flex items-center justify-center text-[10px] flex-shrink-0">2</span>
						<p class="leading-relaxed">Select <span class="font-bold text-pink-700">"Add to Home Screen"</span> or <span class="font-bold text-pink-700">"Install App"</span>.</p>
					</div>
					<div class="flex items-start gap-2.5">
						<span class="w-5 h-5 rounded-full bg-emerald-500 text-white font-bold flex items-center justify-center text-[10px] flex-shrink-0">3</span>
						<p class="leading-relaxed"><span class="font-bold text-emerald-700">ChronoMuse Admin</span> will be installed as an independent standalone app icon on your home screen!</p>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="border-t border-pink-100 pt-3 flex justify-end">
				<button
					type="button"
					onclick={() => showInstallHelper = false}
					class="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
				>
					Got it!
				</button>
			</div>
		</div>
	</div>
{/if}
