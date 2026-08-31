// Dynamic API Configuration
// Automatically detects the environment and sets the correct API base URL

let API_BASE_URL = '';

// Check if running in browser
if (typeof window !== 'undefined') {
	const hostname = window.location.hostname;
	const protocol = window.location.protocol;
	const port = window.location.port;
	
	// Production: InfinityFree or any remote hosting
	// Localhost: Development environment
	if (hostname === 'localhost' || hostname === '127.0.0.1') {
		// Use relative path - Vite proxy will forward to XAMPP
		API_BASE_URL = '/api';
	} else {
		// For InfinityFree and other hosting providers
		// Uses relative path to avoid CORS issues
		API_BASE_URL = '/api';
	}
}

// API endpoints
export const API_ENDPOINTS = {
	login: `${API_BASE_URL}/login`,
	register: `${API_BASE_URL}/register`,
	getMessages: `${API_BASE_URL}/get_messages.php`,
	sendMessage: `${API_BASE_URL}/send_message.php`,
	deleteMessage: `${API_BASE_URL}/delete_message.php`,
	deleteConversation: `${API_BASE_URL}/delete_conversation.php`,
	getChatList: `${API_BASE_URL}/get_chat_list.php`,
	updateActivity: `${API_BASE_URL}/update_activity.php`,
	updateTypingStatus: `${API_BASE_URL}/update_typing_status.php`,
	getTypingStatus: `${API_BASE_URL}/get_typing_status.php`,
	getFriendsList: `${API_BASE_URL}/get_friends_list.php`,
	addFriend: `${API_BASE_URL}/add_friend.php`,
	removeFriend: `${API_BASE_URL}/remove_friend.php`,
	getFriendRequests: `${API_BASE_URL}/get_friend_requests.php`,
	getFriendRequestsCount: `${API_BASE_URL}/get_friend_requests_count.php`,
	respondToFriendRequest: `${API_BASE_URL}/respond_to_friend_request.php`,
	getPinnedMemories: `${API_BASE_URL}/get_pinned_memories.php`,
	updatePinnedDateTitle: `${API_BASE_URL}/update_pinned_date_title.php`,
	deletePinnedDate: `${API_BASE_URL}/delete_pinned_date.php`,
	pinDate: `${API_BASE_URL}/pin_date.php`,
	saveMemory: `${API_BASE_URL}/save_memory`,
	deleteMemory: `${API_BASE_URL}/delete_memory`,
	updateMemory: `${API_BASE_URL}/update_memory`,
	getMemoriesForMonth: `${API_BASE_URL}/get_memories_for_month`,
	getMemoriesByDate: `${API_BASE_URL}/get_memories_by_date`,
	getMoodData: `${API_BASE_URL}/get_mood_data.php`,
	updateProfile: `${API_BASE_URL}/update_profile.php`,
	pinMemory: `${API_BASE_URL}/pin_memory.php`,
	unpinMemory: `${API_BASE_URL}/unpin_memory.php`
};

// Helper function to make API calls
export async function apiCall(endpoint, options = {}) {
	const defaultOptions = {
		headers: {
			'Content-Type': 'application/json',
		},
	};

	const config = { ...defaultOptions, ...options };

	try {
		const response = await fetch(endpoint, config);
		const data = await response.json();
		
		if (!response.ok) {
			throw new Error(data.error || 'API request failed');
		}
		
		return data;
	} catch (error) {
		console.error('API call error:', error);
		throw error;
	}
}

// Helper for POST requests
export async function apiPost(endpoint, data) {
	return apiCall(endpoint, {
		method: 'POST',
		body: JSON.stringify(data)
	});
}

// Helper for GET requests
export async function apiGet(endpoint, params = {}) {
	const url = new URL(endpoint);
	Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
	return apiCall(url.toString(), { method: 'GET' });
}

export default API_BASE_URL;
