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
	getMessages: `${API_BASE_URL}/get_messages`,
	sendMessage: `${API_BASE_URL}/send_message`,
	deleteMessage: `${API_BASE_URL}/delete_message`,
	deleteMessages: `${API_BASE_URL}/delete_messages`,
	deleteConversation: `${API_BASE_URL}/delete_conversation`,
	getChatList: `${API_BASE_URL}/get_chat_list`,
	updateActivity: `${API_BASE_URL}/update_activity`,
	updateTypingStatus: `${API_BASE_URL}/update_typing_status`,
	getTypingStatus: `${API_BASE_URL}/get_typing_status`,
	getNotifications: `${API_BASE_URL}/get_notifications`,
	getFriendsList: `${API_BASE_URL}/get_friends_list`,
	searchUsers: `${API_BASE_URL}/search_users`,
	getSuggestedUsers: `${API_BASE_URL}/get_suggested_users`,
	addFriend: `${API_BASE_URL}/add_friend`,
	sendFriendRequest: `${API_BASE_URL}/add_friend`,
	removeFriend: `${API_BASE_URL}/remove_friend`,
	getFriendRequests: `${API_BASE_URL}/get_friend_requests`,
	getFriendRequestsCount: `${API_BASE_URL}/get_friend_requests_count`,
	respondToFriendRequest: `${API_BASE_URL}/respond_to_friend_request`,
	respondFriendRequest: `${API_BASE_URL}/respond_to_friend_request`,
	respondToSharedMemory: `${API_BASE_URL}/respond_to_shared_memory`,
	cancelSharedMemory: `${API_BASE_URL}/cancel_shared_memory`,
	cancelFriendRequest: `${API_BASE_URL}/cancel_friend_request`,
	shareMemory: `${API_BASE_URL}/share_memory`,
	getPinnedMemories: `${API_BASE_URL}/get_pinned_memories`,
	updatePinnedDateTitle: `${API_BASE_URL}/update_pinned_date_title`,
	deletePinnedDate: `${API_BASE_URL}/delete_pinned_date`,
	pinDate: `${API_BASE_URL}/pin_date`,
	saveMemory: `${API_BASE_URL}/save_memory`,
	deleteMemory: `${API_BASE_URL}/delete_memory`,
	updateMemory: `${API_BASE_URL}/update_memory`,
	getMemoriesForMonth: `${API_BASE_URL}/get_memories_for_month`,
	getMemoriesByDate: `${API_BASE_URL}/get_memories_by_date`,
	getMoodData: `${API_BASE_URL}/get_mood_data`,
	updateProfile: `${API_BASE_URL}/update_profile`,
	getProfile: `${API_BASE_URL}/get_profile`,
	blockUser: `${API_BASE_URL}/block_user`,
	pinMemory: `${API_BASE_URL}/pin_memory`,
	unpinMemory: `${API_BASE_URL}/unpin_memory`,
	getAffirmation: `${API_BASE_URL}/get_affirmation`
};

/**
 * Helper function to make API calls
 * @param {string} endpoint
 * @param {RequestInit} [options]
 */
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

/**
 * Helper for POST requests
 * @param {string} endpoint
 * @param {any} [data]
 */
export async function apiPost(endpoint, data) {
	return apiCall(endpoint, {
		method: 'POST',
		body: JSON.stringify(data)
	});
}

/**
 * Helper for GET requests
 * @param {string} endpoint
 * @param {Record<string, any>} [params]
 */
export async function apiGet(endpoint, params = {}) {
	const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
	const url = new URL(endpoint, base);
	Object.keys(params).forEach(key => {
		if (params[key] !== undefined && params[key] !== null) {
			url.searchParams.append(key, String(params[key]));
		}
	});
	return apiCall(url.toString(), { method: 'GET' });
}

export default API_BASE_URL;
