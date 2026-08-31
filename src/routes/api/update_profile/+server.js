import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import bcrypt from 'bcryptjs';

export async function POST({ request }) {
	try {
		const { user_id, username, email, new_password } = await request.json();

		if (!user_id || !username || !email) {
			return json({ error: 'User ID, username, and email are required' }, { status: 400 });
		}

		// Check if username is taken by another user
		const { data: existingUserByUsername } = await supabase
			.from('chronomuse_users')
			.select('id')
			.eq('username', username)
			.neq('id', user_id)
			.maybeSingle();

		if (existingUserByUsername) {
			return json({ error: 'Username is already taken' }, { status: 400 });
		}

		// Check if email is taken by another user
		const { data: existingUserByEmail } = await supabase
			.from('chronomuse_users')
			.select('id')
			.eq('email', email)
			.neq('id', user_id)
			.maybeSingle();

		if (existingUserByEmail) {
			return json({ error: 'Email is already registered by another account' }, { status: 400 });
		}

		const updateData = {
			username,
			email
		};

		// If a new password is provided, hash it
		if (new_password && new_password.trim() !== '') {
			if (new_password.length < 6) {
				return json({ error: 'Password must be at least 6 characters long' }, { status: 400 });
			}
			updateData.password = await bcrypt.hash(new_password, 10);
		}

		const { data: updatedUser, error } = await supabase
			.from('chronomuse_users')
			.update(updateData)
			.eq('id', user_id)
			.select('id, username, email')
			.single();

		if (error) {
			return json({ error: 'Database update error: ' + error.message }, { status: 500 });
		}

		return json({
			success: true,
			user: updatedUser,
			message: 'Profile updated successfully'
		});
	} catch (err) {
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
