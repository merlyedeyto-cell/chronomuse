<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import { X, Loader2, Check, Pencil, LogOut } from 'lucide-svelte';

	const dispatch = createEventDispatcher();

	let { open = false } = $props();
	let isOpen = $state(false);
	let isClosing = $state(false);
	let isEditing = $state(false);
	let isSaving = $state(false);

	let user = $state(null);
	let username = $state('');
	let email = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');

	let messageText = $state('');
	let messageType = $state('error');

	function setMessage(msg, type = 'error') {
		messageText = msg;
		messageType = type;
		setTimeout(() => {
			messageText = '';
		}, 4000);
	}

	$effect(() => {
		isOpen = open;
		if (isOpen) {
			document.body.style.overflow = 'hidden';
			loadUserProfile();
		} else {
			document.body.style.overflow = '';
		}
	});

	function handleClose() {
		isClosing = true;
		setTimeout(() => {
			isOpen = false;
			isClosing = false;
			isEditing = false;
			resetForm();
			document.body.style.overflow = '';
			dispatch('close');
		}, 300);
	}

	function resetForm() {
		newPassword = '';
		confirmPassword = '';
	}

	function getCurrentUser() {
		const currentUser = localStorage.getItem('chronomuse_user');
		return currentUser ? JSON.parse(currentUser) : null;
	}

	function loadUserProfile() {
		const currentUser = getCurrentUser();
		if (currentUser) {
			user = currentUser;
			username = currentUser.username;
			email = currentUser.email;
		}
	}

	function handleEdit() {
		isEditing = true;
	}

	function handleCancel() {
		isEditing = false;
		resetForm();
	}

	function handleSave() {
		if (newPassword && newPassword !== confirmPassword) {
			setMessage('Passwords do not match!', 'error');
			return;
		}

		isSaving = true;

		// Update profile via API
		fetch(API_ENDPOINTS.updateProfile, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				user_id: user.id,
				username: username,
				email: email,
				new_password: newPassword
			})
		})
		.then(response => response.json())
		.then(data => {
			isSaving = false;
			if (data.error) {
				setMessage(data.error, 'error');
			} else {
				// Update localStorage with new user data
				const updatedUser = { ...user, username: username, email: email };
				localStorage.setItem('chronomuse_user', JSON.stringify(updatedUser));
				user = updatedUser;
				
				setMessage('Profile updated successfully!', 'success');
				isEditing = false;
				resetForm();
				dispatch('profileUpdated', updatedUser);
			}
		})
		.catch(error => {
			isSaving = false;
			setMessage('An error occurred. Please try again.', 'error');
			console.error('Update profile error:', error);
		});
	}

	// Gesture Drag Animation State (Mobile Touch & Pointer Optimized)
	let isDragging = $state(false);
	let dragStartY = 0;
	let dragTranslateY = $state(0);
	let dragStartTime = 0;
	let activePointerId = null;

	function handlePointerDown(e) {
		if (isClosing) return;
		if (e.target.closest('button, input, textarea, a, select')) return;
		if (e.button !== undefined && e.button !== 0) return;

		dragStartY = e.clientY;
		dragTranslateY = 0;
		dragStartTime = Date.now();
		isDragging = true;
		activePointerId = e.pointerId;

		try {
			if (e.currentTarget && e.currentTarget.setPointerCapture) {
				e.currentTarget.setPointerCapture(e.pointerId);
			}
		} catch (err) {}
	}

	function handlePointerMove(e) {
		if (!isDragging || isClosing) return;
		if (activePointerId !== null && e.pointerId !== activePointerId) return;

		const deltaY = e.clientY - dragStartY;
		if (deltaY > 0) {
			dragTranslateY = deltaY;
		} else {
			dragTranslateY = deltaY * 0.35;
		}
	}

	function handlePointerUp(e) {
		if (!isDragging) return;
		if (activePointerId !== null && e.pointerId !== activePointerId) return;

		isDragging = false;
		if (activePointerId !== null) {
			try {
				if (e.currentTarget && e.currentTarget.releasePointerCapture) {
					e.currentTarget.releasePointerCapture(activePointerId);
				}
			} catch (err) {}
			activePointerId = null;
		}

		const elapsedTime = Date.now() - dragStartTime;
		const velocity = dragTranslateY / Math.max(elapsedTime, 1);

		if (dragTranslateY > 85 || (velocity > 0.3 && dragTranslateY > 30)) {
			handleClose();
		} else {
			dragTranslateY = 0;
		}
	}

	function handlePointerCancel(e) {
		if (isDragging) {
			isDragging = false;
			activePointerId = null;
			dragTranslateY = 0;
		}
	}

	function handleLogout() {
		if (confirm('Are you sure you want to logout?')) {
			localStorage.clear();
			sessionStorage.clear();
			try {
				supabase.removeAllChannels();
			} catch (e) {}
			if (typeof window !== 'undefined') {
				window.dispatchEvent(new Event('chronomuse_auth_change'));
			}
			window.location.href = '/';
		}
	}
