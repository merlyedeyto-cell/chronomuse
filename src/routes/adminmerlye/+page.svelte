<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabaseClient';
	import {
		AlertCircle, Lock, ArrowLeft, LogOut, CheckCircle2, Users,
		BookOpen, Pin, FileText, MessageSquare, Search, KeyRound,
		Trash2, X, Download, Smartphone, HelpCircle, Lightbulb
	} from 'lucide-svelte';
	import AdminFeedbacksSection from '$lib/admin/AdminFeedbacksSection.svelte';
	import AdminChatModal from '$lib/admin/AdminChatModal.svelte';

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
		total_feedbacks: 0,
		new_feedbacks: 0,
		active_today: 0,
		db_latency_ms: 0,
		database_status: 'Operational',
		server_time: new Date().toISOString()
	});

	let usersList = $state([]);
	let userSearchQuery = $state('');
	let activeAdminTab = $state('accounts'); // 'accounts' | 'feedbacks'
	let feedbacksList = $state([]);
	let isLoadingData = $state(false);
	let actionMessage = $state('');
	let errorMessage = $state('');
	let activeChatFeedback = $state(null);
	let isChatModalOpen = $state(false);

	let loadSeq = 0;
	let refreshDebounceTimer = null;

	function debouncedLoadAdminData(delay = 600) {
		if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
		refreshDebounceTimer = setTimeout(() => {
			if (isAuthenticated && !isLoadingData) {
				loadAdminData(true);
			}
		}, delay);
	}

	// Modals State
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
	let isFloatingDismissed = $state(false);

	function dismissFloatingInstall() {
		isFloatingDismissed = true;
		if (typeof window !== 'undefined') {
			sessionStorage.setItem('chronomuse_admin_install_dismissed', '1');
		}
	}

	function handleInstallAdminApp() {
		if (deferredInstallPrompt) {
			deferredInstallPrompt.prompt();
			deferredInstallPrompt.userChoice.then((choiceResult) => {
				if (choiceResult.outcome === 'accepted') {
					showNotice('Installing ChronoMuse Admin app...');
					isInstallable = false;
					isAppInstalled = true;
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

			if (sessionStorage.getItem('chronomuse_admin_install_dismissed') === '1') {
				isFloatingDismissed = true;
			}

			// Dynamically activate Admin Web App Manifest
			if (typeof document !== 'undefined') {
				const manifestLink = document.getElementById('app-manifest-link') || document.querySelector('link[rel="manifest"]');
				if (manifestLink) {
					manifestLink.setAttribute('href', '/manifest-admin.json');
				}
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

		// Polling interval for background metrics (60s fallback interval)
		const autoRefreshInterval = setInterval(() => {
			if (typeof document !== 'undefined' && document.hidden) return;
			if (isAuthenticated && !isLoadingData) {
				loadAdminData(true);
			}
		}, 60000);

		// Postgres Table Changes (DB-level sync with debounce)
		const dbChannel = supabase.channel('chronomuse_admin_db_sync');
		dbChannel
			.on('postgres_changes', {
				event: 'UPDATE',
				schema: 'public',
				table: 'chronomuse_users'
			}, () => {
				// Debounce (1500ms) so user activity heartbeats don't thrash the admin list
				debouncedLoadAdminData(1500);
			})
			.on('postgres_changes', {
				event: 'INSERT',
				schema: 'public',
				table: 'chronomuse_messages'
			}, () => {
				debouncedLoadAdminData(1500);
			})
			.on('postgres_changes', {
				event: '*',
				schema: 'public',
				table: 'chronomuse_feedbacks'
			}, () => {
				debouncedLoadAdminData(1000);
			})
			.subscribe();

		return () => {
			clearInterval(timerInterval);
			clearInterval(autoRefreshInterval);
			if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
			try {
				supabase.removeChannel(dbChannel);
			} catch (e) {}
			if (typeof document !== 'undefined') {
				const manifestLink = document.getElementById('app-manifest-link') || document.querySelector('link[rel="manifest"]');
				if (manifestLink) {
					manifestLink.setAttribute('href', '/manifest.json');
				}
			}
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

		const currentSeq = ++loadSeq;

		try {
			const [metricsRes, usersRes, feedbacksRes] = await Promise.all([
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
					body: JSON.stringify({ passcode: ADMIN_PASSCODE, action: 'get_feedbacks' })
				}).then(r => r.json()).catch(() => ({ success: false }))
			]);

			// If a newer load request was made, ignore stale results
			if (currentSeq !== loadSeq) return;

			if (metricsRes?.success && metricsRes.data?.metrics) {
				metrics = metricsRes.data.metrics;
			}
			if (usersRes?.success && Array.isArray(usersRes.data?.users)) {
				usersList = usersRes.data.users;
			}
			if (feedbacksRes?.success && Array.isArray(feedbacksRes.data?.feedbacks)) {
				feedbacksList = feedbacksRes.data.feedbacks;
			}
		} catch (err) {
			console.error('Error loading admin data:', err);
			if (!isBackground && currentSeq === loadSeq) {
				showNotice('Failed to connect to Admin API', true);
			}
		} finally {
			if (!isBackground && currentSeq === loadSeq) {
				isLoadingData = false;
			}
		}
	}

	async function handleUpdateFeedbackStatus(feedbackId, newStatus) {
		try {
			const res = await fetch('/api/admin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passcode: ADMIN_PASSCODE,
					action: 'update_feedback_status',
					feedback_id: feedbackId,
					status: newStatus
				})
			});
			const data = await res.json();
			if (data.success) {
				feedbacksList = feedbacksList.map(f => f.id === feedbackId ? { ...f, status: newStatus } : f);
				showNotice(`Concern marked as ${newStatus}`);
			} else {
				showNotice(data.error || 'Failed to update feedback status', true);
			}
		} catch (err) {
			showNotice('Network error updating feedback', true);
		}
	}

	async function handleDeleteFeedback(feedbackId) {
		try {
			const res = await fetch('/api/admin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passcode: ADMIN_PASSCODE,
					action: 'delete_feedback',
					feedback_id: feedbackId
				})
			});
			const data = await res.json();
			if (data.success) {
				feedbacksList = feedbacksList.filter(f => f.id !== feedbackId);
				showNotice('Concern record removed');
			} else {
				showNotice(data.error || 'Failed to delete feedback', true);
			}
		} catch (err) {
			showNotice('Network error deleting feedback', true);
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
			if (!query) return true;
			return (
				u.username?.toLowerCase().includes(query) || 
				u.email?.toLowerCase().includes(query) ||
				String(u.id).includes(query)
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

<div class="min-h-screen bg-[#fff0f5] text-pink-950 font-sans p-3 sm:p-6 flex flex-col antialiased">
	{#if isCheckingAuth}
		<div class="flex-1 flex items-center justify-center">
			<div class="animate-spin h-8 w-8 border-3 border-pink-200 border-t-[#f43f8e] rounded-full"></div>
		</div>
	{:else if !isAuthenticated}
		<!-- Secret Admin Passcode Screen -->
		<div class="flex-1 flex items-center justify-center p-4">
			<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 shadow-[0_8px_30px_rgba(244,114,182,0.12)] rounded-3xl max-w-sm w-full p-6 sm:p-7 text-center animate-fade-in">
				<!-- ChronoMuse Brand Logo & Title -->
				<div class="mb-5">
					<img
						src="/logo.png"
						alt="ChronoMuse"
						class="w-14 h-14 mx-auto mb-2.5 rounded-2xl object-contain border border-pink-100 bg-black p-1 shadow-2xs hover:scale-105 transition-transform duration-300"
					/>
					<h1 class="text-xl sm:text-2xl font-black text-[#f43f8e] mb-1 tracking-wider uppercase">CHRONOMUSE</h1>
					<div class="inline-flex items-center gap-1.5 px-3 py-0.5 bg-pink-50 border border-pink-100 text-[#f43f8e] rounded-full text-xs font-bold mb-1 shadow-2xs">
						<span class="w-2 h-2 rounded-full bg-[#f43f8e] animate-pulse"></span>
						<span>Administrative Access</span>
					</div>
					<p class="text-[11px] text-pink-400 font-bold">Central Platform Management Console</p>
				</div>

				{#if authError}
					<div class="mb-4 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2 text-left shadow-2xs">
						<AlertCircle class="w-4 h-4 flex-shrink-0" strokeWidth={2} />
						<span>{authError}</span>
					</div>
				{/if}

				<form onsubmit={handlePasscodeSubmit} class="space-y-4">
					<div>
						<label for="passcode_input" class="block text-xs font-bold text-pink-900 text-left mb-1.5">Security Passcode</label>
						<input
							id="passcode_input"
							type="password"
							maxlength="12"
							bind:value={passcodeInput}
							placeholder="Enter passcode..."
							class="w-full px-3.5 py-2.5 bg-pink-50/60 border border-pink-200/80 rounded-xl text-center text-lg font-mono tracking-widest text-pink-950 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:bg-white transition-all shadow-inner"
						/>
					</div>

					<button
						type="submit"
						class="w-full py-2.5 bg-[#f43f8e] hover:bg-[#e0337f] active:scale-95 text-white font-bold text-sm rounded-xl shadow-md shadow-pink-300/30 transition-all cursor-pointer flex items-center justify-center gap-2"
					>
						<Lock class="w-4 h-4" strokeWidth={2} />
						<span>Authenticate Console</span>
					</button>

					<button
						type="button"
						onclick={() => goto('/dashboard')}
						class="w-full py-2.5 bg-pink-50 hover:bg-pink-100 active:scale-98 text-pink-700 font-bold text-xs rounded-xl border border-pink-100/80 shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
					>
						<ArrowLeft class="w-4 h-4" strokeWidth={2} />
						<span>Return to App</span>
					</button>
				</form>
			</div>
		</div>
	{:else}
		<!-- Authenticated Admin Dashboard (ChronoMuse Theme) -->
		<div class="container mx-auto max-w-6xl space-y-4">
			<!-- Header -->
			<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 shadow-[0_4px_20px_rgba(244,114,182,0.08)] rounded-2xl sm:rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
				<div class="flex items-center space-x-3 min-w-0">
					<img src="/logo.png" alt="ChronoMuse" class="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl object-contain border border-pink-100 flex-shrink-0 bg-black shadow-2xs p-1" />
					<div class="min-w-0 flex items-center gap-2 flex-wrap">
						<h1 class="text-base sm:text-lg font-black text-pink-950 truncate">ChronoMuse Admin</h1>
						<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[11px] font-black border border-emerald-200 shadow-2xs whitespace-nowrap">
							<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
							Connected
						</span>
					</div>
				</div>

				<div class="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
					<button
						onclick={() => goto('/dashboard')}
						class="flex-1 sm:flex-initial px-3.5 py-2 bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-100 font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer text-center whitespace-nowrap active:scale-95"
					>
						Go to App
					</button>
					<button
						onclick={handleLogout}
						class="flex-1 sm:flex-initial px-3.5 py-2 bg-[#f43f8e] hover:bg-[#e0337f] text-white font-bold text-xs rounded-xl shadow-md shadow-pink-300/30 transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap active:scale-95"
					>
						<LogOut class="w-3.5 h-3.5" strokeWidth={2} />
						<span>Exit</span>
					</button>
				</div>
			</div>

			<!-- Notice Alerts -->
			{#if actionMessage}
				<div class="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-2xs animate-fade-in">
					<CheckCircle2 class="w-4 h-4 text-emerald-600 flex-shrink-0" strokeWidth={2} />
					<span>{actionMessage}</span>
				</div>
			{/if}

			{#if errorMessage}
				<div class="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-2xs animate-fade-in">
					<AlertCircle class="w-4 h-4 text-rose-600 flex-shrink-0" strokeWidth={2} />
					<span>{errorMessage}</span>
				</div>
			{/if}

			<!-- Metric Cards Grid -->
			<div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3">
				<!-- Registered Users -->
				<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-[0_4px_20px_rgba(244,114,182,0.06)] hover:border-pink-200 transition-all">
					<div class="flex items-center justify-between mb-1.5 sm:mb-2">
						<span class="text-[10px] sm:text-[11px] font-black text-[#f43f8e] uppercase tracking-wider">Users</span>
						<div class="p-1 sm:p-1.5 bg-pink-50 text-[#f43f8e] border border-pink-100/80 rounded-xl shadow-2xs">
							<Users class="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2} />
						</div>
					</div>
					<div>
						<p class="text-xl sm:text-2xl font-black text-pink-950">{metrics.total_users}</p>
						<p class="text-[9px] sm:text-[10px] text-pink-400 font-bold">Registered Accounts</p>
					</div>
				</div>

				<!-- Active Today -->
				<div class="bg-white/95 backdrop-blur-md border border-emerald-100/90 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-[0_4px_20px_rgba(16,185,129,0.06)] hover:border-emerald-200 transition-all">
					<div class="flex items-center justify-between mb-1.5 sm:mb-2">
						<span class="text-[10px] sm:text-[11px] font-black text-emerald-700 uppercase tracking-wider">Active (24h)</span>
						<div class="p-1 sm:p-1.5 bg-emerald-50 text-emerald-600 border border-emerald-100/80 rounded-xl shadow-2xs">
							<CheckCircle2 class="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2} />
						</div>
					</div>
					<div>
						<p class="text-xl sm:text-2xl font-black text-emerald-950">{metrics.active_today}</p>
						<p class="text-[9px] sm:text-[10px] text-emerald-600 font-bold">Logged in 24h</p>
					</div>
				</div>

				<!-- Memories Recorded -->
				<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-[0_4px_20px_rgba(244,114,182,0.06)] hover:border-pink-200 transition-all">
					<div class="flex items-center justify-between mb-1.5 sm:mb-2">
						<span class="text-[10px] sm:text-[11px] font-black text-[#f43f8e] uppercase tracking-wider">Memories</span>
						<div class="p-1 sm:p-1.5 bg-pink-50 text-[#f43f8e] border border-pink-100/80 rounded-xl shadow-2xs">
							<BookOpen class="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2} />
						</div>
					</div>
					<div>
						<p class="text-xl sm:text-2xl font-black text-pink-950">{metrics.total_memories}</p>
						<p class="text-[9px] sm:text-[10px] text-pink-400 font-bold">Calendar Entries</p>
					</div>
				</div>

				<!-- Pinned Dates -->
				<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-[0_4px_20px_rgba(244,114,182,0.06)] hover:border-pink-200 transition-all">
					<div class="flex items-center justify-between mb-1.5 sm:mb-2">
						<span class="text-[10px] sm:text-[11px] font-black text-[#f43f8e] uppercase tracking-wider">Pinned Dates</span>
						<div class="p-1 sm:p-1.5 bg-pink-50 text-[#f43f8e] border border-pink-100/80 rounded-xl shadow-2xs">
							<Pin class="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2} />
						</div>
					</div>
					<div>
						<p class="text-xl sm:text-2xl font-black text-pink-950">{metrics.total_pinned_dates}</p>
						<p class="text-[9px] sm:text-[10px] text-pink-400 font-bold">Pinned Days</p>
					</div>
				</div>

				<!-- Live Thoughts / Notes -->
				<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-[0_4px_20px_rgba(244,114,182,0.06)] hover:border-pink-200 transition-all">
					<div class="flex items-center justify-between mb-1.5 sm:mb-2">
						<span class="text-[10px] sm:text-[11px] font-black text-[#f43f8e] uppercase tracking-wider">Notes</span>
						<div class="p-1 sm:p-1.5 bg-pink-50 text-[#f43f8e] border border-pink-100/80 rounded-xl shadow-2xs">
							<FileText class="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2} />
						</div>
					</div>
					<div>
						<p class="text-xl sm:text-2xl font-black text-pink-950">{metrics.total_notes}</p>
						<p class="text-[9px] sm:text-[10px] text-pink-400 font-bold">Live Thoughts</p>
					</div>
				</div>

				<!-- Messages Exchanged -->
				<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-[0_4px_20px_rgba(244,114,182,0.06)] hover:border-pink-200 transition-all">
					<div class="flex items-center justify-between mb-1.5 sm:mb-2">
						<span class="text-[10px] sm:text-[11px] font-black text-[#f43f8e] uppercase tracking-wider">Messages</span>
						<div class="p-1 sm:p-1.5 bg-pink-50 text-[#f43f8e] border border-pink-100/80 rounded-xl shadow-2xs">
							<MessageSquare class="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2} />
						</div>
					</div>
					<div>
						<p class="text-xl sm:text-2xl font-black text-pink-950">{metrics.total_messages}</p>
						<p class="text-[9px] sm:text-[10px] text-pink-400 font-bold">Chat Transcripts</p>
					</div>
				</div>

				<!-- Concerns & Suggestions (Hidden on mobile to maintain 6-card symmetrical grid, handled by tab switcher) -->
				<button
					type="button"
					onclick={() => activeAdminTab = 'feedbacks'}
					class="hidden sm:flex bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl p-3 sm:p-3.5 flex-col justify-between shadow-[0_4px_20px_rgba(244,114,182,0.06)] hover:border-[#f43f8e]/60 hover:scale-[1.02] active:scale-95 text-left transition-all cursor-pointer {activeAdminTab === 'feedbacks' ? 'ring-2 ring-[#f43f8e]/50 bg-pink-50/40' : ''}"
				>
					<div class="flex items-center justify-between mb-1.5 sm:mb-2 w-full">
						<span class="text-[10px] sm:text-[11px] font-black text-[#f43f8e] uppercase tracking-wider">Concerns</span>
						<div class="p-1 sm:p-1.5 bg-pink-50 text-[#f43f8e] border border-pink-100/80 rounded-xl shadow-2xs relative">
							<HelpCircle class="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2} />
							{#if (metrics.new_feedbacks || feedbacksList.filter(f => f.status === 'new').length) > 0}
								<span class="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full animate-ping"></span>
								<span class="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full"></span>
							{/if}
						</div>
					</div>
					<div>
						<p class="text-xl sm:text-2xl font-black text-pink-950">{feedbacksList.length || metrics.total_feedbacks || 0}</p>
						<p class="text-[9px] sm:text-[10px] text-pink-400 font-bold truncate">
							{(metrics.new_feedbacks || feedbacksList.filter(f => f.status === 'new').length) > 0 
								? `${metrics.new_feedbacks || feedbacksList.filter(f => f.status === 'new').length} New Unresolved` 
								: 'User Inquiries'}
						</p>
					</div>
				</button>
			</div>

			<!-- Tab Switcher for Admin Directories -->
			<div class="grid grid-cols-2 sm:inline-flex items-center gap-1 sm:gap-1.5 p-1 bg-[#fff0f5] border border-pink-200/70 rounded-2xl sm:rounded-full shadow-2xs w-full sm:w-auto">
				<button
					type="button"
					onclick={() => activeAdminTab = 'accounts'}
					class="w-full sm:w-auto px-2 sm:px-5 py-2.5 sm:py-2 rounded-xl sm:rounded-full text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer active:scale-95 {activeAdminTab === 'accounts' ? 'bg-[#f43f8e] text-white shadow-sm' : 'text-[#f43f8e] hover:bg-pink-100/50'}"
				>
					<Users class="w-4 h-4 shrink-0" />
					<span class="sm:hidden">Accounts</span>
					<span class="hidden sm:inline">Accounts Directory</span>
					<span class="px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black transition-colors shrink-0 {activeAdminTab === 'accounts' ? 'bg-white/25 text-white' : 'bg-pink-100/80 text-[#f43f8e]'}">
						{usersList.length}
					</span>
				</button>

				<button
					type="button"
					onclick={() => activeAdminTab = 'feedbacks'}
					class="w-full sm:w-auto px-2 sm:px-5 py-2.5 sm:py-2 rounded-xl sm:rounded-full text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer relative active:scale-95 {activeAdminTab === 'feedbacks' ? 'bg-[#f43f8e] text-white shadow-sm' : 'text-[#f43f8e] hover:bg-pink-100/50'}"
				>
					<MessageSquare class="w-4 h-4 shrink-0" />
					<span class="sm:hidden">Concerns</span>
					<span class="hidden sm:inline">User Concerns & Feedback</span>
					<span class="px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black transition-colors shrink-0 {activeAdminTab === 'feedbacks' ? 'bg-white/25 text-white' : 'bg-pink-100/80 text-[#f43f8e]'}">
						{feedbacksList.length}
					</span>
					{#if feedbacksList.filter(f => f.status === 'new').length > 0}
						<span class="relative flex h-2 w-2 shrink-0">
							<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
							<span class="relative inline-flex rounded-full h-2 w-2 bg-rose-500 shadow-xs"></span>
						</span>
					{/if}
				</button>
			</div>

			{#if activeAdminTab === 'accounts'}
			<!-- Users Management Directory -->
			<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 shadow-[0_4px_20px_rgba(244,114,182,0.08)] rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-4">
				<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
					<div>
						<h2 class="text-base font-black text-pink-950">Platform Accounts Directory ({filteredUsers.length})</h2>
						<p class="text-xs text-pink-400 font-bold">Search, reset passwords, and manage registered user profiles</p>
					</div>

					<div class="relative w-full sm:w-72">
						<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-pink-400">
							<Search class="w-3.5 h-3.5" strokeWidth={2} />
						</div>
						<input
							type="text"
							bind:value={userSearchQuery}
							placeholder="Search username, email, or ID..."
							class="w-full pl-8 pr-3 py-2 bg-pink-50/60 border border-pink-200/80 rounded-xl text-xs font-bold text-pink-950 placeholder:text-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:bg-white transition-all shadow-inner"
						/>
					</div>
				</div>

				<!-- Users Table (Slideable on Desktop & Mobile) -->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					bind:this={tableContainerEl}
					onmousedown={onTableMouseDown}
					onmousemove={onTableMouseMove}
					onmouseup={onTableMouseUp}
					onmouseleave={onTableMouseUp}
					role="region"
					aria-label="Accounts table"
					tabindex="0"
					class="overflow-x-auto rounded-2xl border border-pink-100/90 scrollbar-thin scroll-smooth {isTableDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}"
				>
					<table class="w-full min-w-[850px] text-left text-xs">
						<thead>
							<tr class="bg-pink-50/80 text-pink-950 border-b border-pink-100">
								<th class="py-3 px-3.5 font-black whitespace-nowrap">User</th>
								<th class="py-3 px-3.5 font-black whitespace-nowrap">Email</th>
								<th class="py-3 px-3.5 font-black text-center whitespace-nowrap">Memories</th>
								<th class="py-3 px-3.5 font-black text-center whitespace-nowrap">Pinned</th>
								<th class="py-3 px-3.5 font-black text-center whitespace-nowrap">Notes</th>
								<th class="py-3 px-3.5 font-black text-center whitespace-nowrap">Messages</th>
								<th class="py-3 px-3.5 font-black whitespace-nowrap">Joined Date</th>
								<th class="py-3 px-3.5 font-black whitespace-nowrap">Last Active</th>
								<th class="py-3 px-3.5 font-black text-right whitespace-nowrap">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-pink-50">
							{#if isLoadingData && usersList.length === 0}
								<tr>
									<td colspan="9" class="text-center py-8 text-pink-400 font-medium">
										<div class="inline-flex items-center gap-2">
											<div class="animate-spin h-4 w-4 border-2 border-pink-200 border-t-[#f43f8e] rounded-full"></div>
											<span>Loading registered accounts...</span>
										</div>
									</td>
								</tr>
							{:else if filteredUsers.length === 0}
								<tr>
									<td colspan="9" class="text-center py-8 text-pink-400 font-bold">
										No user accounts found matching your search.
									</td>
								</tr>
							{:else}
								{#each filteredUsers as userRow (userRow.id)}
									<tr class="hover:bg-pink-50/40 transition-colors">
										<td class="py-3 px-3.5">
											<div class="flex items-center space-x-2.5">
												<div class="w-7 h-7 rounded-full bg-pink-100 text-[#f43f8e] font-black flex items-center justify-center overflow-hidden flex-shrink-0 text-xs border border-pink-200/60 shadow-2xs">
													{#if userRow.avatar_url}
														<img src={userRow.avatar_url} alt="" class="w-full h-full object-cover" />
													{:else}
														{userRow.username?.charAt(0).toUpperCase()}
													{/if}
												</div>
												<div>
													<span class="font-black text-pink-950 block">@{userRow.username}</span>
													<span class="text-[10px] text-pink-400 font-mono font-bold">ID: #{userRow.id}</span>
												</div>
											</div>
										</td>
										<td class="py-3 px-3.5 text-pink-700 font-mono text-[11px] font-bold">{userRow.email || '—'}</td>
										<td class="py-3 px-3.5 text-center">
											<span class="px-2.5 py-0.5 bg-pink-50 text-[#f43f8e] rounded-full font-bold text-[11px] border border-pink-100 shadow-2xs">
												{userRow.memories_count || 0}
											</span>
										</td>
										<td class="py-3 px-3.5 text-center">
											<span class="px-2.5 py-0.5 bg-pink-50 text-[#f43f8e] rounded-full font-bold text-[11px] border border-pink-100 shadow-2xs">
												{userRow.pinned_count || 0}
											</span>
										</td>
										<td class="py-3 px-3.5 text-center">
											<span class="px-2.5 py-0.5 bg-pink-50 text-[#f43f8e] rounded-full font-bold text-[11px] border border-pink-100 shadow-2xs">
												{userRow.notes_count || 0}
											</span>
										</td>
										<td class="py-3 px-3.5 text-center">
											<span class="px-2.5 py-0.5 bg-pink-50 text-[#f43f8e] rounded-full font-bold text-[11px] border border-pink-100 shadow-2xs">
												{userRow.messages_count || 0}
											</span>
										</td>
										<td class="py-3 px-3.5 text-pink-700 font-medium whitespace-nowrap">
											{formatDate(userRow.created_at)}
										</td>
										<td class="py-3 px-3.5 whitespace-nowrap">
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
										<td class="py-3 px-3.5 text-right">
											<div class="flex items-center justify-end gap-1.5">
												<!-- Reset Password Button -->
												<button
													onclick={() => { selectedUserForPasswordReset = userRow; newPasswordInput = ''; }}
													title="Reset Password"
													class="px-2.5 py-1 text-[#f43f8e] bg-pink-50 hover:bg-pink-100 rounded-lg transition-all cursor-pointer border border-pink-100 font-bold text-[11px] inline-flex items-center gap-1 shadow-2xs active:scale-95"
												>
													<KeyRound class="w-3.5 h-3.5 text-[#f43f8e]" strokeWidth={2} />
													<span>Reset Password</span>
												</button>

												<!-- Delete User Button -->
												<button
													onclick={() => { selectedUserForDelete = userRow; }}
													title="Delete User"
													class="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all cursor-pointer border border-rose-100 active:scale-95"
												>
													<Trash2 class="w-3.5 h-3.5" strokeWidth={2} />
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
			{:else}
				<!-- User Concerns & Suggestions Section -->
				<AdminFeedbacksSection
					feedbacks={feedbacksList}
					isLoading={isLoadingData}
					adminPasscode={ADMIN_PASSCODE}
					onUpdateStatus={handleUpdateFeedbackStatus}
					onDeleteFeedback={handleDeleteFeedback}
					onOpenChat={(item) => {
						activeChatFeedback = item;
						isChatModalOpen = true;
					}}
				/>
			{/if}
		</div>
	{/if}
</div>

<!-- Password Reset Modal -->
{#if selectedUserForPasswordReset}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in font-sans"
		onclick={(e) => { if (e.target === e.currentTarget) { selectedUserForPasswordReset = null; newPasswordInput = ''; } }}
	>
		<div class="bg-white border border-pink-100/90 rounded-3xl shadow-2xl max-w-sm w-full p-5 sm:p-6 space-y-4 animate-modal-content">
			<div class="flex items-center justify-between border-b border-pink-100 pb-3">
				<div class="flex items-center gap-2 text-pink-950 font-black text-sm">
					<div class="w-7 h-7 rounded-lg bg-pink-50 text-[#f43f8e] border border-pink-100 flex items-center justify-center shadow-2xs">
						<KeyRound class="w-4 h-4" strokeWidth={2} />
					</div>
					<span>Reset Password</span>
				</div>
				<button
					onclick={() => { selectedUserForPasswordReset = null; newPasswordInput = ''; }}
					aria-label="Close"
					class="text-pink-400 hover:text-pink-600 p-1 rounded-lg hover:bg-pink-50 transition-colors cursor-pointer"
				>
					<X class="w-4 h-4" strokeWidth={2} />
				</button>
			</div>

			<p class="text-xs text-pink-600 font-medium">
				Setting new password for <span class="font-black text-pink-950">@{selectedUserForPasswordReset.username}</span>:
			</p>

			<form onsubmit={handleResetPassword} class="space-y-3">
				<div>
					<label for="new_pw_input" class="block text-xs font-bold text-pink-900 mb-1.5">New Password (min. 6 chars)</label>
					<input
						id="new_pw_input"
						type="text"
						bind:value={newPasswordInput}
						placeholder="Enter new password..."
						class="w-full px-3.5 py-2.5 bg-pink-50/60 border border-pink-200/80 rounded-xl text-xs font-mono text-pink-950 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:bg-white transition-all shadow-inner"
					/>
				</div>

				<div class="flex items-center justify-end gap-2 pt-2">
					<button
						type="button"
						onclick={() => { selectedUserForPasswordReset = null; newPasswordInput = ''; }}
						class="px-3.5 py-2 bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-bold rounded-xl border border-pink-100/80 shadow-2xs transition-all cursor-pointer active:scale-95"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={isResettingPassword || !newPasswordInput || newPasswordInput.trim().length < 6}
						class="px-4 py-2 bg-[#f43f8e] hover:bg-[#e0337f] disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md shadow-pink-300/30 transition-all cursor-pointer active:scale-95"
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
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in font-sans"
		onclick={(e) => { if (e.target === e.currentTarget) { selectedUserForDelete = null; } }}
	>
		<div class="bg-white border border-pink-100/90 rounded-3xl shadow-2xl max-w-sm w-full p-5 sm:p-6 space-y-4 animate-modal-content text-center">
			<div class="w-12 h-12 bg-rose-50 text-rose-500 rounded-2xl border border-rose-100 flex items-center justify-center mx-auto shadow-xs">
				<AlertCircle class="w-6 h-6" strokeWidth={2} />
			</div>

			<div class="space-y-1">
				<h3 class="text-sm sm:text-base font-black text-pink-950">Delete Account @{selectedUserForDelete.username}?</h3>
				<p class="text-xs text-pink-600/90 font-medium leading-relaxed">
					This action cannot be undone. All memories, notes, pinned dates, and friendships will be deleted permanently.
				</p>
			</div>

			<div class="flex items-center justify-center gap-2.5 pt-1">
				<button
					type="button"
					onclick={() => { selectedUserForDelete = null; }}
					class="w-1/2 py-2.5 bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-black rounded-xl border border-pink-100/80 shadow-2xs transition-all cursor-pointer active:scale-95"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={handleDeleteUser}
					disabled={isDeletingUser}
					class="w-1/2 py-2.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-md shadow-rose-300/30 transition-all cursor-pointer active:scale-95"
				>
					{isDeletingUser ? 'Deleting...' : 'Confirm Delete'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Floating Install Admin Banner -->
{#if !isAppInstalled && !isFloatingDismissed}
	<div 
		class="fixed bottom-4 right-4 z-40 max-w-[340px] bg-white/95 backdrop-blur-md border border-pink-200/90 shadow-[0_8px_30px_rgba(244,114,182,0.18)] rounded-2xl p-3 flex items-center gap-3 animate-fade-in-up"
		role="region"
		aria-label="Install Admin App"
	>
		<img 
			src="/logo.png" 
			alt="ChronoMuse" 
			class="w-10 h-10 object-contain rounded-xl border border-pink-100 p-1 bg-black flex-shrink-0 shadow-2xs"
		/>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-1.5">
				<span class="text-xs font-black text-pink-950 truncate">Install Admin App</span>
				<span class="px-1.5 py-0.2 bg-pink-50 border border-pink-100 text-[#f43f8e] rounded-md text-[9px] font-extrabold uppercase">App</span>
			</div>
			<p class="text-[11px] text-pink-400 font-bold leading-tight truncate">Independent admin portal shortcut</p>
		</div>
		<div class="flex items-center gap-1 flex-shrink-0">
			<button
				type="button"
				onclick={handleInstallAdminApp}
				class="px-2.5 py-1.5 bg-[#f43f8e] hover:bg-[#e0337f] active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1"
				title="Install ChronoMuse Admin App"
			>
				<Download class="w-3.5 h-3.5" strokeWidth={2} />
				<span>Install</span>
			</button>
			<button
				type="button"
				onclick={dismissFloatingInstall}
				aria-label="Close"
				class="p-1.5 text-pink-400 hover:text-[#f43f8e] hover:bg-pink-50 rounded-lg transition-colors cursor-pointer"
				title="Close"
			>
				<X class="w-4 h-4" strokeWidth={2.5} />
			</button>
		</div>
	</div>
{/if}

<!-- Install Admin App Instructions Modal -->
{#if showInstallHelper}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in font-sans"
		onclick={(e) => { if (e.target === e.currentTarget) showInstallHelper = false; }}
	>
		<div class="bg-white border border-pink-100/90 rounded-3xl shadow-2xl max-w-sm w-full p-5 space-y-4 animate-modal-content">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-pink-100 pb-3">
				<div class="flex items-center gap-2.5">
					<div class="p-2 bg-pink-50 text-[#f43f8e] rounded-xl border border-pink-100 shadow-2xs">
						<Smartphone class="w-4 h-4" strokeWidth={2} />
					</div>
					<div>
						<h3 class="text-sm font-black text-pink-950">Install Admin App</h3>
						<p class="text-[11px] text-pink-400 font-bold">Add to your Home Screen</p>
					</div>
				</div>
				<button
					onclick={() => showInstallHelper = false}
					aria-label="Close"
					class="text-pink-400 hover:text-pink-600 cursor-pointer p-1 rounded-lg hover:bg-pink-50 transition-colors"
				>
					<X class="w-5 h-5" strokeWidth={2} />
				</button>
			</div>

			<!-- Steps -->
			<div class="space-y-3 py-1 text-left text-xs text-pink-950">
				<div class="p-3 bg-pink-50/50 border border-pink-100 rounded-2xl space-y-2">
					<div class="flex items-start gap-2.5">
						<span class="w-5 h-5 rounded-full bg-[#f43f8e] text-white font-bold flex items-center justify-center text-[10px] flex-shrink-0 shadow-xs">1</span>
						<p class="leading-relaxed">In your mobile browser menu (or Safari Share button <span class="font-bold text-[#f43f8e]">⎋</span> / Chrome menu <span class="font-bold text-[#f43f8e]">⋮</span>), tap <span class="font-bold text-pink-950">Share / Options</span>.</p>
					</div>
					<div class="flex items-start gap-2.5">
						<span class="w-5 h-5 rounded-full bg-[#f43f8e] text-white font-bold flex items-center justify-center text-[10px] flex-shrink-0 shadow-xs">2</span>
						<p class="leading-relaxed">Select <span class="font-bold text-[#f43f8e]">"Add to Home Screen"</span> or <span class="font-bold text-[#f43f8e]">"Install App"</span>.</p>
					</div>
					<div class="flex items-start gap-2.5">
						<span class="w-5 h-5 rounded-full bg-emerald-500 text-white font-bold flex items-center justify-center text-[10px] flex-shrink-0 shadow-xs">3</span>
						<p class="leading-relaxed"><span class="font-bold text-emerald-700">ChronoMuse Admin</span> will be installed as an independent standalone app icon on your home screen!</p>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="border-t border-pink-100 pt-3 flex justify-end">
				<button
					type="button"
					onclick={() => showInstallHelper = false}
					class="px-4 py-2 bg-[#f43f8e] hover:bg-[#e0337f] text-white font-bold text-xs rounded-xl shadow-md shadow-pink-300/30 transition-all cursor-pointer active:scale-95"
				>
					Got it!
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Admin Direct Chat Modal -->
<AdminChatModal
	isOpen={isChatModalOpen}
	feedback={activeChatFeedback}
	adminPasscode={ADMIN_PASSCODE}
	onClose={() => {
		isChatModalOpen = false;
		activeChatFeedback = null;
	}}
	onFeedbackUpdated={(feedbackId, newStatus) => {
		handleUpdateFeedbackStatus(feedbackId, newStatus);
		if (activeChatFeedback && activeChatFeedback.id === feedbackId) {
			activeChatFeedback.status = newStatus;
		}
	}}
/>
