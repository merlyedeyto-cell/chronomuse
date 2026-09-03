<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';

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
			alert('Passwords do not match!');
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
				alert(data.error);
			} else {
				// Update localStorage with new user data
				const updatedUser = { ...user, username: username, email: email };
				localStorage.setItem('chronomuse_user', JSON.stringify(updatedUser));
				user = updatedUser;
				
				alert('Profile updated successfully!');
				isEditing = false;
				resetForm();
				dispatch('profileUpdated', updatedUser);
			}
		})
		.catch(error => {
			isSaving = false;
			alert('An error occurred. Please try again.');
			console.error('Update profile error:', error);
		});
	}

	function handleLogout() {
		if (confirm('Are you sure you want to logout?')) {
			localStorage.removeItem('chronomuse_user');
			window.location.href = '/';
		}
	}
</script>

<!-- Backdrop Overlay -->
{#if isOpen}
	<div
		class="fixed inset-0 bg-black/40 backdrop-blur-md z-40 transition-opacity duration-300 flex items-center justify-center p-4 animate-modal-backdrop"
		class:opacity-0={isClosing}
		onclick={handleClose}
	>
		<!-- Modal Content -->
		<div
			class="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl p-5 sm:p-6 border-2 border-pink-300 transition-all duration-300 max-w-sm sm:max-w-md w-full relative max-h-[90vh] overflow-y-auto animate-modal-content"
			class:opacity-0={isClosing}
			class:scale-95={isClosing}
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Close Button -->
			<button
				onclick={handleClose}
				class="absolute top-3.5 right-3.5 p-1.5 text-pink-400 hover:text-pink-600 hover:bg-pink-100 rounded-lg transition-all duration-200"
				aria-label="Close modal"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<!-- Header -->
			<div class="text-center mb-5">
				<div class="w-14 h-14 mx-auto mb-2.5 rounded-full bg-gradient-to-tr from-pink-400 to-pink-600 flex items-center justify-center text-white text-xl font-bold shadow-md">
					{username?.charAt(0).toUpperCase() || 'U'}
				</div>
				<h2 class="text-base sm:text-lg font-bold text-pink-600">My Profile</h2>
				<p class="text-[11px] sm:text-xs text-pink-400 mt-0.5">Manage your account settings</p>
			</div>

			<!-- Profile Info -->
			<div class="space-y-3 mb-5">
				<!-- Username -->
				<div>
					<label class="block text-xs font-semibold text-pink-600 mb-1">Username</label>
					{#if isEditing}
						<input
							type="text"
							bind:value={username}
							class="w-full px-3 py-2 bg-pink-50 border-2 border-pink-300 rounded-lg text-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 text-xs sm:text-sm font-medium"
						/>
					{:else}
						<p class="text-xs sm:text-sm text-pink-700 font-semibold px-3 py-2 bg-pink-50 border-2 border-pink-200 rounded-lg">{username}</p>
					{/if}
				</div>

				<!-- Email -->
				<div>
					<label class="block text-xs font-semibold text-pink-600 mb-1">Email</label>
					{#if isEditing}
						<input
							type="email"
							bind:value={email}
							class="w-full px-3 py-2 bg-pink-50 border-2 border-pink-300 rounded-lg text-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 text-xs sm:text-sm font-medium"
						/>
					{:else}
						<p class="text-xs sm:text-sm text-pink-700 font-semibold px-3 py-2 bg-pink-50 border-2 border-pink-200 rounded-lg">{email}</p>
					{/if}
				</div>

				<!-- Change Password (only when editing) -->
				{#if isEditing}
					<div class="pt-3 border-t border-pink-200">
						<h3 class="text-xs font-bold text-pink-600 mb-2.5">Change Password (Optional)</h3>
						
						<div class="space-y-2.5">
							<div>
								<label class="block text-[11px] font-semibold text-pink-600 mb-1">New Password</label>
								<input
									type="password"
									bind:value={newPassword}
									placeholder="Enter new password"
									class="w-full px-3 py-2 bg-pink-50 border-2 border-pink-300 rounded-lg text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 text-xs sm:text-sm font-medium"
								/>
							</div>

							<div>
								<label class="block text-[11px] font-semibold text-pink-600 mb-1">Confirm New Password</label>
								<input
									type="password"
									bind:value={confirmPassword}
									placeholder="Confirm new password"
									class="w-full px-3 py-2 bg-pink-50 border-2 border-pink-300 rounded-lg text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 text-xs sm:text-sm font-medium"
								/>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Action Buttons -->
			<div class="space-y-2.5">
				{#if isEditing}
					<button
						onclick={handleSave}
						disabled={isSaving}
						class="w-full py-2 px-3 bg-gradient-to-r from-pink-500 to-pink-600 text-white rounded-lg font-bold hover:from-pink-600 hover:to-pink-700 active:scale-95 transition-all duration-200 shadow-sm text-xs sm:text-sm disabled:opacity-50 flex items-center justify-center space-x-1.5"
					>
						{#if isSaving}
							<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							<span>Saving...</span>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
							</svg>
							<span>Save Changes</span>
						{/if}
					</button>
					<button
						onclick={handleCancel}
						class="w-full py-3 px-4 bg-white border-2 border-pink-300 text-pink-600 rounded-xl hover:bg-pink-50 transition-all duration-200 text-sm font-semibold flex items-center justify-center space-x-2"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
						<span>Cancel</span>
					</button>
				{:else}
					<button
						onclick={handleEdit}
						class="w-full py-3 px-4 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-xl hover:from-pink-500 hover:to-pink-700 transition-all duration-200 text-sm font-semibold shadow-md flex items-center justify-center space-x-2"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
						</svg>
						<span>Edit Profile</span>
					</button>
					<button
						onclick={handleLogout}
						class="w-full py-3 px-4 bg-white border-2 border-red-300 text-red-600 rounded-xl hover:bg-red-50 transition-all duration-200 text-sm font-semibold flex items-center justify-center space-x-2"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
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
