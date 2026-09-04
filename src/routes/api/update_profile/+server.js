import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import bcrypt from 'bcryptjs';

export async function POST({ request }) {
	try {
		let user_id;
		let username;
		let email;
		let new_password;
		let avatar_url;
		let avatarFile = null;

		const contentType = request.headers.get('content-type') || '';
		if (contentType.includes('multipart/form-data')) {
			const formData = await request.formData();
			user_id = formData.get('user_id');
			username = formData.get('username');
			email = formData.get('email');
			new_password = formData.get('new_password');
			avatar_url = formData.get('avatar_url');
			avatarFile = formData.get('avatar');
		} else {
			const body = await request.json();
			user_id = body.user_id;
			username = body.username;
			email = body.email;
			new_password = body.new_password;
			avatar_url = body.avatar_url;
		}

		if (!user_id) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		// Handle Avatar File Upload if provided
		if (avatarFile && avatarFile.size > 0) {
			try {
				const fileExt = avatarFile.name.split('.').pop() || 'jpg';
				const fileName = `avatar_${user_id}_${Date.now()}.${fileExt}`;
				const filePath = `avatars/${fileName}`;

				const { error: uploadError } = await supabase.storage
					.from('memories')
					.upload(filePath, avatarFile, { upsert: true });

				if (!uploadError) {
					const { data: urlData } = supabase.storage.from('memories').getPublicUrl(filePath);
					if (urlData?.publicUrl) {
						avatar_url = urlData.publicUrl;
					}
				}
			} catch (uploadErr) {
				console.error('Avatar upload exception:', uploadErr);
			}
		}

		// Check if username is taken by another user
		if (username) {
			const { data: existingUserByUsername } = await supabase
				.from('chronomuse_users')
				.select('id')
				.eq('username', username)
				.neq('id', user_id)
				.maybeSingle();

			if (existingUserByUsername) {
				return json({ error: 'Username is already taken' }, { status: 400 });
			}
		}

		// Check if email is taken by another user
		if (email) {
			const { data: existingUserByEmail } = await supabase
				.from('chronomuse_users')
				.select('id')
				.eq('email', email)
				.neq('id', user_id)
				.maybeSingle();

			if (existingUserByEmail) {
				return json({ error: 'Email is already registered by another account' }, { status: 400 });
			}
		}

		const updateData = {};
		if (username) updateData.username = username;
		if (email) updateData.email = email;
		if (avatar_url !== undefined && avatar_url !== null) updateData.avatar_url = avatar_url;

		// If a new password is provided, hash it
		if (new_password && new_password.trim() !== '') {
			if (new_password.length < 6) {
				return json({ error: 'Password must be at least 6 characters long' }, { status: 400 });
			}
			updateData.password = await bcrypt.hash(new_password, 10);
		}

		let updatedUser = null;

		// Try updating with avatar_url
		let { data: userWithAvatar, error: updateError } = await supabase
			.from('chronomuse_users')
			.update(updateData)
			.eq('id', user_id)
			.select('id, username, email, avatar_url')
			.single();

		if (updateError && updateError.message?.includes('avatar_url')) {
			// If column avatar_url does not exist, update without avatar_url
			delete updateData.avatar_url;
			const { data: fallbackUser, error: fallbackError } = await supabase
				.from('chronomuse_users')
				.update(updateData)
				.eq('id', user_id)
				.select('id, username, email')
				.single();

			if (fallbackError) {
				return json({ error: 'Database update error: ' + fallbackError.message }, { status: 500 });
			}
			updatedUser = { ...fallbackUser, avatar_url: avatar_url || null };
		} else if (updateError) {
			return json({ error: 'Database update error: ' + updateError.message }, { status: 500 });
		} else {
			updatedUser = userWithAvatar;
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
