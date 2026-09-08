import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

const TWENTY_FOUR_HOURS_AGO = () => {
	const d = new Date();
	d.setHours(d.getHours() - 24);
	return d.toISOString();
};

// GET: fetch own note + friends notes (all < 24hrs)
export async function GET({ url }) {
	try {
		const user_id = url.searchParams.get('user_id');
		const friend_ids_raw = url.searchParams.get('friend_ids');

		if (!user_id) {
			return json({ error: 'user_id is required' }, { status: 400 });
		}

		const cutoff = TWENTY_FOUR_HOURS_AGO();
		const ids = [Number(user_id)];
		if (friend_ids_raw) {
			friend_ids_raw.split(',').map(Number).filter(Boolean).forEach((id) => ids.push(id));
		}

		const { data: notes, error } = await supabase
			.from('chronomuse_user_notes')
			.select('user_id, note_text, created_at')
			.in('user_id', ids)
			.gte('created_at', cutoff);

		if (error) {
			return json({ success: true, data: { notes: [] } });
		}

		return json({ success: true, data: { notes: notes || [] } });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}

// POST: upsert own note (max 60 chars)
export async function POST({ request }) {
	try {
		const { user_id, note_text } = await request.json();

		if (!user_id) {
			return json({ error: 'user_id is required' }, { status: 400 });
		}

		const trimmed = (note_text || '').trim().slice(0, 60);

		if (!trimmed) {
			return json({ error: 'Note text cannot be empty' }, { status: 400 });
		}

		const { error } = await supabase.from('chronomuse_user_notes').upsert(
			{
				user_id: Number(user_id),
				note_text: trimmed,
				created_at: new Date().toISOString()
			},
			{ onConflict: 'user_id' }
		);

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		return json({ success: true, message: 'Note saved!' });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}

// DELETE: clear own note
export async function DELETE({ request }) {
	try {
		const { user_id } = await request.json();

		if (!user_id) {
			return json({ error: 'user_id is required' }, { status: 400 });
		}

		const { error } = await supabase
			.from('chronomuse_user_notes')
			.delete()
			.eq('user_id', Number(user_id));

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		return json({ success: true, message: 'Note cleared.' });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
