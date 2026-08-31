<script>
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import Sidebar from '$lib/Sidebar.svelte';

	let chatList = $state([]);
	let selectedFriend = $state(null);
	let messages = $state([]);
	let newMessage = $state('');
	let isLoading = $state(true);
	let isSending = $state(false);
	let currentUser = $state(null);
	let user = $state(null);
	let isMobile = $state(false);
	let showChatList = $state(true);
	let pollInterval = $state(3000); // Default: 3 seconds
	let lastMessageId = $state(null);
	let isTyping = $state(false);
	let typingTimeout = $state(null);
	let lastActivity = $state(Date.now());
	let sidebarOpen = $state(false);
	let friendIsActive = $state(false);
	let friendIsTyping = $state(false);
	let showDeleteModal = $state(false);
	let messageToDelete = $state(null);
	let showDeleteConvoModal = $state(false);
	let selectedFiles = $state([]);
	let fileInput;
	let showImageViewer = $state(false);
	let imageViewerSrc = $state('');

	let messagePollTimer = null;
	let chatListPollTimer = null;
	let activityTimer = null;
	let typingPollTimer = null;
	let activityListenersAdded = $state(false);

	onMount(() => {
		// Check if user is logged in
		const userStr = localStorage.getItem('chronomuse_user');
		if (!userStr) {
			goto('/');
			return;
		}
		user = JSON.parse(userStr);
		currentUser = user;

		// Check if mobile
		checkMobile();
		window.addEventListener('resize', checkMobile);

		fetchChatList();

		// Poll chat list every 30 seconds to update unread counts (reduced from 5s for free hosting)
		chatListPollTimer = setInterval(fetchChatList, 30000); // 30 seconds instead of 5

		// Track user activity for smart polling
		startActivityTracking();
	});

	onDestroy(() => {
		if (!browser) return;
		if (messagePollTimer) clearInterval(messagePollTimer);
		if (chatListPollTimer) clearInterval(chatListPollTimer);
		if (activityTimer) clearInterval(activityTimer);
		if (typingPollTimer) clearInterval(typingPollTimer);
		window.removeEventListener('resize', checkMobile);
		activityListenersAdded = false;
		window.lastActivityUpdate = null;
	});

	function checkMobile() {
		if (!browser) return;
		isMobile = window.innerWidth < 768;
		if (!isMobile) {
			sidebarOpen = false; // Close sidebar on desktop resize
		}
	}

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	function getMediaUrl(url) {
		if (!url) return '';
		
		// If already starts with /uploads/, return as-is
		if (url.startsWith('/uploads/')) {
			return url;
		}
		
		// Convert old localhost URLs to relative paths
		if (url.startsWith('http://localhost/chronomuse/')) {
			return url.replace('http://localhost/chronomuse/', '/');
		}
		if (url.startsWith('/chronomuse/')) {
			return url.replace('/chronomuse/', '/');
		}
		
		// If it's a full URL from production, extract the path
		if (url.includes('/uploads/')) {
			const parts = url.split('/uploads/');
			return '/uploads/' + parts[parts.length - 1];
		}
		
		return url;
	}

	function updateFriendStatus() {
		if (!selectedFriend || !selectedFriend.last_activity) {
			friendIsActive = false;
			return;
		}

		const now = Date.now();
		const lastActivityTime = new Date(selectedFriend.last_activity).getTime();
		const timeSinceLastActivity = now - lastActivityTime;

		// Active if activity within last 5 seconds
		friendIsActive = timeSinceLastActivity < 5000;
	}

	function startActivityTracking() {
		if (!browser || activityListenersAdded) return;

		// Update activity to server every 30 seconds
		updateUserActivity();
		activityTimer = setInterval(updateUserActivity, 30000);

		activityListenersAdded = true;
	}

	function updateUserActivity() {
		if (!currentUser || !browser) return;

		// Throttle: only update if last update was > 30 seconds ago
		const now = Date.now();
		if (window.lastActivityUpdate && (now - window.lastActivityUpdate) < 30000) {
			return;
		}
		window.lastActivityUpdate = now;

		fetch(API_ENDPOINTS.updateActivity, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ user_id: currentUser.id })
		})
		.catch(error => {
			// Silently ignore errors for activity updates
		});
	}

	function adjustPollingBasedOnActivity() {
		if (!browser) return;

		const now = Date.now();
		const timeSinceActivity = now - lastActivity;

		// If active in last 30 seconds and has selected friend, poll faster
		if (timeSinceActivity < 30000 && selectedFriend) {
			pollInterval = 2000; // 2 seconds when active
		} else {
			pollInterval = 5000; // 5 seconds when idle
		}

		// Restart pollers with new interval
		if (selectedFriend) {
			if (messagePollTimer) clearInterval(messagePollTimer);
			messagePollTimer = setInterval(loadMessages, pollInterval);
		}
	}

	function handleLogout() {
		localStorage.removeItem('chronomuse_user');
		goto('/');
	}

	function handleSidebarLogout() {
		localStorage.removeItem('chronomuse_user');
		goto('/');
	}

	function handleHome() {
		goto('/dashboard');
	}

	function handleAddFriend() {
		// Sidebar handles its own modal
	}

	function handleFriendsList() {
		// Sidebar handles its own modal
	}

	function handleChat() {
		// Already on chat page
	}

	function handleMoodGraph() {
		goto('/mood-graph');
	}

	function fetchChatList() {
		if (!currentUser || !browser) {
			console.log('fetchChatList: no currentUser or not browser', { currentUser, browser });
			return;
		}

		console.log('Fetching chat list for user:', currentUser.id);

		// Preserve current view state
		const currentShowChatList = showChatList;
		const currentSelectedId = selectedFriend?.friend_id;

		fetch(API_ENDPOINTS.getChatList, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ user_id: currentUser.id })
		})
		.then(response => {
			console.log('Response status:', response.status);
			console.log('Response headers:', response.headers.get('content-type'));
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			return response.text();
		})
		.then(text => {
			console.log('Raw response:', text);
			try {
				const data = JSON.parse(text);
				if (data.data && data.data.friends) {
					// Update chat list
					chatList = data.data.friends;

					// Update selectedFriend with fresh data from the list if it exists
					if (currentSelectedId) {
						const updatedFriend = chatList.find(f => f.friend_id === currentSelectedId);
						if (updatedFriend) {
							// Update properties without replacing the object
							selectedFriend.friend_id = updatedFriend.friend_id;
							selectedFriend.username = updatedFriend.username;
							selectedFriend.email = updatedFriend.email;
							selectedFriend.last_activity = updatedFriend.last_activity;
							selectedFriend.last_message = updatedFriend.last_message;
							selectedFriend.last_message_time = updatedFriend.last_message_time;
							selectedFriend.unread_count = updatedFriend.unread_count;
						}
					}

					// Restore view state - stay where the user is
					showChatList = currentShowChatList;

					console.log('Friends loaded:', chatList.length);
				} else if (data.error) {
					console.error('API Error:', data.error);
				}
			} catch (parseError) {
				console.error('JSON parse error:', parseError);
				console.error('Response was not JSON:', text.substring(0, 500));
			}
		})
		.catch(error => {
			console.error('Error fetching chat list:', error);
		});
	}

	function selectFriend(friend) {
		selectedFriend = friend;
		lastMessageId = null; // Reset to get all messages
		loadMessages();

		// Start polling for this conversation
		if (messagePollTimer) clearInterval(messagePollTimer);
		messagePollTimer = setInterval(() => {
			loadMessages();
			updateFriendStatus(); // Check friend's activity on each poll
		}, pollInterval);

		// Start polling for typing status
		if (typingPollTimer) clearInterval(typingPollTimer);
		typingPollTimer = setInterval(checkFriendTyping, 1000); // Check every second

		// Initial status checks
		updateFriendStatus();
		checkFriendTyping();

		// On mobile, hide chat list
		if (isMobile) {
			showChatList = false;
		}
	}

	function loadMessages() {
		if (!selectedFriend || !currentUser) return;

		fetch(API_ENDPOINTS.getMessages, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				user_id: currentUser.id,
				friend_id: selectedFriend.friend_id
			})
		})
		.then(response => response.json())
		.then(data => {
			if (data.data) {
				const newMessages = data.data.messages || [];

				// Only update if there are new messages
				const lastMsg = messages[messages.length - 1];
				const hasNewMessages = !lastMsg ||
					(newMessages.length > 0 && newMessages[newMessages.length - 1].id !== lastMsg.id);

				if (hasNewMessages) {
					messages = newMessages;
					lastMessageId = newMessages[newMessages.length - 1]?.id;

					// Always scroll to bottom on initial load or new messages
					setTimeout(() => {
						if (!browser) return;
						const container = document.querySelector('.messages-container');
						if (container) {
							container.scrollTop = container.scrollHeight;
						}
					}, 50);
				}
			}
			isLoading = false;
		})
		.catch(error => {
			isLoading = false;
			console.error('Error loading messages:', error);
		});
	}

	function handleFileSelect(event) {
		const files = Array.from(event.target.files);
		if (files.length > 0) {
			selectedFiles = [...selectedFiles, ...files];
		}
		// Reset file input
		if (fileInput) {
			fileInput.value = '';
		}
	}

	function removeFile(index) {
		selectedFiles = selectedFiles.filter((_, i) => i !== index);
	}

	function openImageViewer(src) {
		imageViewerSrc = src;
		showImageViewer = true;
	}

	function closeImageViewer() {
		showImageViewer = false;
		imageViewerSrc = '';
	}

	async function downloadImage() {
		if (!imageViewerSrc) return;
		
		// For same-origin images, use fetch + blob
		if (imageViewerSrc.startsWith('http://localhost') || imageViewerSrc.startsWith('/')) {
			try {
				const response = await fetch(imageViewerSrc);
				const blob = await response.blob();
				const url = URL.createObjectURL(blob);
				const link = document.createElement('a');
				link.href = url;
				link.download = 'image_' + Date.now() + '.jpg';
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				URL.revokeObjectURL(url);
				return;
			} catch (error) {
				console.error('Blob download failed:', error);
			}
		}
		
		// Fallback: force download using attribute
		const link = document.createElement('a');
		link.href = imageViewerSrc;
		link.download = '';
		link.target = '_blank';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	function sendMessage() {
		if ((!newMessage.trim() && selectedFiles.length === 0) || !selectedFriend || isSending) return;

		isSending = true;
		const messageText = newMessage.trim();
		const filesToSend = [...selectedFiles];

		// Clear input and files
		newMessage = '';
		selectedFiles = [];

		// Use FormData for file upload
		const formData = new FormData();
		formData.append('user_id', currentUser.id);
		formData.append('receiver_id', selectedFriend.friend_id);
		formData.append('message', messageText);

		filesToSend.forEach(file => {
			formData.append('attachments', file);
		});

		fetch(API_ENDPOINTS.sendMessage, {
			method: 'POST',
			body: formData
		})
		.then(response => {
			console.log('Response status:', response.status);
			return response.json();
		})
		.then(data => {
			console.log('Send message response:', data);
			isSending = false;
			if (data.data) {
				messages.push(data.data);
				lastMessageId = data.data.id;

				// Scroll to bottom
				setTimeout(() => {
					if (!browser) return;
					const container = document.querySelector('.messages-container');
					if (container) {
						container.scrollTop = container.scrollHeight;
					}
				}, 50);

				// Refresh chat list to update last message
				fetchChatList();

				// Poll immediately for any response
				if (messagePollTimer) {
					clearInterval(messagePollTimer);
					messagePollTimer = setInterval(loadMessages, 1000); // Fast poll after sending
					setTimeout(() => {
						if (messagePollTimer) {
							clearInterval(messagePollTimer);
							messagePollTimer = setInterval(loadMessages, pollInterval);
						}
					}, 5000);
				}
			} else if (data.error) {
				console.error('API Error:', data.error);
				alert('Error sending message: ' + data.error);
				// Restore message if failed
				newMessage = messageText;
				selectedFiles = filesToSend;
			}
		})
		.catch(error => {
			isSending = false;
			console.error('Fetch error:', error);
			alert('Failed to send message. Check console for details.');
			// Restore message if failed
			newMessage = messageText;
			selectedFiles = filesToSend;
		});
	}

	function handleKeyPress(event) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	function handleRefresh() {
		loadMessages();
		fetchChatList();
	}

	function handleInputKeyPress(event) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	function handleTyping() {
		if (!selectedFriend || !currentUser) return;

		isTyping = true;

		// Send typing status to server
		sendTypingStatus(true);

		if (typingTimeout) clearTimeout(typingTimeout);

		typingTimeout = setTimeout(() => {
			isTyping = false;
			// Clear typing status on server
			sendTypingStatus(false);
		}, 2000);
	}

	function sendTypingStatus(isTyping) {
		if (!selectedFriend || !currentUser || !browser) return;

		fetch(API_ENDPOINTS.updateTypingStatus, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				user_id: currentUser.id,
				friend_id: selectedFriend.friend_id,
				is_typing: isTyping
			})
		})
		.catch(error => {
			console.error('Error sending typing status:', error);
		});
	}

	function checkFriendTyping() {
		if (!selectedFriend || !currentUser || !browser) return;

		fetch(API_ENDPOINTS.getTypingStatus, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				user_id: currentUser.id,
				friend_id: selectedFriend.friend_id
			})
		})
		.then(response => response.json())
		.then(data => {
			if (data.success !== undefined) {
				friendIsTyping = data.is_typing;
			}
		})
		.catch(error => {
			console.error('Error checking friend typing:', error);
		});
	}

	function openDeleteModal(message) {
		messageToDelete = message;
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
		messageToDelete = null;
	}

	function deleteMessage() {
		if (!messageToDelete || !currentUser) return;

		fetch(API_ENDPOINTS.deleteMessage, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				user_id: currentUser.id,
				message_id: messageToDelete.id
			})
		})
		.then(response => response.json())
		.then(data => {
			if (data.success) {
				// Remove message from the list
				messages = messages.filter(m => m.id !== messageToDelete.id);
				closeDeleteModal();
			} else {
				alert(data.error || 'Failed to delete message');
			}
		})
		.catch(error => {
			console.error('Error deleting message:', error);
			alert('Failed to delete message');
		});
	}

	function openDeleteConvoModal() {
		showDeleteConvoModal = true;
	}

	function closeDeleteConvoModal() {
		showDeleteConvoModal = false;
	}

	function deleteConversation() {
		if (!selectedFriend || !currentUser) return;

		fetch(API_ENDPOINTS.deleteConversation, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				user_id: currentUser.id,
				friend_id: selectedFriend.friend_id
			})
		})
		.then(response => response.json())
		.then(data => {
			if (data.success) {
				// Clear all messages
				messages = [];
				lastMessageId = null;
				closeDeleteConvoModal();
				// Refresh chat list
				fetchChatList();
			} else {
				alert(data.error || 'Failed to delete conversation');
			}
		})
		.catch(error => {
			console.error('Error deleting conversation:', error);
			alert('Failed to delete conversation');
		});
	}

	function backToChatList() {
		showChatList = true;
		if (messagePollTimer) {
			clearInterval(messagePollTimer);
			messagePollTimer = null;
		}
	}

	function formatTime(timestamp) {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
	}

	function formatDate(timestamp) {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		const now = new Date();
		const diff = now - date;
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));

		if (days === 0) return formatTime(timestamp);
		if (days === 1) return 'Yesterday';
		if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

