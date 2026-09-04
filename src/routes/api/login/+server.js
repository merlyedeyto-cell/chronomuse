import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import bcrypt from 'bcryptjs';

export async function POST({ request }) {
	try {
		const { usernameOrEmail, password } = await request.json();

		if (!usernameOrEmail || !password) {
			return json({ error: 'Username/Email and password are required' }, { status: 400 });
		}

		// Check if input is email or username
		const isEmail = usernameOrEmail.includes('@');

		let query = supabase.from('chronomuse_users').select('*');
		if (isEmail) {
			query = query.eq('email', usernameOrEmail);
		} else {
			query = query.eq('username', usernameOrEmail);
		}

		const { data: user, error } = await query.maybeSingle();

		if (error) {
			return json({ error: 'Database error: ' + error.message }, { status: 500 });
		}

		if (!user) {
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		// Verify password
		const isPasswordCorrect = await bcrypt.compare(password, user.password);
		if (!isPasswordCorrect) {
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		// Return success response with user data
		return json({
			data: {
				user: {
					id: user.id,
					username: user.username,
					email: user.email,
					avatar_url: user.avatar_url || null
				}
			},
			message: 'Login successful'
		});
	} catch (err) {
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