</script>

<!-- Backdrop Overlay -->
{#if isOpen}
	<div
		class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center font-sans pointer-events-auto select-none"
		style="opacity: {isClosing ? 0 : Math.max(0.1, 1 - (dragTranslateY / 380))}; transition: {isDragging ? 'none' : 'opacity 0.25s ease'};"
		onclick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
		onkeydown={(e) => { if (e.key === 'Escape') handleClose(); }}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<!-- Modal Content -->
		<div
			class="bg-gradient-to-b from-[#fff5f8] via-[#fff0f5] to-white rounded-t-[32px] sm:rounded-t-[38px] p-5 sm:p-6 pb-6 border-t-2 border-x border-pink-200/90 max-w-md sm:max-w-lg w-full relative max-h-[96vh] sm:max-h-[92vh] overflow-y-auto shadow-[0_-12px_45px_rgba(244,63,142,0.22)] pointer-events-auto"
			style="transform: translateY({isClosing ? '100%' : `${dragTranslateY}px`}); transition: {isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease'}; opacity: {isClosing ? 0 : 1}; will-change: transform;"
		>
			<!-- Pull / Drag Handle Bar Area -->
			<div
				class="w-full pt-1 pb-2 -mt-2 mb-2 flex items-center justify-center cursor-grab active:cursor-grabbing select-none flex-shrink-0 touch-none"
				style="touch-action: none; -webkit-user-select: none;"
				aria-hidden="true"
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerUp}
				onpointercancel={handlePointerCancel}
			>
				<div class="py-1 px-8 flex items-center justify-center">
					<div
						class="h-1.5 rounded-full transition-all duration-200 {isDragging ? 'w-24 bg-[#f43f8e] scale-110 shadow-sm' : 'w-14 sm:w-16 bg-pink-300/80 hover:bg-pink-400 hover:w-20'}"
					></div>
				</div>
			</div>

			<!-- Close Button -->
			<button
				onclick={handleClose}
				class="absolute top-4 right-4 sm:top-5 sm:right-5 w-8 h-8 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 z-10"
				aria-label="Close modal"
			>
				<X class="w-4 h-4" />
			</button>

			{#if messageText}
				<div class="mb-3.5 p-2.5 rounded-xl text-xs font-bold transition-all border {messageType === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-pink-50 text-[#f43f8e] border border-pink-200'}">
					{messageText}
				</div>
			{/if}

			<!-- Header -->
			<div class="text-center mb-4">
				<div class="w-14 h-14 mx-auto mb-2 rounded-2xl bg-gradient-to-tr from-[#f43f8e] to-[#ec4899] flex items-center justify-center text-white text-xl font-black overflow-hidden shadow-xs">
					{#if user?.avatar_url}
						<img src={user.avatar_url} alt={username} class="w-full h-full object-cover" />
					{:else}
						{username?.charAt(0).toUpperCase() || 'U'}
					{/if}
				</div>
				<h2 class="text-base font-black text-pink-950">My Profile</h2>
				<p class="text-[11px] text-pink-400 font-bold">Manage your account settings</p>
			</div>

			<!-- Profile Info -->
			<div class="space-y-2.5 mb-4">
				<!-- Username -->
				<div>
					{#if isEditing}
						<label for="profile-username" class="block text-[11px] font-black text-[#f43f8e] mb-1">Username</label>
						<input
							id="profile-username"
							type="text"
							bind:value={username}
							class="w-full px-3 py-2 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-pink-950 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 focus:border-[#f43f8e] focus:bg-white transition-all text-xs font-bold"
						/>
					{:else}
						<span class="block text-[11px] font-black text-[#f43f8e] mb-1">Username</span>
						<p class="text-xs text-pink-950 font-bold px-3 py-2 bg-[#fdf2f6]/70 border border-pink-100 rounded-xl">{username}</p>
					{/if}
				</div>

				<!-- Email -->
				<div>
					{#if isEditing}
						<label for="profile-email" class="block text-[11px] font-black text-[#f43f8e] mb-1">Email</label>
						<input
							id="profile-email"
							type="email"
							bind:value={email}
							class="w-full px-3 py-2 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-pink-950 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 focus:border-[#f43f8e] focus:bg-white transition-all text-xs font-bold"
						/>
					{:else}
						<span class="block text-[11px] font-black text-[#f43f8e] mb-1">Email</span>
						<p class="text-xs text-pink-950 font-bold px-3 py-2 bg-[#fdf2f6]/70 border border-pink-100 rounded-xl">{email}</p>
					{/if}
				</div>

				<!-- Change Password (only when editing) -->
				{#if isEditing}
					<div class="pt-2.5 border-t border-pink-100">
						<h3 class="text-xs font-black text-[#f43f8e] mb-2">Change Password (Optional)</h3>
						
						<div class="space-y-2">
							<div>
								<label for="profile-new-password" class="block text-[10px] font-bold text-pink-500 mb-1">New Password</label>
								<input
									id="profile-new-password"
									type="password"
									bind:value={newPassword}
									placeholder="Enter new password"
									class="w-full px-3 py-2 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-pink-950 placeholder:text-pink-300 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 focus:border-[#f43f8e] focus:bg-white transition-all text-xs font-bold"
								/>
							</div>

							<div>
								<label for="profile-confirm-password" class="block text-[10px] font-bold text-pink-500 mb-1">Confirm New Password</label>
								<input
									id="profile-confirm-password"
									type="password"
									bind:value={confirmPassword}
									placeholder="Confirm new password"
									class="w-full px-3 py-2 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-pink-950 placeholder:text-pink-300 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 focus:border-[#f43f8e] focus:bg-white transition-all text-xs font-bold"
								/>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Action Buttons -->
			<div class="space-y-2">
				{#if isEditing}
					<button
						onclick={handleSave}
						disabled={isSaving}
						class="w-full py-2 px-3 bg-[#f43f8e] text-white rounded-xl font-bold hover:bg-[#e0337f] active:scale-95 transition-all text-xs disabled:opacity-50 flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer"
					>
						{#if isSaving}
							<Loader2 class="animate-spin h-4 w-4 text-white" />
							<span>Saving...</span>
						{:else}
							<Check class="w-4 h-4" />
							<span>Save Changes</span>
						{/if}
					</button>
					<button
						onclick={handleCancel}
						class="w-full py-2 px-3 bg-white border border-pink-200 text-pink-600 rounded-xl hover:bg-pink-50 transition-all text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95"
					>
						<X class="w-4 h-4" />
						<span>Cancel</span>
					</button>
				{:else}
					<button
						onclick={handleEdit}
						class="w-full py-2.5 px-3 bg-[#f43f8e] text-white rounded-xl hover:bg-[#e0337f] transition-all text-xs font-bold flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer active:scale-95"
					>
						<Pencil class="w-4 h-4" />
						<span>Edit Profile</span>
					</button>
					<button
						onclick={handleLogout}
						class="w-full py-2.5 px-3 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl transition-all text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95"
					>
						<LogOut class="w-4 h-4" />
						<span>Logout</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
