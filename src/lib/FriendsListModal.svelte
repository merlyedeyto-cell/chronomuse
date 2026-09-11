<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { goto } from '$app/navigation';
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
	let errorMessage = $state('');

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

	function handleViewProfile(friendId) {
		handleClose();
		goto(`/profile?id=${friendId}`);
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
				errorMessage = data.error;
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
			errorMessage = 'An error occurred. Please try again.';
		});
	}
</script>

<!-- Backdrop Overlay -->
{#if isOpen}
	<div
		class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 transition-opacity duration-300 flex items-center justify-center p-3 sm:p-4 animate-modal-backdrop font-sans"
		class:opacity-0={isClosing}
		onclick={handleClose}
	>
		<!-- Modal Content -->
		<div
			class="bg-white rounded-3xl p-5 border border-pink-100 transition-all duration-300 max-w-md w-full relative max-h-[85vh] overflow-hidden flex flex-col animate-modal-content shadow-2xl my-auto"
			class:opacity-0={isClosing}
			class:scale-95={isClosing}
			class:transform={isClosing}
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Close Button -->
			<button
				onclick={handleClose}
				class="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] flex items-center justify-center transition-colors cursor-pointer"
				title="Close"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<!-- Header -->
			<div class="text-center mb-4 flex-shrink-0">
				<div class="w-12 h-12 mx-auto mb-2 rounded-2xl bg-gradient-to-tr from-[#f43f8e] to-[#ec4899] flex items-center justify-center text-white shadow-xs">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
					</svg>
				</div>
				<h2 class="text-base font-black text-pink-950 mb-0.5">My Friends</h2>
				<p class="text-pink-400 text-xs font-bold">{friends.length} friend{friends.length !== 1 ? 's' : ''}</p>
			</div>

			<!-- Friends List - Scrollable -->
			<div class="flex-1 overflow-y-auto -mx-1 px-1">
				{#if isLoading}
					<div class="text-center py-8">
						<div class="animate-spin w-7 h-7 border-3 border-pink-100 border-t-[#f43f8e] rounded-full mx-auto"></div>
						<p class="text-xs text-pink-400 font-bold mt-2.5">Loading friends...</p>
					</div>
				{:else if friends.length === 0}
					<div class="text-center py-8">
						<div class="w-12 h-12 bg-pink-50 rounded-full flex items-center justify-center mx-auto mb-2.5 text-pink-300">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
							</svg>
						</div>
						<p class="text-xs font-black text-pink-950 mb-0.5">You don't have any friends yet</p>
						<p class="text-[11px] text-pink-400 font-medium">Send friend requests to connect with others!</p>
					</div>
				{:else}
					<div class="space-y-2">
						{#each friends as friend (friend.friend_id)}
							<div class="p-2.5 bg-white border border-pink-100/90 rounded-2xl hover:border-pink-200 transition-all shadow-2xs">
								<div class="flex items-center space-x-2.5">
									<button
										type="button"
										onclick={() => handleViewProfile(friend.friend_id)}
										class="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#f43f8e] to-[#ec4899] flex items-center justify-center text-white font-black text-xs flex-shrink-0 overflow-hidden hover:scale-105 transition-transform cursor-pointer shadow-2xs"
										title="View @{friend.username}'s Profile"
									>
										{#if friend.avatar_url}
											<img src={friend.avatar_url} alt={friend.username} class="w-full h-full object-cover" />
										{:else}
											{friend.username.charAt(0).toUpperCase()}
										{/if}
									</button>
									<div class="flex-1 min-w-0">
										<button
											type="button"
											onclick={() => handleViewProfile(friend.friend_id)}
											class="text-left font-black text-[#e8367f] hover:underline text-xs truncate block cursor-pointer"
										>
											@{friend.username}
										</button>
										<p class="text-[10px] text-pink-950/60 font-medium truncate">{friend.email}</p>
										{#if friend.friends_since}
											<p class="text-[9px] text-pink-300 font-bold mt-0.5">Friends since {formatDate(friend.friends_since)}</p>
										{/if}
									</div>
									<div class="flex items-center space-x-1 flex-shrink-0">
										<button
											onclick={() => handleViewProfile(friend.friend_id)}
											class="px-2.5 py-1 bg-pink-50 hover:bg-pink-100 text-[#f43f8e] border border-pink-100 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95"
											title="View Profile"
										>
											Profile
										</button>
										<button
											onclick={() => confirmRemoveFriend(friend)}
											class="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer active:scale-95"
											title="Remove Friend"
										>
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5">
												<path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.272 0c.8.025 1.414.71 1.414 1.477v.187a49.71 49.71 0 00-6.1 0v-.187c0-.767.614-1.452 1.414-1.477zM9 9.75a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0v-6A.75.75 0 019 9.75zm4.5 0a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0v-6a.75.75 0 01.75-.75z" clip-rule="evenodd" />
											</svg>
										</button>
									</div>
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
		<div class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-modal-backdrop font-sans">
			<div class="bg-white rounded-3xl p-5 max-w-xs w-full border border-pink-100 animate-modal-content shadow-2xl">
				<div class="text-center mb-3.5">
					<div class="w-10 h-10 mx-auto mb-2 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 shadow-2xs">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
						</svg>
					</div>
					<h3 class="text-sm font-black text-pink-950 mb-1">Remove Friend?</h3>
					<p class="text-xs text-pink-950/70 font-medium">
						Are you sure you want to remove <span class="font-bold text-[#f43f8e]">@{friendToRemove?.username}</span> from your friends list?
					</p>
				</div>
				<div class="flex space-x-2">
					<button
						onclick={cancelRemove}
						disabled={isRemoving}
						class="flex-1 py-2 px-3 bg-[#fdf2f6] text-pink-950 rounded-xl hover:bg-pink-100 transition-all text-xs font-bold disabled:opacity-50 cursor-pointer active:scale-95"
					>
						Cancel
					</button>
					<button
						onclick={removeFriend}
						disabled={isRemoving}
						class="flex-1 py-2 px-3 bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-all text-xs font-bold disabled:opacity-50 cursor-pointer active:scale-95 shadow-xs"
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
