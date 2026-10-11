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

		// 1. Resolve Official Support Account (chronomuse_support)
		let adminId = 14; // Default known ID for @chronomuse_support
		let adminUsername = 'chronomuse_support';
		try {
			const { data: supportRow } = await supabase
				.from('chronomuse_users')
				.select('id, username')
				.eq('username', 'chronomuse_support')
				.maybeSingle();

			if (supportRow?.id) {
				adminId = supportRow.id;
				adminUsername = supportRow.username;
			}
		} catch (uErr) {
			console.error('Error finding support user:', uErr);
		}

		// 2. Save to chronomuse_feedbacks table
		let dbSaved = false;
		let dbFeedbackId = null;
		try {
			const { data: fbRow, error: fbErr } = await supabase
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
				])
				.select()
				.maybeSingle();

			if (!fbErr && fbRow?.id) {
				dbSaved = true;
				dbFeedbackId = fbRow.id;
			}
		} catch (fbErr) {
			// Expected if table hasn't been created yet in Supabase
		}

		// 3. Save to persistent server store (guarantees admin portal always has it)
		const savedItem = saveLocalFeedback({
			id: dbFeedbackId || Date.now(),
			user_id: user_id ? Number(user_id) : null,
			username,
			email,
			category: cleanCategory,
			title: cleanTitle,
			message: cleanMessage,
			status: 'new',
			created_at: new Date().toISOString()
		});

		const ticketId = dbFeedbackId || savedItem?.id || Date.now();

		// 4. Send as scoped ticket message in chronomuse_messages if user is logged in
		let messageSent = false;
		if (user_id && String(user_id) !== String(adminId)) {
			try {
				const categoryLabel = cleanCategory === 'bug' ? 'Bug Report' : cleanCategory === 'help' ? 'Concern / Help' : 'Suggestion';
				const formattedChatMessage = `[TICKET id="${ticketId}"]\n[Need Help or Suggestion: ${categoryLabel}]\n${cleanTitle}\n\n${cleanMessage}[/TICKET]`;

				// Try with feedback_id first, fallback without if column not migrated
				let { error: msgErr } = await supabase
					.from('chronomuse_messages')
					.insert([
						{
							sender_id: user_id,
							receiver_id: adminId,
							message: formattedChatMessage,
							is_read: false,
							feedback_id: ticketId
						}
					]);

				if (msgErr && msgErr.message?.includes('feedback_id')) {
					const fallbackInsert = await supabase
						.from('chronomuse_messages')
						.insert([
							{
								sender_id: user_id,
								receiver_id: adminId,
								message: formattedChatMessage,
								is_read: false
							}
						]);
					msgErr = fallbackInsert.error;
				}

				if (!msgErr) {
					messageSent = true;
				}
			} catch (mErr) {
				console.error('Failed to insert message to support:', mErr);
			}
		}

		return json({
			success: true,
			data: {
				saved: true,
				chat_forwarded: messageSent,
				db_saved: dbSaved,
				feedback: savedItem,
				admin_id: adminId,
				admin_username: adminUsername,
				ticket_id: ticketId
			},
			message: 'Your concern has been forwarded to ChronoMuse Support.'
		});
	} catch (err) {
		console.error('Feedback API error:', err);
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
}
