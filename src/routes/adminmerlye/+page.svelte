<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	const ADMIN_PASSCODE = '041205';

	let isAuthenticated = $state(false);
	let passcodeInput = $state('');
	let authError = $state('');
	let isCheckingAuth = $state(true);

	// Dashboard Data
	let metrics = $state({
		total_users: 0,
		total_memories: 0,
		total_notes: 0,
		active_today: 0,
		database_status: 'Healthy / Connected',
		storage_status: 'Operational',
		encryption_protocol: 'TLS 1.3 / Supabase E2E RLS',
		server_time: new Date().toISOString()
	});

	let usersList = $state([]);
	let userSearchQuery = $state('');
	let selectedStatusFilter = $state('all');
	let isLoadingData = $state(false);
	let actionMessage = $state('');
	let isTogglingStatus = $state(false);

	onMount(() => {
		if (typeof window !== 'undefined') {
			const savedAuth = sessionStorage.getItem('chronomuse_admin_auth');
			if (savedAuth === ADMIN_PASSCODE) {
				isAuthenticated = true;
				loadAdminData();
			}
		}
		isCheckingAuth = false;
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

	async function loadAdminData() {
		isLoadingData = true;
		actionMessage = '';

		try {
			const [metricsRes, usersRes] = await Promise.all([
				fetch('/api/admin', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ passcode: ADMIN_PASSCODE, action: 'get_metrics' })
				}).then(r => r.json()),
				fetch('/api/admin', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ passcode: ADMIN_PASSCODE, action: 'get_users', limit: 100 })
				}).then(r => r.json())
			]);

			if (metricsRes.success && metricsRes.data?.metrics) {
				metrics = metricsRes.data.metrics;
			}
			if (usersRes.success && usersRes.data?.users) {
				usersList = usersRes.data.users;
			}
		} catch (err) {
			console.error('Error loading admin data:', err);
		} finally {
			isLoadingData = false;
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
				actionMessage = `Status of @${targetUser.username} updated to ${nextStatus}`;
				setTimeout(() => actionMessage = '', 3000);
			} else {
				targetUser.status = oldStatus;
			}
		} catch (err) {
			targetUser.status = oldStatus;
			console.error('Error toggling status:', err);
		} finally {
			isTogglingStatus = false;
		}
	}

	function formatDate(isoStr) {
		if (!isoStr) return 'N/A';
		try {
			const d = new Date(isoStr);
			return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
		} catch (e) {
			return isoStr;
		}
	}

	let filteredUsers = $derived(
		usersList.filter(u => {
			const matchesSearch = !userSearchQuery || 
				u.username?.toLowerCase().includes(userSearchQuery.toLowerCase()) || 
				u.email?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
				String(u.id).includes(userSearchQuery);
			
			const matchesStatus = selectedStatusFilter === 'all' || u.status === selectedStatusFilter;
			return matchesSearch && matchesStatus;
		})
	);
</script>

<svelte:head>
	<title>Admin Portal - ChronoMuse</title>
</svelte:head>

