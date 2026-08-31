<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';

	const dispatch = createEventDispatcher();

	let { open = false } = $props();
	let isOpen = $state(open);
	let isClosing = $state(false);
	let friends = $state([]);
	let isLoading = $state(true);
	let isRemoving = $state(false);
	let showConfirmDelete = $state(false);
	let friendToRemove = $state(null);

	$effect(() => {
		isOpen = open;
		if (isOpen) {
			document.body.style.overflow = 'hidden';
			fetchFriends();
		} else {
			document.body.style.overflow = '';
		}
	});

	function handleClose() {
		isClosing = true;
		setTimeout(() => {
			isOpen = false;
			isClosing = false;
			document.body.style.overflow = '';
			dispatch('close');
		}, 300);
	}

	function getCurrentUser() {
		const currentUser = localStorage.getItem('chronomuse_user');
		return currentUser ? JSON.parse(currentUser) : null;
	}

	function fetchFriends() {
		isLoading = true;
		const user = getCurrentUser();
		if (!user || !user.id) {
			isLoading = false;
			return;
		}

		fetch(API_ENDPOINTS.getFriendsList, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ user_id: user.id })
		})
		.then(response => response.json())
		.then(data => {
			isLoading = false;
			if (data.data) {
				friends = data.data.friends || [];
			}
		})
		.catch(error => {
			isLoading = false;
			console.error('Error fetching friends:', error);
		});
	}

	function formatDate(dateString) {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function confirmRemoveFriend(friend) {
		friendToRemove = friend;
		showConfirmDelete = true;
	}

	function cancelRemove() {
		showConfirmDelete = false;
		friendToRemove = null;
	}

	function removeFriend() {
		if (!friendToRemove) return;

		isRemoving = true;
		const user = getCurrentUser();

		fetch(API_ENDPOINTS.removeFriend, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				user_id: user.id,
				friend_id: friendToRemove.friend_id
			})
		})
		.then(response => response.json())
		.then(data => {
			isRemoving = false;
			if (data.error) {
				alert(data.error);
			} else {
				// Remove from the list
				friends = friends.filter(f => f.friend_id !== friendToRemove.friend_id);
				dispatch('friendRemoved', { friendId: friendToRemove.friend_id });
				cancelRemove();
			}
		})
		.catch(error => {
			isRemoving = false;
			console.error('Remove friend error:', error);
			alert('An error occurred. Please try again.');
		});
	}
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
			class="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl p-8 border-2 border-pink-300 transition-all duration-300 max-w-md w-full relative max-h-[80vh] overflow-hidden flex flex-col animate-modal-content"
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
			<div class="text-center mb-6 flex-shrink-0">
				<div class="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-r from-pink-400 to-pink-600 flex items-center justify-center">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8 text-white">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
					</svg>
				</div>
				<h2 class="text-2xl font-bold text-pink-500 mb-1">My Friends</h2>
				<p class="text-pink-400 text-sm">{friends.length} friend{friends.length !== 1 ? 's' : ''}</p>
			</div>

			<!-- Friends List - Scrollable -->
			<div class="flex-1 overflow-y-auto -mx-2 px-2">
				{#if isLoading}
					<div class="text-center py-8">
						<div class="animate-spin w-8 h-8 border-4 border-pink-300 border-t-pink-500 rounded-full mx-auto"></div>
						<p class="text-sm text-pink-400 mt-3">Loading friends...</p>
					</div>
				{:else if friends.length === 0}
					<div class="text-center py-8">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-16 h-16 text-pink-200 mx-auto mb-3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
						</svg>
						<p class="text-sm text-pink-400 mb-4">You don't have any friends yet</p>
						<p class="text-xs text-pink-300">Send friend requests to connect with others!</p>
					</div>
				{:else}
					<div class="space-y-3">
						{#each friends as friend (friend.friend_id)}
							<div class="p-4 bg-pink-50 border-2 border-pink-200 rounded-xl hover:border-pink-300 transition-all duration-200">
								<div class="flex items-center space-x-3">
									<div class="w-12 h-12 rounded-full bg-gradient-to-r from-pink-400 to-pink-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
										{friend.username.charAt(0).toUpperCase()}
									</div>
									<div class="flex-1 min-w-0">
										<p class="text-sm font-semibold text-pink-700 truncate">{friend.username}</p>
										<p class="text-xs text-pink-400 truncate">{friend.email}</p>
										{#if friend.friends_since}
											<p class="text-xs text-pink-300 mt-1">Friends since {formatDate(friend.friends_since)}</p>
										{/if}
									</div>
									<button
										onclick={() => confirmRemoveFriend(friend)}
										class="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
										title="Remove Friend"
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
											<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 12.55a1.125 1.125 0 01-1.126 1.095H9.726a1.125 1.125 0 01-1.126-1.095L8.259 9M8.875 5.625V4.5c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v1.125m-4.5 0V4.5m0 0h4.5m-4.5 0a2.25 2.25 0 00-2.25 2.25v1.5a2.25 2.25 0 002.25 2.25h1.5a2.25 2.25 0 002.25-2.25v-1.5a2.25 2.25 0 00-2.25-2.25h-1.5z" />
										</svg>
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Confirm Delete Modal -->
	{#if showConfirmDelete}
		<div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 animate-modal-backdrop">
			<div class="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border-2 border-red-300 animate-modal-content">
				<div class="text-center mb-4">
					<div class="w-16 h-16 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8 text-red-500">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
						</svg>
					</div>
					<h3 class="text-lg font-bold text-red-500 mb-1">Remove Friend?</h3>
					<p class="text-sm text-gray-600">
						Are you sure you want to remove <span class="font-semibold text-pink-600">{friendToRemove?.username}</span> from your friends list?
					</p>
				</div>
				<div class="flex space-x-3">
					<button
						onclick={cancelRemove}
						disabled={isRemoving}
						class="flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all duration-200 font-semibold disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						onclick={removeFriend}
						disabled={isRemoving}
						class="flex-1 py-2 px-4 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all duration-200 font-semibold disabled:opacity-50"
					>
						{#if isRemoving}Removing...{:else}Remove{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}

<style>
	/* Custom scrollbar for friends list */
	.flex-1::-webkit-scrollbar {
		width: 6px;
	}

	.flex-1::-webkit-scrollbar-track {
		background: #fce7f3;
		border-radius: 10px;
	}

	.flex-1::-webkit-scrollbar-thumb {
		background: #f472b6;
		border-radius: 10px;
	}

	.flex-1::-webkit-scrollbar-thumb:hover {
		background: #ec4899;
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
