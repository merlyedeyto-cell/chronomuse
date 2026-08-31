<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';

	const dispatch = createEventDispatcher();

	let { open = false } = $props();
	let isOpen = $state(open);
	let isClosing = $state(false);
	let isLoading = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');

	let friendUsername = $state('');
	let pendingRequests = $state([]);
	let isResponding = $state(false);

	$effect(() => {
		isOpen = open;
		if (isOpen) {
			document.body.style.overflow = 'hidden';
			fetchPendingRequests();
		} else {
			document.body.style.overflow = '';
		}
	});

	function handleClose() {
		isClosing = true;
		setTimeout(() => {
			isOpen = false;
			isClosing = false;
			errorMessage = '';
			successMessage = '';
			friendUsername = '';
			document.body.style.overflow = '';
			dispatch('close');
		}, 300);
	}

	function getCurrentUser() {
		const currentUser = localStorage.getItem('chronomuse_user');
		return currentUser ? JSON.parse(currentUser) : null;
	}

	function handleSubmit() {
		isLoading = true;
		errorMessage = '';
		successMessage = '';

		const user = getCurrentUser();

		if (!user || !user.id) {
			isLoading = false;
			errorMessage = 'Please log in first.';
			return;
		}

		fetch(API_ENDPOINTS.addFriend, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				friend_username: friendUsername,
				user_id: user.id
			})
		})
		.then(response => response.json())
		.then(data => {
			isLoading = false;
			if (data.error) {
				errorMessage = data.error;
			} else {
				successMessage = data.message || 'Friend request sent successfully!';
				dispatch('addFriend', data);
				setTimeout(() => {
					handleClose();
				}, 1500);
			}
		})
		.catch(error => {
			isLoading = false;
			errorMessage = 'An error occurred. Please try again.';
			console.error('Add friend error:', error);
		});
	}

	function fetchPendingRequests() {
		const user = getCurrentUser();
		if (!user || !user.id) return;

		fetch(API_ENDPOINTS.getFriendRequests, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ user_id: user.id })
		})
		.then(response => response.json())
		.then(data => {
			if (data.data) {
				pendingRequests = data.data.requests || [];
			}
		})
		.catch(error => {
			console.error('Error fetching pending requests:', error);
		});
	}

	function handleRespond(requestId, action) {
		isResponding = true;
		const user = getCurrentUser();

		fetch(API_ENDPOINTS.respondToFriendRequest, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				user_id: user.id,
				request_id: requestId,
				action: action
			})
		})
		.then(response => response.json())
		.then(data => {
			isResponding = false;
			if (data.error) {
				errorMessage = data.error;
			} else {
				// Remove the responded request from the list
				pendingRequests = pendingRequests.filter(r => r.id !== requestId);
				dispatch('friendRequestResponded', { requestId, action, ...data });
			}
		})
		.catch(error => {
			isResponding = false;
			errorMessage = 'An error occurred. Please try again.';
			console.error('Respond error:', error);
		});
	}

	onMount(() => {
		if (isOpen) {
			fetchPendingRequests();
		}
	});
</script>

<!-- Backdrop Overlay -->
{#if isOpen}
	<div
		class="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300 flex items-center justify-center p-4 animate-modal-backdrop"
		class:opacity-0={isClosing}
		onclick={handleClose}
	>
		<!-- Modal Content -->
		<div
			class="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl p-8 border-2 border-pink-300 transition-all duration-300 max-w-md w-full relative animate-modal-content"
			class:opacity-0={isClosing}
			class:scale-95={isClosing}
			class:transform={isClosing}
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Close Button -->
			<button
				onclick={handleClose}
				class="absolute top-3 right-3 p-2 text-pink-400 hover:text-pink-600 hover:bg-pink-100 rounded-lg transition-all duration-200"
				title="Close"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<!-- Header -->
			<div class="text-center mb-6">
				<div class="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-r from-pink-400 to-pink-600 flex items-center justify-center">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8 text-white">
						<path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.941 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
					</svg>
				</div>
				<h2 class="text-2xl font-bold text-pink-500 mb-1">Add Friend</h2>
				<p class="text-pink-400 text-sm">Search for a friend by username</p>
			</div>

			<!-- Error Message -->
			{#if errorMessage}
				<div class="mb-5 p-3 bg-red-100 border border-red-300 rounded-xl text-red-700 text-sm">
					{errorMessage}
				</div>
			{/if}

			<!-- Success Message -->
			{#if successMessage}
				<div class="mb-5 p-3 bg-green-100 border border-green-300 rounded-xl text-green-700 text-sm">
					{successMessage}
				</div>
			{/if}

			<!-- Form -->
			<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
				<!-- Friend Username Field -->
				<div>
					<label class="block text-sm font-medium text-pink-600 mb-2">Username</label>
					<input
						type="text"
						bind:value={friendUsername}
						class="w-full px-4 py-3 bg-white/90 border-2 border-pink-300 rounded-xl text-pink-700 placeholder-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200"
						placeholder="Enter friend's username"
						required
						disabled={isLoading || successMessage}
					/>
				</div>

				<!-- Submit Button -->
				<button
					type="submit"
					class="w-full py-3 px-4 bg-gradient-to-r from-pink-400 to-pink-600 hover:from-pink-500 hover:to-pink-700 text-white font-semibold rounded-xl shadow-lg transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
					disabled={isLoading || successMessage}
				>
					{#if isLoading}
						Sending Request...
					{:else if successMessage}
						Request Sent!
					{:else}
						Send Friend Request
					{/if}
				</button>
			</form>

			<!-- Pending Requests Section -->
			{#if pendingRequests.length > 0}
				<div class="mt-6 pt-6 border-t-2 border-pink-200">
					<h3 class="text-lg font-bold text-pink-500 mb-4 text-center">Friend Requests</h3>
					<div class="space-y-3 max-h-48 overflow-y-auto">
						{#each pendingRequests as request (request.id)}
							<div class="p-3 bg-pink-50 border-2 border-pink-200 rounded-xl flex items-center justify-between">
								<div class="flex items-center space-x-3">
									<div class="w-10 h-10 rounded-full bg-gradient-to-r from-pink-400 to-pink-600 flex items-center justify-center text-white font-bold">
										{request.username.charAt(0).toUpperCase()}
									</div>
									<div>
										<p class="text-sm font-semibold text-pink-700">{request.username}</p>
										<p class="text-xs text-pink-400">{request.email}</p>
									</div>
								</div>
								<div class="flex space-x-2">
									<button
										onclick={() => handleRespond(request.id, 'accept')}
										disabled={isResponding}
										class="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all duration-200 disabled:opacity-50"
										title="Accept"
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
										</svg>
									</button>
									<button
										onclick={() => handleRespond(request.id, 'decline')}
										disabled={isResponding}
										class="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all duration-200 disabled:opacity-50"
										title="Decline"
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Info Text -->
			<div class="mt-6 p-4 bg-pink-50 border border-pink-200 rounded-xl">
				<p class="text-xs text-pink-600 text-center">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 inline mr-1">
						<path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
					</svg>
					Your friend will receive a notification and can accept or decline your request.
				</p>
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
