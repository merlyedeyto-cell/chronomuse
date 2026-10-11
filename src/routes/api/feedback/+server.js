import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import { saveLocalFeedback } from '$lib/server/feedbackStore';

export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const {
			user_id = null,
			username = 'anonymous',
			email = null,
			category = 'suggestion',
			title = 'General Concern',
			message = ''
		} = body;

		if (!message || !message.trim()) {
			return json({ error: 'Feedback message cannot be empty' }, { status: 400 });
		}

		const cleanCategory = ['bug', 'help', 'suggestion'].includes(category) ? category : 'suggestion';
		const cleanTitle = (title && title.trim()) ? title.trim() : (cleanCategory === 'bug' ? 'Bug Report' : cleanCategory === 'help' ? 'Help Request' : 'Feature Suggestion');
		const cleanMessage = message.trim();

		// 1. Resolve Admin User (Merlye)
		let adminId = 12; // Default known ID for @merlye
		try {
			const { data: adminRow } = await supabase
				.from('chronomuse_users')
				.select('id, username')
				.eq('username', 'merlye')
				.maybeSingle();

			if (adminRow?.id) {
				adminId = adminRow.id;
			}
		} catch (uErr) {
			console.error('Error finding admin user:', uErr);
		}

		// 2. Send as direct message to Admin Merlye in chronomuse_messages if user is logged in
		let messageSent = false;
		if (user_id && String(user_id) !== String(adminId)) {
			try {
				const categoryLabel = cleanCategory === 'bug' ? '🐛 Bug Report' : cleanCategory === 'help' ? '💬 Concern / Help' : '💡 Suggestion';
				const formattedChatMessage = `[Need Help or Suggestion: ${categoryLabel}]\n📌 ${cleanTitle}\n\n${cleanMessage}`;

				const { error: msgErr } = await supabase
					.from('chronomuse_messages')
					.insert([
						{
							sender_id: user_id,
							receiver_id: adminId,
							message: formattedChatMessage,
							is_read: false
						}
					]);

				if (!msgErr) {
					messageSent = true;
				}
			} catch (mErr) {
				console.error('Failed to insert message to admin:', mErr);
			}
		}

		// 3. Attempt insertion into chronomuse_feedbacks table if exists
		let dbSaved = false;
		try {
			const { error: fbErr } = await supabase
				.from('chronomuse_feedbacks')
				.insert([
					{
						user_id: user_id ? Number(user_id) : null,
						username,
						category: cleanCategory,
						title: cleanTitle,
						message: cleanMessage,
						status: 'new'
					}
				]);

			if (!fbErr) {
				dbSaved = true;
			}
		} catch (fbErr) {
			// Expected if table hasn't been created yet in Supabase
		}

		// 4. Save to persistent server store (guarantees admin portal always has it)
		const savedItem = saveLocalFeedback({
			user_id: user_id ? Number(user_id) : null,
			username,
			email,
			category: cleanCategory,
			title: cleanTitle,
			message: cleanMessage,
			status: 'new',
			created_at: new Date().toISOString()
		});

		return json({
			success: true,
			data: {
				saved: true,
				chat_forwarded: messageSent,
				db_saved: dbSaved,
				feedback: savedItem
			},
			message: 'Your concern has been submitted directly to Admin Merlye.'
		});
	} catch (err) {
		console.error('Feedback API error:', err);
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
}