<div class="flex flex-col min-h-screen bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200 animate-fade-in-page">
	<!-- Top Navigation -->
	<nav class="bg-white/85 backdrop-blur-md border-b-2 border-pink-300 shadow-lg sticky top-0 z-50 animate-slide-down">
		<div class="container mx-auto px-4 py-3 flex items-center justify-between">
			<div class="flex items-center space-x-3">
				<!-- Hamburger Menu Button - Mobile Only -->
				<button
					onclick={toggleSidebar}
					class="md:hidden p-2 text-pink-500 hover:bg-pink-100 rounded-lg transition-colors"
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
				<img src="/logo.png" alt="ChronoMuse" class="w-10 h-10 rounded-md object-contain" />
				<span class="text-lg font-bold text-pink-500">ChronoMuse</span>
			</div>

			<div class="flex items-center space-x-4">
				<span class="text-pink-700 text-sm hidden md:inline">Welcome, <strong>{user?.username}</strong></span>
				<span class="text-pink-700 text-sm md:hidden"><strong>{user?.username}</strong></span>
				<button
					onclick={handleLogout}
					class="px-4 py-2 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-lg hover:from-pink-500 hover:to-pink-700 transition-all duration-200 text-sm font-semibold shadow-md hidden md:block"
				>
					Logout
				</button>
			</div>
		</div>
	</nav>

	<!-- Sidebar -->
	<Sidebar
		bind:isOpen={sidebarOpen}
		on:home={handleHome}
		on:addFriend={handleAddFriend}
		on:friendsList={handleFriendsList}
		on:chat={handleChat}
		on:moodGraph={handleMoodGraph}
		on:logout={handleSidebarLogout}
	/>

	<!-- Main Content -->
	<main class="flex-grow px-2 md:px-4 py-4 md:py-8 md:ml-0 overflow-hidden">
		<div class="flex h-[calc(100vh-9rem)] md:h-[calc(100vh-11rem)] bg-white rounded-xl md:rounded-2xl shadow-2xl border-2 border-pink-300 overflow-hidden animate-fade-in-up">
			<!-- Chat List Sidebar -->
			<div class="chat-list w-full md:w-80 border-r-2 border-pink-200 flex flex-col" class:hidden={!showChatList}>
				<div class="p-3 md:p-4 border-b-2 border-pink-200 flex items-center justify-between animate-fade-in" style="animation-delay: 0.1s">
					<div>
						<h2 class="text-base md:text-lg font-bold text-pink-500">Messages</h2>
						<p class="text-xs text-pink-400">
							{#if chatList.length === 0}
								Loading...
							{:else}
								{chatList.length} friend{chatList.length !== 1 ? 's' : ''}
							{/if}
						</p>
					</div>
					{#if isMobile && selectedFriend && !showChatList}
						<button
							onclick={backToChatList}
							class="p-2 text-pink-500 hover:bg-pink-100 rounded-lg transition-colors"
							aria-label="Back to chat list"
							title="Back to chat list"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
							</svg>
						</button>
					{/if}
				</div>
				<div class="flex-1 overflow-y-auto">
					{#if chatList.length === 0}
						<div class="text-center py-8 px-4">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 md:w-16 md:h-16 text-pink-200 mx-auto mb-3">
								<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
							</svg>
							<p class="text-sm text-pink-400">No friends yet</p>
							<p class="text-xs text-pink-300 mt-1">Add friends to start chatting!</p>
						</div>
					{:else}
						{#each chatList as friend (friend.friend_id)}
							<div
								onclick={() => selectFriend(friend)}
								onkeydown={(e) => e.key === 'Enter' && selectFriend(friend)}
								class="p-3 md:p-4 border-b border-pink-100 cursor-pointer transition-all duration-200 hover:bg-pink-50"
								class:bg-pink-100={selectedFriend?.friend_id === friend.friend_id}
								role="button"
								tabindex="0"
								aria-label={`Chat with ${friend.username}`}
							>
								<div class="flex items-center space-x-2 md:space-x-3">
									<div class="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-r from-pink-400 to-pink-600 flex items-center justify-center text-white font-bold flex-shrink-0 text-sm md:text-base">
										{friend.username.charAt(0).toUpperCase()}
									</div>
									<div class="flex-1 min-w-0">
										<div class="flex items-center justify-between">
											<p class="text-xs md:text-sm font-semibold text-pink-700 truncate">{friend.username}</p>
											{#if friend.last_message_time}
												<span class="text-xs text-pink-400 flex-shrink-0 ml-2">{formatDate(friend.last_message_time)}</span>
											{/if}
										</div>
										<div class="flex items-center justify-between">
											<p class="text-xs text-pink-400 truncate">
												{#if friend.last_message}
													{friend.last_message}
												{:else}
													<span class="text-pink-300">Start a conversation</span>
												{/if}
											</p>
											{#if friend.unread_count > 0}
												<span class="w-4 h-4 md:w-5 md:h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0 ml-2">
													{friend.unread_count}
												</span>
											{/if}
										</div>
									</div>
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</div>

			<!-- Chat Box -->
			<div class="chat-box flex-1 flex flex-col animate-fade-in-up" style="animation-delay: 0.2s" class:hidden={showChatList && isMobile} role="region" aria-label="Chat conversation">
				{#if selectedFriend}
					<!-- Chat Header -->
					<div class="p-3 md:p-4 border-b-2 border-pink-200 bg-gradient-to-r from-pink-50 to-pink-100">
						<div class="flex items-center space-x-2 md:space-x-3">
							{#if isMobile}
								<button
									onclick={backToChatList}
									class="p-1 text-pink-500 hover:bg-pink-100 rounded-lg transition-colors"
									aria-label="Back to chat list"
									title="Back to chat list"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
									</svg>
								</button>
							{/if}
							<div class="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-r from-pink-400 to-pink-600 flex items-center justify-center text-white font-bold text-sm md:text-base">
								{selectedFriend.username.charAt(0).toUpperCase()}
							</div>
							<div class="flex-1 min-w-0">
								<h3 class="text-sm md:text-base font-bold text-pink-700 truncate">{selectedFriend.username}</h3>
								<p class="text-xs truncate" class:text-pink-400={!friendIsActive} class:text-green-600={friendIsActive}>
									{#if friendIsActive}
										Active now
									{:else}
										Offline
									{/if}
								</p>
							</div>
							<!-- Delete Conversation Button -->
							<button
								onclick={openDeleteConvoModal}
								class="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
								aria-label="Delete conversation"
								title="Delete conversation"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
									<path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
								</svg>
							</button>
							<!-- Online Status Indicator -->
							<div class="flex items-center space-x-1" title={friendIsActive ? 'Active now' : 'Offline'}>
								<div class="w-2.5 h-2.5 rounded-full transition-colors duration-300" class:bg-green-500={friendIsActive} class:bg-gray-400={!friendIsActive}></div>
							</div>
							<!-- Refresh Button -->
							<button
								onclick={handleRefresh}
								onkeydown={(e) => e.key === 'Enter' && handleRefresh()}
								class="p-1.5 text-pink-500 hover:bg-pink-100 rounded-lg transition-colors"
								aria-label="Refresh messages"
								title="Refresh messages (Enter)"
								tabindex="0"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
								</svg>
							</button>
						</div>
					</div>

					<!-- Messages Container -->
					<div class="messages-container flex-1 overflow-y-auto p-3 md:p-4 space-y-2 md:space-y-3 bg-gradient-to-b from-pink-50/50 to-white">
						{#if isLoading && messages.length === 0}
							<div class="text-center py-8">
								<div class="animate-spin w-8 h-8 border-4 border-pink-300 border-t-pink-500 rounded-full mx-auto"></div>
								<p class="text-sm text-pink-400 mt-3">Loading messages...</p>
							</div>
						{:else if messages.length === 0}
							<div class="text-center py-8">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 md:w-16 md:h-16 text-pink-200 mx-auto mb-3">
									<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
								</svg>
								<p class="text-sm text-pink-400">No messages yet</p>
								<p class="text-xs text-pink-300 mt-1">Say hello to {selectedFriend.username}!</p>
							</div>
						{:else}
							{#each messages as message (message.id)}
								<div
									class="flex"
									class:justify-end={message.sender_id === currentUser.id}
									class:justify-start={message.sender_id !== currentUser.id}
								>
									<div
										class="max-w-[75%] md:max-w-xs lg:max-w-md px-3 md:px-4 py-2 rounded-2xl transition-all duration-200"
										class:bg-gradient-to-r={message.sender_id === currentUser.id}
										class:from-pink-400={message.sender_id === currentUser.id}
										class:to-pink-600={message.sender_id === currentUser.id}
										class:text-white={message.sender_id === currentUser.id}
										class:bg-pink-100={message.sender_id !== currentUser.id}
										class:text-pink-700={message.sender_id !== currentUser.id}
										class:border-2={message.sender_id !== currentUser.id}
										class:border-pink-200={message.sender_id !== currentUser.id}
										class:hover:shadow-lg={message.sender_id === currentUser.id}
										onclick={() => message.sender_id === currentUser.id && openDeleteModal(message)}
									>
										<!-- Message Text -->
										{#if message.message}
											<p class="text-xs md:text-sm whitespace-pre-wrap break-words">{message.message}</p>
										{/if}

										<!-- Attachments -->
										{#if message.attachments && message.attachments.length > 0}
											<div class="space-y-2 mt-2">
												{#each message.attachments as attachment (attachment.id)}
													{#if attachment.file_type === 'image'}
														<div class="relative group">
															<img
																src={getMediaUrl(attachment.file_path)}
																alt={attachment.file_name}
																class="w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity max-h-64 object-cover"
																onclick={(e) => { e.stopPropagation(); openImageViewer(getMediaUrl(attachment.file_path)); }}
															/>
															<div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all rounded-lg flex items-center justify-center pointer-events-none">
																<span class="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-50 px-2 py-1 rounded">
																	{attachment.file_name}
																</span>
															</div>
														</div>
													{:else if attachment.file_type === 'video'}
														<div class="relative bg-black rounded-lg overflow-hidden">
															<video src={getMediaUrl(attachment.file_path)} controls class="w-full max-h-64 object-contain"></video>
														</div>
													{:else if attachment.file_type === 'audio'}
														<div class="bg-white/20 rounded-lg p-2">
															<div class="flex items-center space-x-2 mb-1">
																<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
																	<path stroke-linecap="round" stroke-linejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553z" />
																</svg>
																<span class="text-xs truncate flex-1">{attachment.file_name}</span>
															</div>
															<audio src={getMediaUrl(attachment.file_path)} controls class="w-full"></audio>
														</div>
													{/if}
												{/each}
											</div>
										{/if}

										<p
											class="text-xs mt-1 text-right"
											class:text-pink-200={message.sender_id === currentUser.id}
											class:text-pink-400={message.sender_id !== currentUser.id}
										>
											{formatTime(message.created_at)}
										</p>
									</div>
								</div>
							{/each}
							<!-- Typing Indicator -->
							{#if friendIsTyping}
								<div class="flex justify-start">
									<div class="max-w-[75%] md:max-w-xs px-3 md:px-4 py-2 rounded-2xl bg-pink-100 border-2 border-pink-200">
										<div class="flex items-center space-x-2">
											<div class="flex space-x-1">
												<div class="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style="animation-delay: 0ms;"></div>
												<div class="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style="animation-delay: 150ms;"></div>
												<div class="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style="animation-delay: 300ms;"></div>
											</div>
											<span class="text-xs text-pink-500 font-medium">{selectedFriend.username} is typing...</span>
										</div>
									</div>
								</div>
							{/if}
							{#if isTyping}
								<div class="flex justify-end">
									<div class="max-w-[75%] md:max-w-xs px-3 md:px-4 py-2 rounded-2xl bg-gradient-to-r from-pink-400 to-pink-600 text-white">
										<div class="flex items-center space-x-2">
											<div class="flex space-x-1">
												<div class="w-2 h-2 bg-white rounded-full animate-bounce" style="animation-delay: 0ms;"></div>
												<div class="w-2 h-2 bg-white rounded-full animate-bounce" style="animation-delay: 150ms;"></div>
												<div class="w-2 h-2 bg-white rounded-full animate-bounce" style="animation-delay: 300ms;"></div>
											</div>
											
										</div>
									</div>
								</div>
							{/if}
						{/if}
					</div>

					<!-- Message Input -->
					<div class="p-3 md:p-4 border-t-2 border-pink-200 bg-white">
						<!-- File Previews -->
						{#if selectedFiles.length > 0}
							<div class="flex flex-wrap gap-2 mb-3 pb-2 border-b border-pink-100">
								{#each selectedFiles as file, i (file.name + i)}
									<div class="relative group">
										{#if file.type.startsWith('image/')}
											<img src={URL.createObjectURL(file)} alt="Preview" class="w-20 h-20 object-cover rounded-lg border-2 border-pink-200" />
										{:else if file.type.startsWith('video/')}
											<div class="w-20 h-20 bg-pink-100 rounded-lg border-2 border-pink-200 flex items-center justify-center">
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8 text-pink-400">
													<path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 0 1-2.25-2.25V9m1.286 5.714 3-3m0 0 3 3m-3-3v12" />
												</svg>
											</div>
										{:else if file.type.startsWith('audio/')}
											<div class="w-20 h-20 bg-pink-100 rounded-lg border-2 border-pink-200 flex items-center justify-center">
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8 text-pink-400">
													<path stroke-linecap="round" stroke-linejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553z" />
												</svg>
											</div>
										{:else}
											<div class="w-20 h-20 bg-pink-100 rounded-lg border-2 border-pink-200 flex items-center justify-center">
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8 text-pink-400">
													<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
												</svg>
											</div>
										{/if}
										<button
											onclick={() => removeFile(i)}
											class="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
												<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
											</svg>
										</button>
									</div>
								{/each}
							</div>
						{/if}
						<div class="flex items-end space-x-2">
							<!-- File Upload Button -->
							<button
								onclick={() => fileInput?.click()}
								class="p-2 md:p-3 bg-pink-100 text-pink-500 rounded-xl hover:bg-pink-200 transition-all duration-200 flex-shrink-0"
								title="Attach files"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 md:w-6 md:h-6">
									<path stroke-linecap="round" stroke-linejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
								</svg>
							</button>
							<input
								type="file"
								bind:this={fileInput}
								onchange={handleFileSelect}
								multiple
								accept="image/*,video/*,audio/*"
								class="hidden"
							/>
							<textarea
								bind:value={newMessage}
								oninput={handleTyping}
								onkeydown={handleKeyPress}
								placeholder="Type a message..."
								class="flex-1 px-3 md:px-4 py-2 md:py-3 bg-pink-50 border-2 border-pink-200 rounded-xl text-pink-700 placeholder-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 resize-none text-sm md:text-base"
								rows="1"
								style="min-height: 44px; max-height: 100px;"
							></textarea>
							<button
								onclick={sendMessage}
								disabled={isSending || (!newMessage.trim() && selectedFiles.length === 0)}
								class="p-2 md:p-3 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-xl hover:from-pink-500 hover:to-pink-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg flex-shrink-0"
							>
								{#if isSending}
									<div class="animate-spin w-4 h-4 md:w-5 md:h-5 border-2 border-white border-t-transparent rounded-full"></div>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 md:w-5 md:h-5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
									</svg>
								{/if}
							</button>
						</div>
					</div>
				{:else}
					<!-- Empty State -->
					<div class="flex-1 flex items-center justify-center bg-gradient-to-br from-pink-50/50 to-white">
						<div class="text-center px-4">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-16 h-16 md:w-24 md:h-24 text-pink-200 mx-auto mb-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
							</svg>
							<h3 class="text-lg md:text-xl font-bold text-pink-500 mb-2">Select a conversation</h3>
							<p class="text-sm md:text-base text-pink-400">Choose a friend from the list to start chatting</p>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</main>

	<!-- Footer -->
	<footer class="bg-white/85 backdrop-blur-md border-t-2 border-pink-300 flex-shrink-0">
		<div class="container mx-auto px-4 py-2 md:py-3 text-center">
			<p class="text-xs text-pink-700">
				© 2026 CHRONOMUSE. All rights reserved. Developed by Merlye Deyto
			</p>
		</div>
	</footer>

	<!-- Delete Message Modal -->
	{#if showDeleteModal}
		<div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 animate-fade-in">
			<div class="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border-2 border-pink-300 animate-bounce-in">
				<div class="text-center mb-4">
					<div class="w-16 h-16 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8 text-white">
							<path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
						</svg>
					</div>
					<h3 class="text-lg font-bold text-pink-700 mb-1">Delete Message?</h3>
					<p class="text-sm text-pink-500">This action cannot be undone.</p>
				</div>
				<div class="flex space-x-3">
					<button
						onclick={closeDeleteModal}
						class="flex-1 px-4 py-2.5 bg-white border-2 border-pink-300 text-pink-600 rounded-xl hover:bg-pink-50 transition-all duration-200 text-sm font-semibold hover:scale-105"
					>
						Cancel
					</button>
					<button
						onclick={deleteMessage}
						class="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-400 to-red-600 text-white rounded-xl hover:from-red-500 hover:to-red-700 transition-all duration-200 text-sm font-semibold shadow-md hover:scale-105"
					>
						Delete
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Delete Conversation Modal -->
	{#if showDeleteConvoModal}
		<div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 animate-fade-in">
			<div class="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border-2 border-pink-300 animate-bounce-in">
				<div class="text-center mb-4">
					<div class="w-16 h-16 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8 text-white">
							<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
						</svg>
					</div>
					<h3 class="text-lg font-bold text-pink-700 mb-1">Delete Conversation?</h3>
					<p class="text-sm text-pink-500">This will delete all messages with <strong>{selectedFriend?.username}</strong>. This action cannot be undone, and is only deleted for you.</p>
				</div>
				<div class="flex space-x-3">
					<button
						onclick={closeDeleteConvoModal}
						class="flex-1 px-4 py-2.5 bg-white border-2 border-pink-300 text-pink-600 rounded-xl hover:bg-pink-50 transition-all duration-200 text-sm font-semibold hover:scale-105"
					>
						Cancel
					</button>
					<button
						onclick={deleteConversation}
						class="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-400 to-red-600 text-white rounded-xl hover:from-red-500 hover:to-red-700 transition-all duration-200 text-sm font-semibold shadow-md hover:scale-105"
					>
						Delete All
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Full Screen Image Viewer -->
	{#if showImageViewer}
		<div 
			class="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center p-4 animate-fade-in"
			onclick={closeImageViewer}
		>
			<!-- Close Button -->
			<button
				onclick={closeImageViewer}
				class="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all z-50"
				title="Close"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6 text-white">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
				</svg>
			</button>
			
			<!-- Download Button -->
			<button
				onclick={(e) => { e.stopPropagation(); downloadImage(); }}
				class="absolute top-4 left-4 p-3 bg-green-500/50 hover:bg-green-500/70 rounded-full transition-all z-50"
				title="Download image"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6 text-white">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
				</svg>
			</button>
			
			<!-- Image -->
			<img 
				src={imageViewerSrc} 
				alt="Full screen view" 
				class="max-w-full max-h-full object-contain"
				onclick={(e) => e.stopPropagation()}
			/>
		</div>
	{/if}
</div>

<style>
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes fade-in-page {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
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

	@keyframes bounce-in {
		0% {
			opacity: 0;
			transform: scale(0.3) translateY(-100px);
		}
		50% {
			transform: scale(1.05) translateY(0);
		}
		70% {
			transform: scale(0.9);
		}
		100% {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.animate-fade-in {
		animation: fade-in 0.2s ease-out;
	}

	.animate-fade-in-page {
		animation: fade-in-page 0.6s ease-out;
	}

	.animate-slide-down {
		animation: slide-down 0.5s ease-out;
	}

	.animate-fade-in-up {
		animation: fade-in-up 0.6s ease-out forwards;
		opacity: 0;
	}

	.animate-bounce-in {
		animation: bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
	}
</style>
