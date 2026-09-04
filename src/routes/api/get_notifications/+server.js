import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id } = await request.json();

		if (!user_id) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		// Run all primary queries in parallel
		const [
			sharedRes,
			sentRes,
			currentUserRes,
			myUserCopiesRes,
			pendingRequestsRes
		] = await Promise.all([
			supabase
				.from('chronomuse_shared_memories')
				.select('id, memory_id, sender_id, recipient_id, created_at')
				.eq('recipient_id', user_id)
				.order('created_at', { ascending: false })
				.limit(50),
			supabase
				.from('chronomuse_shared_memories')
				.select('id, memory_id, sender_id, recipient_id, created_at')
				.eq('sender_id', user_id)
				.order('created_at', { ascending: false })
				.limit(50),
			supabase
				.from('chronomuse_users')
				.select('id, username')
				.eq('id', user_id)
				.maybeSingle(),
			supabase
				.from('chronomuse_memories')
				.select('date, description, memory_tag, title')
				.eq('user_id', user_id),
			supabase
				.from('chronomuse_friend_requests')
				.select('id, sender_id, created_at')
				.eq('receiver_id', user_id)
				.eq('status', 'pending')
				.order('created_at', { ascending: false })
		]);

		const sharedRows = sharedRes.data || [];
		const sentRows = sentRes.data || [];
		const pendingRequests = pendingRequestsRes.data || [];
		const currentUsername = currentUserRes.data?.username || '';
		const userCopies = myUserCopiesRes.data || [];

		// Collect all related memory IDs and user IDs across incoming, outgoing, and friend requests
		const incomingMemoryIds = sharedRows.map(r => r.memory_id);
		const outgoingMemoryIds = sentRows.map(r => r.memory_id);
		const allMemoryIds = [...new Set([...incomingMemoryIds, ...outgoingMemoryIds])];

		const incomingSenderIds = sharedRows.map(r => r.sender_id);
		const outgoingRecipientIds = sentRows.map(r => r.recipient_id);
		const reqSenderIds = pendingRequests.map(r => r.sender_id);
		const allRelatedUserIds = [...new Set([...incomingSenderIds, ...outgoingRecipientIds, ...reqSenderIds])];

		let memoriesMap = {};
		let usersMap = {};
		let recipientCopies = [];

		if (allMemoryIds.length > 0 || allRelatedUserIds.length > 0) {
			const [memoriesRes, usersRes, recipientCopiesRes] = await Promise.all([
				allMemoryIds.length > 0
					? supabase.from('chronomuse_memories').select('id, user_id, date, title, description, mood_tag, memory_tag, photo_video, photo_video_type, music, created_at').in('id', allMemoryIds)
					: Promise.resolve({ data: [] }),
				allRelatedUserIds.length > 0
					? supabase.from('chronomuse_users').select('id, username, avatar_url').in('id', allRelatedUserIds)
					: Promise.resolve({ data: [] }),
				outgoingRecipientIds.length > 0
					? supabase.from('chronomuse_memories').select('user_id, date, description, memory_tag, title').in('user_id', outgoingRecipientIds)
					: Promise.resolve({ data: [] })
			]);

			memoriesMap = (memoriesRes.data || []).reduce((acc, m) => {
				acc[m.id] = m;
				return acc;
			}, {});

			usersMap = (usersRes.data || []).reduce((acc, u) => {
				acc[u.id] = { username: u.username, avatar_url: u.avatar_url || null };
				return acc;
			}, {});

			recipientCopies = recipientCopiesRes.data || [];
		}

		// Build incoming shared memories
		const sharedMemories = sharedRows.map(row => {
			const memory = memoriesMap[row.memory_id] || null;
			const senderInfo = usersMap[row.sender_id] || { username: 'Friend', avatar_url: null };
			const senderName = senderInfo.username || 'Friend';
			
			let isAccepted = false;
			if (memory) {
				const targetStr = `@${senderName}`.toLowerCase();
				isAccepted = userCopies.some(uc => 
					uc.date === memory.date && 
					(
						(uc.description || '').toLowerCase().includes(targetStr) ||
						(uc.memory_tag || '').toLowerCase().includes(targetStr) ||
						(uc.description || '').toLowerCase().includes('(shared by') ||
						(uc.title && memory.title && uc.title.trim().toLowerCase() === memory.title.trim().toLowerCase())
					)
				);
			}

			return {
				share_id: row.id,
				shared_at: row.created_at,
				sender_id: row.sender_id,
				sender_username: senderName,
				sender_avatar_url: senderInfo.avatar_url || null,
				memory: memory,
				status: isAccepted ? 'accepted' : 'pending'
			};
		}).filter(item => item.memory !== null);

		// Build outgoing shared memories (Memories shared by this user with friends)
		const sentSharedMemories = sentRows.map(row => {
			const memory = memoriesMap[row.memory_id] || null;
			const recipientInfo = usersMap[row.recipient_id] || { username: 'Friend', avatar_url: null };
			const recipientName = recipientInfo.username || 'Friend';

			let isAcceptedByFriend = false;
			if (memory && currentUsername) {
				const targetStr = `@${currentUsername}`.toLowerCase();
				isAcceptedByFriend = recipientCopies.some(rc =>
					rc.user_id === row.recipient_id &&
					rc.date === memory.date &&
					(
						(rc.description || '').toLowerCase().includes(targetStr) ||
						(rc.memory_tag || '').toLowerCase().includes(targetStr) ||
						(rc.description || '').toLowerCase().includes('(shared by') ||
						(rc.title && memory.title && rc.title.trim().toLowerCase() === memory.title.trim().toLowerCase())
					)
				);
			}

			return {
				share_id: row.id,
				shared_at: row.created_at,
				recipient_id: row.recipient_id,
				recipient_username: recipientName,
				recipient_avatar_url: recipientInfo.avatar_url || null,
				memory: memory,
				status: isAcceptedByFriend ? 'accepted' : 'pending'
			};
		}).filter(item => item.memory !== null);

		// Build incoming friend requests
		const incomingRequests = pendingRequests.map(r => {
			const senderInfo = usersMap[r.sender_id] || { username: 'User', avatar_url: null };
			return {
				request_id: r.id,
				sender_id: r.sender_id,
				sender_username: senderInfo.username || 'User',
				sender_avatar_url: senderInfo.avatar_url || null,
				created_at: r.created_at
			};
		});

		const pendingMemoriesCount = sharedMemories.filter(m => m.status === 'pending').length;
		const totalPendingCount = pendingMemoriesCount + incomingRequests.length;

		return json({
			success: true,
			data: {
				shared_memories: sharedMemories,
				sent_shared_memories: sentSharedMemories,
				incoming_requests: incomingRequests,
				total_notifications_count: sharedMemories.length + incomingRequests.length,
				pending_notifications_count: totalPendingCount
			}
		});
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
