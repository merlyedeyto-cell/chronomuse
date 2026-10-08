import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id } = await request.json();

		if (!user_id) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		// Get all friend relationships for this user
		const { data: friendships, error: friendError } = await supabase
			.from('chronomuse_friends')
			.select('id, friend_id, created_at')
			.eq('user_id', user_id);

		if (friendError) {
			return json({ error: friendError.message }, { status: 500 });
		}

		if (!friendships || friendships.length === 0) {
			return json({ success: true, data: { friends: [] } });
		}

		const friendIds = friendships.map(f => f.friend_id);

		// Get friend details
		const { data: friendUsers, error: userError } = await supabase
			.from('chronomuse_users')
			.select('id, username, email, avatar_url, last_activity, bio')
			.in('id', friendIds);

		if (userError) {
			return json({ error: userError.message }, { status: 500 });
		}

		const friends = friendUsers.map(u => {
			const rel = friendships.find(f => f.friend_id === u.id);
			return {
				friendship_id: rel ? rel.id : u.id,
				friend_id: u.id,
				username: u.username,
				email: u.email,
				bio: u.bio || null,
				avatar_url: u.avatar_url || null,
				last_activity: u.last_activity,
				created_at: rel ? rel.created_at : null,
				friends_since: rel ? rel.created_at : null
			};
		});

		return json({ success: true, data: { friends } });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
