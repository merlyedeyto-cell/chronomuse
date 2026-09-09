import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import { saveReactivationRequest } from '$lib/server/suspensionStore';

export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const { user_id, username, email, reason } = body;

		if (!user_id && !username && !email) {
			return json({ error: 'User identifier is required' }, { status: 400 });
		}

		// Find user details if only partial info provided
		let targetUserId = user_id;
		let targetUsername = username;
		let targetEmail = email;

		if (!targetUserId || !targetUsername) {
			let query = supabase.from('chronomuse_users').select('id, username, email');
			if (targetUserId) {
				query = query.eq('id', targetUserId);
			} else if (targetUsername) {
				query = query.ilike('username', targetUsername);
			} else if (targetEmail) {
				query = query.ilike('email', targetEmail);
			}

			const { data: foundUser } = await query.maybeSingle();
			if (foundUser) {
				targetUserId = foundUser.id;
				targetUsername = foundUser.username;
				targetEmail = foundUser.email;
			}
		}

		if (!targetUserId) {
			return json({ error: 'Could not find account to reactivate' }, { status: 404 });
		}

		// Save in persistent server store
		saveReactivationRequest({
			user_id: targetUserId,
			username: targetUsername,
			email: targetEmail,
			reason
		});

		// Also attempt DB insert/update in Supabase
		try {
			const { data: existing } = await supabase
				.from('chronomuse_reactivation_requests')
				.select('id')
				.eq('user_id', targetUserId)
				.eq('status', 'pending')
				.maybeSingle();

			if (existing?.id) {
				await supabase
					.from('chronomuse_reactivation_requests')
					.update({
						reason: (reason || '').trim(),
						updated_at: new Date().toISOString()
					})
					.eq('id', existing.id);
			} else {
				await supabase
					.from('chronomuse_reactivation_requests')
					.insert([{
						user_id: targetUserId,
						username: targetUsername || 'user_' + targetUserId,
						email: targetEmail || '—',
						reason: (reason || '').trim(),
						status: 'pending',
						created_at: new Date().toISOString()
					}]);
			}
		} catch (dbErr) {
			console.warn('Reactivation DB table warning:', dbErr);
		}

		// Realtime broadcast to notify admin live
		try {
			const channel = supabase.channel('chronomuse_admin_notifications');
			await channel.send({
				type: 'broadcast',
				event: 'reactivation_appeal_submitted',
				payload: {
					user_id: targetUserId,
					username: targetUsername,
					email: targetEmail,
					reason: reason || '',
					timestamp: new Date().toISOString()
				}
			});
			supabase.removeChannel(channel);
		} catch (e) {}

		return json({
			success: true,
			message: 'Your reactivation appeal has been submitted. The administrator will review your account.'
		});
	} catch (err) {
		console.error('Request Reactivation Error:', err);
		return json({ error: err.message }, { status: 500 });
	}
}