<div class="min-h-screen bg-pink-100 text-pink-950 font-sans p-4 sm:p-6 flex flex-col">
	{#if isCheckingAuth}
		<div class="flex-1 flex items-center justify-center">
			<div class="animate-spin h-8 w-8 border-3 border-pink-300 border-t-pink-600 rounded-full"></div>
		</div>
	{:else if !isAuthenticated}
		<!-- Secret Admin Passcode Screen -->
		<div class="flex-1 flex items-center justify-center p-4">
			<div class="bg-white border-2 border-pink-300 rounded-2xl max-w-sm w-full p-6 text-center">
				<div class="w-14 h-14 bg-pink-100 border-2 border-pink-300 rounded-2xl flex items-center justify-center mx-auto mb-4 text-pink-600">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-7 h-7">
						<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
					</svg>
				</div>

				<h1 class="text-lg font-black text-pink-700 mb-1">Administrative Access</h1>
				<p class="text-xs text-pink-500 mb-5 font-medium">ChronoMuse Central Platform Console</p>

				{#if authError}
					<div class="mb-4 p-2.5 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-700 font-bold">
						{authError}
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
							autofocus
						/>
					</div>

					<button
						type="submit"
						class="w-full py-2.5 bg-pink-500 hover:bg-pink-600 active:scale-95 text-white font-bold text-sm rounded-xl transition-all cursor-pointer"
					>
						Authenticate Console
					</button>

					<button
						type="button"
						onclick={() => goto('/dashboard')}
						class="w-full py-2 bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
					>
						Return to App
					</button>
				</form>
			</div>
		</div>
	{:else}
		<!-- Authenticated Admin Dashboard -->
		<div class="container mx-auto max-w-6xl space-y-5">
			<!-- Header -->
			<div class="bg-white border-2 border-pink-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
				<div class="flex items-center space-x-3">
					<div class="w-11 h-11 bg-pink-500 text-white rounded-xl border border-pink-600 flex items-center justify-center font-black text-xl">
						⚙️
					</div>
					<div>
						<div class="flex items-center gap-2">
							<h1 class="text-base sm:text-lg font-black text-pink-700">ChronoMuse Central Control</h1>
							<span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold border border-emerald-300">
								Encrypted & Secure
							</span>
						</div>
						<p class="text-xs text-pink-500">Platform status monitoring & account management (Privacy Shield Active)</p>
					</div>
				</div>

				<div class="flex items-center space-x-2 self-end sm:self-auto">
					<button
						onclick={loadAdminData}
						disabled={isLoadingData}
						class="px-3 py-2 bg-pink-100 hover:bg-pink-200 text-pink-700 border border-pink-300 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 {isLoadingData ? 'animate-spin' : ''}">
							<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
						</svg>
						<span>Refresh</span>
					</button>
					<button
						onclick={handleLogout}
						class="px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
					>
						Exit Console
					</button>
				</div>
			</div>

			<!-- Privacy Shield Banner -->
			<div class="p-3.5 bg-emerald-50 border-2 border-emerald-300 rounded-2xl flex items-start space-x-3 text-emerald-900">
				<div class="p-1.5 bg-emerald-200 rounded-lg text-emerald-800 flex-shrink-0 mt-0.5">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
					</svg>
				</div>
				<div class="text-xs">
					<p class="font-bold">Zero-Access Privacy Architecture Enforced</p>
					<p class="text-emerald-700 leading-relaxed mt-0.5">
						In compliance with secure privacy standards, this console strictly monitors aggregate user metrics and platform operational health without accessing private diary entries, messages, or confidential user activities.
					</p>
				</div>
			</div>

			{#if actionMessage}
				<div class="p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold">
					{actionMessage}
				</div>
			{/if}

			<!-- Metric Cards Grid -->
			<div class="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
				<!-- Registered Users -->
				<div class="bg-white border-2 border-pink-300 rounded-2xl p-4">
					<div class="flex items-center justify-between mb-2">
						<span class="text-xs font-bold text-pink-600 uppercase">Registered Users</span>
						<span class="p-1 bg-pink-100 rounded-md text-pink-600 text-xs">👥</span>
					</div>
					<p class="text-2xl font-black text-pink-900">{metrics.total_users}</p>
					<p class="text-[10px] text-pink-400 mt-1 font-medium">Active Accounts</p>
				</div>

				<!-- Active Today -->
				<div class="bg-white border-2 border-emerald-300 rounded-2xl p-4">
					<div class="flex items-center justify-between mb-2">
						<span class="text-xs font-bold text-emerald-700 uppercase">Active Today</span>
						<span class="p-1 bg-emerald-100 rounded-md text-emerald-600 text-xs">🟢</span>
					</div>
					<p class="text-2xl font-black text-emerald-900">{metrics.active_today}</p>
					<p class="text-[10px] text-emerald-600 mt-1 font-medium">Logged in last 24h</p>
				</div>

				<!-- Memories Recorded -->
				<div class="bg-white border-2 border-pink-300 rounded-2xl p-4">
					<div class="flex items-center justify-between mb-2">
						<span class="text-xs font-bold text-pink-600 uppercase">Total Memories</span>
						<span class="p-1 bg-pink-100 rounded-md text-pink-600 text-xs">📖</span>
					</div>
					<p class="text-2xl font-black text-pink-900">{metrics.total_memories}</p>
					<p class="text-[10px] text-pink-400 mt-1 font-medium">Calendar Entries</p>
				</div>

				<!-- 24h Notes Published -->
				<div class="bg-white border-2 border-pink-300 rounded-2xl p-4">
					<div class="flex items-center justify-between mb-2">
						<span class="text-xs font-bold text-pink-600 uppercase">24h Notes</span>
						<span class="p-1 bg-pink-100 rounded-md text-pink-600 text-xs">💬</span>
					</div>
					<p class="text-2xl font-black text-pink-900">{metrics.total_notes}</p>
					<p class="text-[10px] text-pink-400 mt-1 font-medium">Live Thought Bubbles</p>
				</div>
			</div>

			<!-- Platform Health Status -->
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
				<div class="bg-white border-2 border-pink-200 rounded-2xl p-3.5 flex items-center justify-between">
					<span class="text-xs font-bold text-pink-700">Database Engine</span>
					<span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold border border-emerald-300">
						{metrics.database_status}
					</span>
				</div>
				<div class="bg-white border-2 border-pink-200 rounded-2xl p-3.5 flex items-center justify-between">
					<span class="text-xs font-bold text-pink-700">Storage Buckets</span>
					<span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold border border-emerald-300">
						{metrics.storage_status}
					</span>
				</div>
				<div class="bg-white border-2 border-pink-200 rounded-2xl p-3.5 flex items-center justify-between">
					<span class="text-xs font-bold text-pink-700">Security Layer</span>
					<span class="px-2.5 py-1 bg-pink-100 text-pink-800 rounded-full text-xs font-bold border border-pink-300">
						{metrics.encryption_protocol}
					</span>
				</div>
			</div>

			<!-- Users Management Directory -->
			<div class="bg-white border-2 border-pink-300 rounded-2xl p-4 sm:p-5 space-y-4">
				<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
					<div>
						<h2 class="text-base font-bold text-pink-800">Platform Accounts Directory ({filteredUsers.length})</h2>
						<p class="text-xs text-pink-400">Manage registered user accounts and statuses</p>
					</div>

					<div class="flex items-center gap-2 w-full sm:w-auto">
						<input
							type="text"
							bind:value={userSearchQuery}
							placeholder="Search username / email..."
							class="px-3 py-1.5 bg-pink-50 border border-pink-300 rounded-xl text-xs font-medium text-pink-900 focus:outline-none focus:ring-2 focus:ring-pink-400 flex-1 sm:w-56"
						/>
						<select
							bind:value={selectedStatusFilter}
							class="px-2.5 py-1.5 bg-pink-50 border border-pink-300 rounded-xl text-xs font-bold text-pink-800 focus:outline-none"
						>
							<option value="all">All Statuses</option>
							<option value="active">Active</option>
							<option value="suspended">Suspended</option>
						</select>
					</div>
				</div>

				<!-- Users Table -->
				<div class="overflow-x-auto">
					<table class="w-full text-left text-xs">
						<thead>
							<tr class="bg-pink-100 text-pink-800 border-b-2 border-pink-200">
								<th class="py-2.5 px-3 font-bold">User</th>
								<th class="py-2.5 px-3 font-bold">Email</th>
								<th class="py-2.5 px-3 font-bold">Joined</th>
								<th class="py-2.5 px-3 font-bold">Last Activity</th>
								<th class="py-2.5 px-3 font-bold">Account Status</th>
								<th class="py-2.5 px-3 font-bold text-right">Moderation</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-pink-100">
							{#if filteredUsers.length === 0}
								<tr>
									<td colspan="6" class="text-center py-6 text-pink-400 font-medium">
										No user accounts matching your criteria.
									</td>
								</tr>
							{:else}
								{#each filteredUsers as userRow (userRow.id)}
									<tr class="hover:bg-pink-50/70 transition-colors">
										<td class="py-2.5 px-3">
											<div class="flex items-center space-x-2">
												<div class="w-7 h-7 rounded-full bg-pink-400 text-white font-bold flex items-center justify-center overflow-hidden flex-shrink-0">
													{#if userRow.avatar_url}
														<img src={userRow.avatar_url} alt="" class="w-full h-full object-cover" />
													{:else}
														{userRow.username?.charAt(0).toUpperCase()}
													{/if}
												</div>
												<span class="font-bold text-pink-900">@{userRow.username}</span>
											</div>
										</td>
										<td class="py-2.5 px-3 text-pink-700">{userRow.email || '—'}</td>
										<td class="py-2.5 px-3 text-pink-600">{formatDate(userRow.created_at)}</td>
										<td class="py-2.5 px-3 text-pink-600">{formatDate(userRow.last_activity)}</td>
										<td class="py-2.5 px-3">
											{#if userRow.status === 'suspended'}
												<span class="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full text-[10px] font-bold border border-rose-300">
													Suspended
												</span>
											{:else}
												<span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold border border-emerald-300">
													Active
												</span>
											{/if}
										</td>
										<td class="py-2.5 px-3 text-right">
											<button
												onclick={() => toggleUserStatus(userRow)}
												disabled={isTogglingStatus}
												class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer {userRow.status === 'suspended' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-300'}"
											>
												{userRow.status === 'suspended' ? 'Reactivate' : 'Suspend'}
											</button>
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
