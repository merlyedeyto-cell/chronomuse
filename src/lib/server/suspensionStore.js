import fs from 'fs';
import path from 'path';

const DATA_FILE = path.resolve(process.cwd(), '.chronomuse_admin_state.json');

// In-memory cache
let stateCache = null;

function loadState() {
	if (stateCache && typeof stateCache === 'object' && stateCache.userStatuses) {
		return stateCache;
	}

	try {
		if (fs.existsSync(DATA_FILE)) {
			const raw = fs.readFileSync(DATA_FILE, 'utf-8');
			if (raw && raw.trim()) {
				const parsed = JSON.parse(raw);
				if (parsed && typeof parsed === 'object') {
					if (!parsed.userStatuses) parsed.userStatuses = {};
					if (!Array.isArray(parsed.reactivationRequests)) parsed.reactivationRequests = [];
					stateCache = parsed;
					return stateCache;
				}
			}
		}
	} catch (e) {
		console.warn('Could not read admin state file:', e.message);
	}

	if (!stateCache || typeof stateCache !== 'object') {
		stateCache = {
			userStatuses: {}, // { [userId]: 'suspended' | 'active' }
			reactivationRequests: []
		};
	}

	if (!stateCache.userStatuses) stateCache.userStatuses = {};
	if (!Array.isArray(stateCache.reactivationRequests)) stateCache.reactivationRequests = [];

	return stateCache;
}

function saveState() {
	try {
		if (!stateCache) return;
		fs.writeFileSync(DATA_FILE, JSON.stringify(stateCache, null, 2), 'utf-8');
	} catch (e) {
		console.error('Error saving admin state file:', e.message);
	}
}

export function getUserStatus(userId, fallbackDbStatus = 'active') {
	const state = loadState();
	const key = String(userId);
	if (state.userStatuses && state.userStatuses[key]) {
		return state.userStatuses[key];
	}
	if (fallbackDbStatus === 'suspended' || fallbackDbStatus === 'active') {
		state.userStatuses[key] = fallbackDbStatus;
		return fallbackDbStatus;
	}
	return 'active';
}

export function setUserStatus(userId, status) {
	const state = loadState();
	const key = String(userId);
	state.userStatuses[key] = status;
	
	if (status === 'active') {
		// Mark all pending appeals as approved
		state.reactivationRequests.forEach(r => {
			if (String(r.user_id) === key && r.status === 'pending') {
				r.status = 'approved';
				r.is_read = true;
				r.updated_at = new Date().toISOString();
			}
		});
	}
	
	saveState();
	return status;
}

export function getAllUserStatuses() {
	const state = loadState();
	return { ...state.userStatuses };
}

export function getPendingReactivations() {
	const state = loadState();
	return state.reactivationRequests
		.filter(r => r.status === 'pending')
		.map(r => ({ ...r, is_read: !!r.is_read }));
}

export function getAllReactivations() {
	const state = loadState();
	return state.reactivationRequests.map(r => ({ ...r, is_read: !!r.is_read }));
}

export function saveReactivationRequest({ user_id, username, email, reason }) {
	const state = loadState();
	const key = String(user_id);
	
	const existing = state.reactivationRequests.find(r => String(r.user_id) === key && r.status === 'pending');
	if (existing) {
		existing.reason = (reason || '').trim();
		existing.is_read = false; // Mark unread when user sends new or updated note
		existing.updated_at = new Date().toISOString();
		saveState();
		return existing;
	}

	const newReq = {
		id: 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
		user_id: Number(user_id) || user_id,
		username: username || 'user_' + user_id,
		email: email || '—',
		reason: (reason || '').trim(),
		status: 'pending',
		is_read: false,
		read_at: null,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	};

	state.reactivationRequests.unshift(newReq);
	saveState();
	return newReq;
}

export function markAppealRead(requestId, userId) {
	const state = loadState();
	const key = userId ? String(userId) : null;
	const reqIdStr = requestId ? String(requestId) : null;

	let found = false;
	state.reactivationRequests.forEach(r => {
		if ((reqIdStr && String(r.id) === reqIdStr) || (key && String(r.user_id) === key)) {
			r.is_read = true;
			r.read_at = new Date().toISOString();
			found = true;
		}
	});

	if (found) {
		saveState();
	}
	return found;
}

export function markAllAppealsRead() {
	const state = loadState();
	const now = new Date().toISOString();
	state.reactivationRequests.forEach(r => {
		if (r.status === 'pending') {
			r.is_read = true;
			r.read_at = now;
		}
	});
	saveState();
	return true;
}

export function resolveReactivationRequest(requestId, userId, actionType) {
	const state = loadState();
	const key = userId ? String(userId) : null;
	const reqIdStr = requestId ? String(requestId) : null;

	let found = null;
	state.reactivationRequests.forEach(r => {
		if ((reqIdStr && String(r.id) === reqIdStr) || (key && String(r.user_id) === key && r.status === 'pending')) {
			r.status = actionType === 'approve' ? 'approved' : 'dismissed';
			r.is_read = true;
			r.updated_at = new Date().toISOString();
			found = r;
		}
	});

	if (actionType === 'approve' && key) {
		state.userStatuses[key] = 'active';
	}

	saveState();
	return found;
}

export function deleteUserData(userId) {
	const state = loadState();
	const key = String(userId);
	delete state.userStatuses[key];
	state.reactivationRequests = state.reactivationRequests.filter(r => String(r.user_id) !== key);
	saveState();
}
