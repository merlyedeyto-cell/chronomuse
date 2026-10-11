import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedbacks.json');

function ensureDataFile() {
	try {
		if (!fs.existsSync(DATA_DIR)) {
			fs.mkdirSync(DATA_DIR, { recursive: true });
		}
		if (!fs.existsSync(FEEDBACK_FILE)) {
			fs.writeFileSync(FEEDBACK_FILE, JSON.stringify([]), 'utf-8');
		}
	} catch (e) {
		console.error('Failed to initialize feedback file:', e);
	}
}

export function getLocalFeedbacks() {
	try {
		ensureDataFile();
		const raw = fs.readFileSync(FEEDBACK_FILE, 'utf-8');
		const list = JSON.parse(raw);
		return Array.isArray(list) ? list : [];
	} catch (e) {
		return [];
	}
}

export function saveLocalFeedback(feedback) {
	try {
		ensureDataFile();
		const list = getLocalFeedbacks();
		const newRecord = {
			id: feedback.id || Date.now(),
			user_id: feedback.user_id || null,
			username: feedback.username || 'anonymous',
			email: feedback.email || null,
			category: feedback.category || 'suggestion',
			title: feedback.title || 'General Concern',
			message: feedback.message || '',
			status: feedback.status || 'new',
			created_at: feedback.created_at || new Date().toISOString()
		};
		list.unshift(newRecord);
		// Keep up to 500 records
		fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(list.slice(0, 500), null, 2), 'utf-8');
		return newRecord;
	} catch (e) {
		console.error('Error saving local feedback:', e);
		return null;
	}
}

export function updateLocalFeedbackStatus(feedbackId, status) {
	try {
		ensureDataFile();
		const list = getLocalFeedbacks();
		const updated = list.map(item => {
			if (String(item.id) === String(feedbackId)) {
				return { ...item, status, updated_at: new Date().toISOString() };
			}
			return item;
		});
		fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(updated, null, 2), 'utf-8');
		return true;
	} catch (e) {
		return false;
	}
}

export function deleteLocalFeedback(feedbackId) {
	try {
		ensureDataFile();
		const list = getLocalFeedbacks();
		const filtered = list.filter(item => String(item.id) !== String(feedbackId));
		fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
		return true;
	} catch (e) {
		return false;
	}
}
