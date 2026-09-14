<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';

	const dispatch = createEventDispatcher();

	let { open = false } = $props();
	let isOpen = $state(open);
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
		class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-300 flex items-end justify-center font-sans pointer-events-auto"
		class:opacity-0={isClosing}
		onclick={handleClose}
	>
		<!-- Modal Content -->
		<div
			class="bg-gradient-to-b from-[#fff5f8] via-[#fff0f5] to-white rounded-t-[32px] sm:rounded-t-[38px] p-5 sm:p-6 pb-6 border-t-2 border-x border-pink-200/90 transition-all duration-300 max-w-md sm:max-w-lg w-full relative max-h-[96vh] sm:max-h-[92vh] overflow-y-auto shadow-[0_-12px_45px_rgba(244,63,142,0.22)] animate-bottom-sheet pointer-events-auto"
			class:translate-y-full={isClosing}
			class:opacity-0={isClosing}
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Pull / Drag Handle Bar -->
			<div
				class="w-12 sm:w-16 h-1.5 rounded-full bg-pink-300/80 mx-auto mb-3 hover:bg-pink-400 cursor-grab active:cursor-grabbing transition-colors flex-shrink-0"
				onclick={handleClose}
				title="Tap or pull to close"
			></div>

			<!-- Close Button -->
			<button
				onclick={handleClose}
				class="absolute top-4 right-4 sm:top-5 sm:right-5 w-8 h-8 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 z-10"
				aria-label="Close modal"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
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
					<label class="block text-[11px] font-black text-[#f43f8e] mb-1">Username</label>
					{#if isEditing}
						<input
							type="text"
							bind:value={username}
							class="w-full px-3 py-2 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-pink-950 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 focus:border-[#f43f8e] focus:bg-white transition-all text-xs font-bold"
						/>
					{:else}
						<p class="text-xs text-pink-950 font-bold px-3 py-2 bg-[#fdf2f6]/70 border border-pink-100 rounded-xl">{username}</p>
					{/if}
				</div>

				<!-- Email -->
				<div>
					<label class="block text-[11px] font-black text-[#f43f8e] mb-1">Email</label>
					{#if isEditing}
						<input
							type="email"
							bind:value={email}
							class="w-full px-3 py-2 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-pink-950 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 focus:border-[#f43f8e] focus:bg-white transition-all text-xs font-bold"
						/>
					{:else}
						<p class="text-xs text-pink-950 font-bold px-3 py-2 bg-[#fdf2f6]/70 border border-pink-100 rounded-xl">{email}</p>
					{/if}
				</div>

				<!-- Change Password (only when editing) -->
				{#if isEditing}
					<div class="pt-2.5 border-t border-pink-100">
						<h3 class="text-xs font-black text-[#f43f8e] mb-2">Change Password (Optional)</h3>
						
						<div class="space-y-2">
							<div>
								<label class="block text-[10px] font-bold text-pink-500 mb-1">New Password</label>
								<input
									type="password"
									bind:value={newPassword}
									placeholder="Enter new password"
									class="w-full px-3 py-2 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-pink-950 placeholder:text-pink-300 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 focus:border-[#f43f8e] focus:bg-white transition-all text-xs font-bold"
								/>
							</div>

							<div>
								<label class="block text-[10px] font-bold text-pink-500 mb-1">Confirm New Password</label>
								<input
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
							<svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							<span>Saving...</span>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
							</svg>
							<span>Save Changes</span>
						{/if}
					</button>
					<button
						onclick={handleCancel}
						class="w-full py-2 px-3 bg-white border border-pink-200 text-pink-600 rounded-xl hover:bg-pink-50 transition-all text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
						<span>Cancel</span>
					</button>
				{:else}
					<button
						onclick={handleEdit}
						class="w-full py-2.5 px-3 bg-[#f43f8e] text-white rounded-xl hover:bg-[#e0337f] transition-all text-xs font-bold flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer active:scale-95"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
						</svg>
						<span>Edit Profile</span>
					</button>
					<button
						onclick={handleLogout}
						class="w-full py-2.5 px-3 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl transition-all text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
						</svg>
						<span>Logout</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Prevent body scroll when modal is open */
	:global(body.modal-open) {
		overflow: hidden;
	}

	@keyframes bottom-sheet-slide {
		from {
			transform: translateY(100%);
			opacity: 0.8;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.animate-bottom-sheet {
		animation: bottom-sheet-slide 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	@keyframes modal-backdrop {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes modal-content {
		from {
			opacity: 0;
			transform: scale(0.9) translateY(-20px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.animate-modal-backdrop {
		animation: modal-backdrop 0.3s ease-out;
	}

	.animate-modal-content {
		animation: modal-content 0.3s ease-out cubic-bezier(0.34, 1.56, 0.64, 1);
	}
</style>
