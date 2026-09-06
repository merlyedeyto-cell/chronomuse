import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, target_id, action = 'block' } = await request.json();

		if (!user_id) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		if (action === 'get_blocked') {
			const { data: blockedRows, error: fetchErr } = await supabase
				.from('chronomuse_blocked_users')
				.select('blocked_id, created_at')
				.eq('blocker_id', user_id);

			if (fetchErr) {
				return json({ success: true, data: [] });
			}

			const blockedIds = (blockedRows || []).map(r => r.blocked_id);
			if (blockedIds.length === 0) {
				return json({ success: true, data: [] });
			}

			const { data: userList } = await supabase
				.from('chronomuse_users')
				.select('id, username, email, avatar_url')
				.in('id', blockedIds);

			return json({ success: true, data: userList || [] });
		}

		if (!target_id) {
			return json({ error: 'Target User ID is required' }, { status: 400 });
		}

		if (action === 'unblock') {
			await supabase
				.from('chronomuse_blocked_users')
				.delete()
				.eq('blocker_id', user_id)
				.eq('blocked_id', target_id);

			return json({ success: true, message: 'User unblocked successfully' });
		}

		// Block action
		const { error } = await supabase
			.from('chronomuse_blocked_users')
			.upsert({ blocker_id: user_id, blocked_id: target_id }, { onConflict: 'blocker_id,blocked_id' });

		if (error && !error.message?.includes('already exists')) {
			console.error('Block DB error:', error);
		}

		// Also remove any active friendship and friend requests when blocked
		try {
			await supabase
				.from('chronomuse_friends')
				.delete()
				.or(`and(user_id.eq.${user_id},friend_id.eq.${target_id}),and(user_id.eq.${target_id},friend_id.eq.${user_id})`);
				
			await supabase
				.from('chronomuse_friend_requests')
				.delete()
				.or(`and(sender_id.eq.${user_id},receiver_id.eq.${target_id}),and(sender_id.eq.${target_id},receiver_id.eq.${user_id})`);
		} catch (e) {}

		return json({ success: true, message: 'User blocked successfully' });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
