import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import bcrypt from 'bcryptjs';

export async function POST({ request }) {
	try {
		const { username, email, password } = await request.json();

		if (!username || !email || !password) {
			return json({ error: 'Username, email, and password are required' }, { status: 400 });
		}

		// Check if username already exists
		const { data: existingUserByUsername } = await supabase
			.from('chronomuse_users')
			.select('id')
			.eq('username', username)
			.maybeSingle();

		if (existingUserByUsername) {
			return json({ error: 'Username already taken' }, { status: 400 });
		}

		// Check if email already exists
		const { data: existingUserByEmail } = await supabase
			.from('chronomuse_users')
			.select('id')
			.eq('email', email)
			.maybeSingle();

		if (existingUserByEmail) {
			return json({ error: 'Email already registered' }, { status: 400 });
		}

		// Hash password
		const hashedPassword = await bcrypt.hash(password, 10);

		// Insert user
		let { data: newUser, error: insertError } = await supabase
			.from('chronomuse_users')
			.insert([
				{ username, email, password: hashedPassword, last_activity: new Date().toISOString() }
			])
			.select('id, username, email, avatar_url')
			.single();

		if (insertError && insertError.message?.includes('avatar_url')) {
			const fallback = await supabase
				.from('chronomuse_users')
				.insert([
					{ username, email, password: hashedPassword, last_activity: new Date().toISOString() }
				])
				.select('id, username, email')
				.single();
			newUser = fallback.data;
			insertError = fallback.error;
		}

		if (insertError) {
			return json({ error: 'Database error: ' + insertError.message }, { status: 500 });
		}

		return json({
			user: newUser,
			message: 'Registration successful'
		});
	} catch (err) {
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
