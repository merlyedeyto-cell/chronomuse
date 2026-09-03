<script>
	import { onMount, onDestroy, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import Sidebar from '$lib/Sidebar.svelte';

	let user = $state(null);
	let friends = $state([]);
	let searchQuery = $state('');
	let activeFriend = $state(null);
	let messages = $state([]);
	let newMessageText = $state('');
	let isLoading = $state(true);
	let isLoadingChatList = $state(true);
	let isFetchingMessages = $state(false);
	let isSending = $state(false);
	let isUploadingImage = $state(false);
	let sidebarOpen = $state(false);
	let showEmojiPicker = $state(false);
	let showClearModal = $state(false);
	let isClearing = $state(false);
	let pollInterval;
	let chatContainer;
	let imageInput;

	const emojis = ['😀', '😁', '😂', '🥰', '😍', '🤩', '😊', '😎', '🥳', '🎉', '❤️', '🔥', '✨', '🌟', '💫', '🎈', '🎊', '📸', '🎵', '🎶', '💕', '💖', '💗', '🌸', '🌈', '☀️', '🌙', '⭐'];
	const quickReactions = ['❤️', '😂', '🥰', '✨', '👍', '🌸'];

	onMount(() => {
		const storedUser = localStorage.getItem('chronomuse_user');
		if (storedUser) {
			user = JSON.parse(storedUser);
		} else {
			goto('/');
			return;
		}

		// Load cached friends list immediately for 0ms instant rendering
		const cachedChatList = localStorage.getItem('chronomuse_chat_list');
		if (cachedChatList) {
			try {
				const parsed = JSON.parse(cachedChatList);
				if (Array.isArray(parsed) && parsed.length > 0) {
					friends = parsed;
					isLoadingChatList = false;
				}
			} catch (e) {}
		}

		// Read URL params immediately for 0ms instant chat loading
		const friendIdParam = $page.url.searchParams.get('friend_id');
		const usernameParam = $page.url.searchParams.get('username');

		if (friendIdParam || usernameParam) {
			activeFriend = {
				friend_id: friendIdParam ? Number(friendIdParam) : null,
				username: usernameParam || 'Friend'
			};
			if (friendIdParam) {
				fetchMessages(Number(friendIdParam), true);
			}
		}

		// Remove full-page loading block immediately for seamless instant transition
		isLoading = false;

		fetchChatList().then(() => {
			if (activeFriend) {
				const fullFriend = friends.find(f => 
					(activeFriend.friend_id && String(f.friend_id) === String(activeFriend.friend_id)) ||
					(activeFriend.username && f.username.toLowerCase() === activeFriend.username.toLowerCase())
				);
				if (fullFriend) {
					activeFriend = fullFriend;
				}
			}
		});

		pollInterval = setInterval(() => {
			fetchChatList();
			if (activeFriend) {
				fetchMessages(activeFriend.friend_id, false);
			}
		}, 3000);
	});

	onDestroy(() => {
		if (pollInterval) clearInterval(pollInterval);
	});

	async function fetchChatList() {
		if (!user) return;
		try {
			const res = await fetch(API_ENDPOINTS.getChatList, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id })
			});
			const data = await res.json();
			if (data.data && data.data.friends) {
				friends = data.data.friends;
				localStorage.setItem('chronomuse_chat_list', JSON.stringify(data.data.friends));
			}
		} catch (err) {
			console.error('Error fetching chat list:', err);
		} finally {
			isLoading = false;
			isLoadingChatList = false;
		}
	}

	function filteredFriends() {
		if (!searchQuery.trim()) return friends;
		return friends.filter(f => f.username.toLowerCase().includes(searchQuery.toLowerCase()));
	}

	async function selectFriend(friend) {
		activeFriend = friend;
		showEmojiPicker = false;
		await fetchMessages(friend.friend_id, true);
	}

	async function fetchMessages(friendId, shouldScroll = false) {
		if (!user) return;
		if (shouldScroll) {
			isFetchingMessages = true;
		}
		try {
			const res = await fetch(API_ENDPOINTS.getMessages, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id, friend_id: friendId })
			});
			const data = await res.json();
			if (data.data && data.data.messages) {
				const isAtBottom = chatContainer ? (chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 80) : true;
				messages = data.data.messages;
				if (shouldScroll || isAtBottom) {
					await tick();
					scrollToBottom();
				}
			}
		} catch (err) {
			console.error('Error fetching messages:', err);
		} finally {
			isFetchingMessages = false;
		}
	}

	function scrollToBottom() {
		if (chatContainer) {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		}
	}

	async function sendMessage(textCustom) {
		const textToSend = textCustom || newMessageText.trim();
		if (!textToSend || !activeFriend || isSending) return;

		if (!textCustom) newMessageText = '';
		showEmojiPicker = false;
		isSending = true;

		// Instant optimistic message insertion for 0ms latency & zero-lag feel
		const tempId = `temp-${Date.now()}`;
		const tempMsg = {
			id: tempId,
			sender_id: user.id,
			receiver_id: activeFriend.friend_id,
			message: textToSend,
			created_at: new Date().toISOString()
		};

		messages = [...messages, tempMsg];
		await tick();
		scrollToBottom();

		try {
			const res = await fetch(API_ENDPOINTS.sendMessage, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					friend_id: activeFriend.friend_id,
					message: textToSend
				})
			});
			const data = await res.json();
			if (data.success && data.data) {
				messages = messages.map(m => m.id === tempId ? data.data : m);
				await tick();
				scrollToBottom();
				fetchChatList();
			}
		} catch (err) {
			console.error('Error sending message:', err);
		} finally {
			isSending = false;
		}
	}

	async function handleImageUpload(e) {
		const file = e.target.files[0];
		if (!file || !activeFriend) return;

		isUploadingImage = true;
		try {
			const fileExt = file.name.split('.').pop();
			const fileName = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
			const filePath = `${user.id}/${fileName}`;

			const { error: uploadError } = await supabase.storage
				.from('memories')
				.upload(filePath, file);

			if (uploadError) {
				alert('Image upload failed: ' + uploadError.message);
				return;
			}

			const { data: urlData } = supabase.storage.from('memories').getPublicUrl(filePath);
			const imageUrl = urlData.publicUrl;

			await sendMessage(`[IMG]${imageUrl}[/IMG]`);
		} catch (err) {
			console.error('Error uploading chat image:', err);
			alert('Failed to upload image. Please try again.');
		} finally {
			isUploadingImage = false;
			if (imageInput) imageInput.value = '';
		}
	}

	async function clearConversation() {
		if (!activeFriend || isClearing) return;
		isClearing = true;
		try {
			// Delete messages in local state and db
			const { error } = await supabase
				.from('chronomuse_messages')
				.delete()
				.or(`and(sender_id.eq.${user.id},receiver_id.eq.${activeFriend.friend_id}),and(sender_id.eq.${activeFriend.friend_id},receiver_id.eq.${user.id})`);

			if (!error) {
				messages = [];
				fetchChatList();
			}
		} catch (err) {
			console.error('Error clearing conversation:', err);
		} finally {
			isClearing = false;
			showClearModal = false;
		}
	}

	function insertEmoji(emoji) {
		newMessageText += emoji;
	}

	function formatTime(dateStr) {
		if (!dateStr) return '';
		const d = new Date(dateStr);
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function isImageUrl(text) {
		return text.startsWith('[IMG]') && text.endsWith('[/IMG]');
	}

	function extractImageUrl(text) {
		return text.replace('[IMG]', '').replace('[/IMG]', '');
	}

	function handleLogout() {
		localStorage.removeItem('chronomuse_user');
		goto('/');
	}
</script>

<div class="min-h-screen bg-gradient-to-br from-pink-100 via-pink-200 to-pink-300 flex flex-col font-sans animate-fade-in">
	<!-- Top Navigation -->
	<nav class="bg-white/85 backdrop-blur-md border-b-2 border-pink-300 shadow-lg sticky top-0 z-50 animate-slide-down">
		<div class="container mx-auto px-4 py-3 flex items-center justify-between">
			<div class="flex items-center space-x-2.5">
				<button
					onclick={() => sidebarOpen = !sidebarOpen}
					class="p-1.5 sm:p-2 text-pink-500 hover:bg-pink-100 rounded-lg transition-colors flex-shrink-0 active:scale-95"
					aria-label="Toggle menu"
					title="Toggle menu"
				>
					{#if sidebarOpen}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
						</svg>
					{/if}
				</button>
				<img src="/logo.png" alt="ChronoMuse" class="w-9 h-9 sm:w-10 sm:h-10 rounded-md object-contain flex-shrink-0" />
				<span class="text-base sm:text-lg font-bold text-pink-500 truncate">ChronoMuse</span>
			</div>

			<div class="flex items-center space-x-2 sm:space-x-4 flex-shrink-0 ml-2">
				<span class="text-pink-700 text-sm hidden md:inline">Welcome, <strong>{user?.username}</strong></span>
				<span class="text-pink-700 text-xs sm:text-sm md:hidden truncate max-w-[110px]"><strong>{user?.username}</strong></span>
				<button
					onclick={handleLogout}
					class="px-4 py-2 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-lg hover:from-pink-500 hover:to-pink-700 transition-all duration-200 text-sm font-semibold shadow-md hidden md:block active:scale-95"
				>
					Logout
				</button>
			</div>
		</div>
	</nav>

	<!-- Sidebar -->
	<Sidebar
		bind:isOpen={sidebarOpen}
		on:home={() => goto('/dashboard')}
		on:moodGraph={() => goto('/mood-graph')}
		on:logout={handleLogout}
	/>

	<!-- Chat Body Container -->
	<div class="flex-grow container mx-auto px-2 sm:px-4 py-3 sm:py-5 max-w-6xl flex flex-col md:flex-row gap-3 sm:gap-5 h-[calc(100vh-4.5rem)] sm:h-[calc(100vh-5rem)] overflow-hidden">
		
		<!-- Left Panel: Friends & Search -->
		<div class="w-full md:w-80 bg-white/85 backdrop-blur-md border-2 border-pink-300 rounded-2xl shadow-lg flex flex-col overflow-hidden animate-fade-in-up" class:hidden={activeFriend !== null} class:md:flex={true} style="animation-delay: 0.1s">
			<!-- Conversations Header -->
			<div class="p-4 bg-gradient-to-r from-pink-400 to-pink-600 text-white font-bold text-base flex items-center justify-between shadow-sm">
				<div class="flex items-center space-x-2">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
					</svg>
					<span>Friends Chat</span>
				</div>
				<span class="text-xs bg-white/25 px-2 py-0.5 rounded-full">{friends.length}</span>
			</div>

			<!-- Search Bar -->
			<div class="p-3 border-b border-pink-200 bg-pink-50/50">
				<div class="relative">
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search friends..."
						class="w-full pl-9 pr-3 py-2 bg-white border border-pink-300 rounded-xl text-pink-700 placeholder-pink-300 text-xs focus:outline-none focus:ring-2 focus:ring-pink-400"
					/>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-pink-400 absolute left-3 top-2.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
					</svg>
				</div>
			</div>

			<!-- Friends List -->
			<div class="flex-grow overflow-y-auto divide-y divide-pink-100">
				{#if isLoadingChatList && friends.length === 0}
					<div class="p-8 text-center text-pink-400 text-sm flex flex-col items-center">
						<div class="animate-spin w-7 h-7 border-4 border-pink-300 border-t-pink-500 rounded-full mb-2"></div>
						<span>Loading conversations...</span>
					</div>
				{:else if !isLoadingChatList && filteredFriends().length === 0}
					<div class="p-8 text-center text-pink-400 text-xs">
						<p class="font-semibold text-sm mb-1">No friends found</p>
						<p class="text-pink-300">Add friends from the sidebar menu to start chatting!</p>
					</div>
				{:else}
					{#each filteredFriends() as friend (friend.friend_id)}
						<button
							onclick={() => selectFriend(friend)}
							class="w-full p-3.5 flex items-center space-x-3 hover:bg-pink-100/70 transition-all text-left relative"
							class:bg-pink-100={activeFriend?.friend_id === friend.friend_id}
						>
							<div class="relative flex-shrink-0">
								<div class="w-11 h-11 rounded-full bg-gradient-to-tr from-pink-400 to-pink-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
									{friend.username.charAt(0).toUpperCase()}
								</div>
								<span class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white"></span>
								{#if friend.unread_count > 0}
									<span class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce shadow-md">
										{friend.unread_count}
									</span>
								{/if}
							</div>
							<div class="flex-grow min-w-0">
								<div class="flex items-center justify-between">
									<p class="text-sm font-semibold text-pink-700 truncate">@{friend.username}</p>
									{#if friend.last_message_time}
										<span class="text-[10px] text-pink-400">{formatTime(friend.last_message_time)}</span>
									{/if}
								</div>
								<p class="text-xs text-pink-400 truncate mt-0.5">
									{#if friend.last_message && isImageUrl(friend.last_message)}
										📷 Photo attachment
									{:else}
										{friend.last_message || 'Tap to start chatting'}
									{/if}
								</p>
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</div>

		<!-- Right Panel: Active Chat Stream -->
		<div class="flex-grow bg-white/95 backdrop-blur-md border-2 border-pink-300 rounded-2xl shadow-lg flex flex-col overflow-hidden relative animate-fade-in-up" class:hidden={activeFriend === null} class:md:flex={true} style="animation-delay: 0.2s">
			{#if activeFriend}
				<!-- Active Chat Header -->
				<div class="p-3.5 bg-gradient-to-r from-pink-400 via-pink-500 to-pink-600 text-white flex items-center justify-between shadow-md">
					<div class="flex items-center space-x-3">
						<button
							onclick={() => activeFriend = null}
							class="md:hidden p-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors"
							title="Back to Friends"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
							</svg>
						</button>
						<div class="relative">
							<div class="w-10 h-10 rounded-full bg-white/20 border border-white/40 flex items-center justify-center text-white font-bold text-base">
								{activeFriend.username.charAt(0).toUpperCase()}
							</div>
							<span class="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-pink-500 rounded-full"></span>
						</div>
						<div>
							<h3 class="font-bold text-sm leading-tight flex items-center gap-1">
								<span>@{activeFriend.username}</span>
							</h3>
							<p class="text-[11px] text-pink-100 flex items-center gap-1">
								<span class="w-1.5 h-1.5 rounded-full bg-green-300 inline-block animate-pulse"></span>
								<span>Active now</span>
							</p>
						</div>
					</div>

					<!-- Header Actions -->
					<div class="flex items-center space-x-2">
						<button
							onclick={() => showClearModal = true}
							class="p-2 bg-white/10 hover:bg-white/25 text-white rounded-lg transition-colors text-xs flex items-center space-x-1"
							title="Clear Chat History"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 12.55a1.125 1.125 0 01-1.126 1.095H9.726a1.125 1.125 0 01-1.126-1.095L8.259 9M8.875 5.625V4.5c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v1.125m-4.5 0V4.5m0 0h4.5m-4.5 0a2.25 2.25 0 00-2.25 2.25v1.5a2.25 2.25 0 002.25 2.25h1.5a2.25 2.25 0 002.25-2.25v-1.5a2.25 2.25 0 00-2.25-2.25h-1.5z" />
							</svg>
							<span class="hidden sm:inline">Clear Chat</span>
						</button>
					</div>
				</div>

				<!-- Message Stream Container -->
				<div bind:this={chatContainer} class="flex-grow p-4 overflow-y-auto space-y-3.5 bg-pink-50/30">
					{#if isFetchingMessages && messages.length === 0}
						<div class="h-full flex items-center justify-center py-12">
							<div class="animate-spin h-6 w-6 border-2 border-pink-400 border-t-pink-600 rounded-full"></div>
						</div>
					{:else if messages.length === 0}
						<div class="h-full flex flex-col items-center justify-center text-pink-400 text-sm">
							<div class="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mb-3">
								<span class="text-2xl">👋</span>
							</div>
							<p class="font-bold text-pink-600 text-base">Start a conversation with @{activeFriend.username}</p>
							<p class="text-xs text-pink-400 mt-1 max-w-xs text-center">Send a message or a quick reaction to break the ice!</p>
						</div>
					{:else}
						{#each messages as msg (msg.id)}
							<div class="flex flex-col animate-slide-up transition-all duration-300" class:items-end={msg.sender_id === user.id} class:items-start={msg.sender_id !== user.id}>
								<div
									class="max-w-[78%] px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl text-xs sm:text-sm shadow-sm transition-all transform hover:scale-[1.01]"
									class:bg-gradient-to-r={msg.sender_id === user.id}
									class:from-pink-500={msg.sender_id === user.id}
									class:to-pink-600={msg.sender_id === user.id}
									class:text-white={msg.sender_id === user.id}
									class:rounded-br-none={msg.sender_id === user.id}
									class:bg-white={msg.sender_id !== user.id}
									class:text-pink-800={msg.sender_id !== user.id}
									class:border-2={msg.sender_id !== user.id}
									class:border-pink-200={msg.sender_id !== user.id}
									class:rounded-bl-none={msg.sender_id !== user.id}
								>
									{#if isImageUrl(msg.message)}
										<div class="rounded-xl overflow-hidden max-w-xs">
											<img src={extractImageUrl(msg.message)} alt="Chat Attachment" class="w-full h-auto object-cover rounded-lg" />
										</div>
									{:else}
										<p class="whitespace-pre-wrap break-words leading-relaxed">{msg.message}</p>
									{/if}
								</div>
								<span class="text-[10px] text-pink-400 mt-1 px-1">{formatTime(msg.created_at)}</span>
							</div>
						{/each}
					{/if}
				</div>

				<!-- Emoji Picker Dropup -->
				{#if showEmojiPicker}
					<div class="absolute bottom-16 right-4 sm:right-14 p-3 bg-white border-2 border-pink-300 rounded-2xl shadow-xl z-30 max-w-[240px] animate-fade-in-up">
						<div class="grid grid-cols-7 gap-1">
							{#each emojis as emoji}
								<button
									type="button"
									onclick={() => insertEmoji(emoji)}
									class="p-1 hover:bg-pink-100 rounded-lg transition-all text-lg hover:scale-110"
								>
									{emoji}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Input Form Section -->
				<form onsubmit={(e) => { e.preventDefault(); sendMessage(); }} class="p-2 sm:p-3 bg-white border-t-2 border-pink-200 flex items-center space-x-1.5 sm:space-x-2 w-full min-w-0">
					<!-- Upload Photo Button -->
					<label class="p-1.5 sm:p-2 text-pink-500 hover:text-pink-700 hover:bg-pink-100 rounded-xl cursor-pointer transition-colors flex-shrink-0" title="Attach Photo">
						{#if isUploadingImage}
							<div class="animate-spin w-5 h-5 border-2 border-pink-400 border-t-pink-600 rounded-full"></div>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
							</svg>
						{/if}
						<input
							type="file"
							accept="image/*"
							bind:this={imageInput}
							onchange={handleImageUpload}
							disabled={isUploadingImage}
							class="hidden"
						/>
					</label>

					<!-- Text Input with Emoji Button inside -->
					<div class="flex-grow min-w-0 relative flex items-center">
						<input
							type="text"
							bind:value={newMessageText}
							placeholder="Type a message..."
							class="w-full pl-3 pr-9 py-2 sm:py-2.5 bg-pink-50/50 border-2 border-pink-200/60 rounded-xl text-pink-700 text-xs sm:text-sm placeholder-pink-400/50 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all font-medium"
						/>
						<!-- Emoji Picker Toggle Button -->
						<button
							type="button"
							onclick={() => showEmojiPicker = !showEmojiPicker}
							class="absolute right-2 p-1 text-pink-500 hover:text-pink-700 rounded-lg transition-colors"
							title="Emojis"
						>
							<span class="text-base sm:text-lg leading-none">😊</span>
						</button>
					</div>

					<!-- Send Button -->
					<button
						type="submit"
						disabled={!newMessageText.trim() || isSending}
						class="py-2 sm:py-2.5 px-3 sm:px-4 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-xl font-semibold text-xs sm:text-sm hover:from-pink-500 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center space-x-1 flex-shrink-0"
					>
						<span>Send</span>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 flex-shrink-0">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
						</svg>
					</button>
				</form>
			{:else}
				<div class="h-full flex flex-col items-center justify-center p-6 text-center text-pink-400">
					<div class="w-14 h-14 rounded-full bg-pink-100 flex items-center justify-center mb-3 shadow-inner">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-7 h-7 text-pink-400">
							<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
						</svg>
					</div>
					<h3 class="text-base sm:text-lg font-bold text-pink-500 mb-0.5">Select a friend to start chatting</h3>
					<p class="text-xs text-pink-400 max-w-xs">Pick any friend from your list on the left to start sending messages, photos, and reactions.</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Clear Chat Confirmation Modal -->
{#if showClearModal}
	<div
		class="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4"
		onclick={(e) => { if (e.target === e.currentTarget) showClearModal = false; }}
	>
		<div
			class="bg-white rounded-2xl p-5 max-w-sm w-full border-2 border-pink-300 shadow-xl text-center"
			onclick={(e) => e.stopPropagation()}
		>
			<h3 class="text-sm sm:text-base font-bold text-pink-600 mb-1.5">Clear Conversation?</h3>
			<p class="text-xs text-pink-500 mb-4">
				Are you sure you want to clear all chat messages with <span class="font-semibold">@{activeFriend?.username}</span>? This action cannot be undone.
			</p>
			<div class="flex space-x-2">
				<button
					onclick={() => showClearModal = false}
					disabled={isClearing}
					class="flex-1 py-1.5 bg-pink-100 text-pink-600 rounded-lg font-bold text-xs hover:bg-pink-200 transition-colors"
				>
					Cancel
				</button>
				<button
					onclick={handleClearChat}
					disabled={isClearing}
					class="flex-1 py-1.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-bold text-xs hover:from-red-600 hover:to-red-700 transition-all flex items-center justify-center space-x-1"
				>
					{#if isClearing}Clearing...{:else}Clear Chat{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes fade-in {
		0% {
			opacity: 0;
		}
		100% {
			opacity: 1;
		}
	}

	.animate-fade-in {
		animation: fade-in 0.2s ease-out;
	}

	@keyframes slide-down {
		0% {
			opacity: 0;
			transform: translateY(-20px);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-slide-down {
		animation: slide-down 0.3s ease-out;
	}

	@keyframes fade-in-up {
		0% {
			opacity: 0;
			transform: translateY(30px);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fade-in-up {
		animation: fade-in-up 0.4s ease-out forwards;
		opacity: 0;
	}
</style>
