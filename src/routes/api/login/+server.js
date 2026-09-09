import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import bcrypt from 'bcryptjs';

export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const usernameOrEmail = body.usernameOrEmail?.trim();
		const password = body.password;

		if (!usernameOrEmail || !password) {
			return json({ error: 'Username/Email and password are required' }, { status: 400 });
		}

		// Check if input is email or username (case-insensitive)
		const isEmail = usernameOrEmail.includes('@');

		let query = supabase.from('chronomuse_users').select('*');
		if (isEmail) {
			query = query.ilike('email', usernameOrEmail);
		} else {
			query = query.ilike('username', usernameOrEmail);
		}

		const { data: user, error } = await query.maybeSingle();

		if (error) {
			console.error('Login DB Query Error:', error);
			return json({ error: 'Database query error: ' + error.message }, { status: 200 });
		}

		if (!user) {
			return json({ error: 'Invalid username/email or password' }, { status: 200 });
		}

		// Verify password safely (bcrypt with plain-text fallback for legacy records)
		let isPasswordCorrect = false;
		if (user.password) {
			if (user.password === password) {
				isPasswordCorrect = true;
			} else {
				try {
					isPasswordCorrect = await bcrypt.compare(password, user.password);
				} catch (bErr) {
					isPasswordCorrect = (user.password === password);
				}
			}
		}

		if (!isPasswordCorrect) {
			return json({ error: 'Invalid username/email or password' }, { status: 200 });
		}

		// Update last_activity timestamp safely
		const nowIso = new Date().toISOString();
		try {
			await supabase
				.from('chronomuse_users')
				.update({ last_activity: nowIso })
				.eq('id', user.id);
		} catch (actErr) {
			console.warn('Could not update last_activity on login:', actErr);
		}

		// Return success response with user data
		return json({
			success: true,
			data: {
				user: {
					id: user.id,
					username: user.username,
					email: user.email,
					avatar_url: user.avatar_url || null,
					cover_url: user.cover_url || null,
					note: user.note || null
				}
			},
			message: 'Login successful'
		});
	} catch (err) {
		console.error('Login Endpoint Catch Error:', err);
		return json({ error: 'An unexpected error occurred during login: ' + err.message }, { status: 200 });
	}
}
