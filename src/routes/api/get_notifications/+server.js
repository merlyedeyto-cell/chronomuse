import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id } = await request.json();

		if (!user_id) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		// 1. Fetch shared memories tagged with this user as recipient
		const { data: sharedRows, error: sharedError } = await supabase
			.from('chronomuse_shared_memories')
			.select('id, memory_id, sender_id, created_at')
			.eq('recipient_id', user_id)
			.order('created_at', { ascending: false })
			.limit(30);

		let sharedMemories = [];
		if (sharedRows && sharedRows.length > 0) {
			const memoryIds = sharedRows.map(r => r.memory_id);
			const senderIds = [...new Set(sharedRows.map(r => r.sender_id))];

			const [memoriesRes, sendersRes, userCopiesRes] = await Promise.all([
				supabase
					.from('chronomuse_memories')
					.select('*')
					.in('id', memoryIds),
				supabase
					.from('chronomuse_users')
					.select('id, username')
					.in('id', senderIds),
				supabase
					.from('chronomuse_memories')
					.select('date, description, memory_tag')
					.eq('user_id', user_id)
			]);

			const memoriesMap = (memoriesRes.data || []).reduce((acc, m) => {
				acc[m.id] = m;
				return acc;
			}, {});

			const sendersMap = (sendersRes.data || []).reduce((acc, u) => {
				acc[u.id] = u.username;
				return acc;
			}, {});

			const userCopies = userCopiesRes.data || [];

			sharedMemories = sharedRows.map(row => {
				const memory = memoriesMap[row.memory_id] || null;
				const senderName = sendersMap[row.sender_id] || 'Friend';
				
				// Check if memory has already been accepted and saved to user's memories
				let isAccepted = false;
				if (memory) {
					const targetStr = `@${senderName}`.toLowerCase();
					isAccepted = userCopies.some(uc => 
						uc.date === memory.date && 
						(
							(uc.description || '').toLowerCase().includes(targetStr) ||
							(uc.memory_tag || '').toLowerCase().includes(targetStr)
						)
					);
				}

				return {
					share_id: row.id,
					shared_at: row.created_at,
					sender_id: row.sender_id,
					sender_username: senderName,
					memory: memory,
					status: isAccepted ? 'accepted' : 'pending'
				};
			}).filter(item => item.memory !== null);
		}

		// 2. Fetch pending friend requests
		const { data: pendingRequests, error: reqError } = await supabase
			.from('chronomuse_friend_requests')
			.select('id, sender_id, created_at')
			.eq('receiver_id', user_id)
			.eq('status', 'pending')
			.order('created_at', { ascending: false });

		let incomingRequests = [];
		if (pendingRequests && pendingRequests.length > 0) {
			const senderIds = pendingRequests.map(r => r.sender_id);
			const { data: senders } = await supabase
				.from('chronomuse_users')
				.select('id, username')
				.in('id', senderIds);

			const sendersMap = (senders || []).reduce((acc, u) => {
				acc[u.id] = u.username;
				return acc;
			}, {});

			incomingRequests = pendingRequests.map(r => ({
				request_id: r.id,
				sender_id: r.sender_id,
				sender_username: sendersMap[r.sender_id] || 'User',
				created_at: r.created_at
			}));
		}

		const pendingMemoriesCount = sharedMemories.filter(m => m.status === 'pending').length;
		const totalPendingCount = pendingMemoriesCount + (incomingRequests ? incomingRequests.length : 0);

		return json({
			success: true,
			data: {
				shared_memories: sharedMemories,
				incoming_requests: incomingRequests,
				total_notifications_count: sharedMemories.length + incomingRequests.length,
				pending_notifications_count: totalPendingCount
			}
		});
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
