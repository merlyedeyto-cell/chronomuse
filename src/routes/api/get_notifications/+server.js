import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id } = await request.json();

		if (!user_id) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		// 1. Fetch shared memories tagged with this user as recipient (Incoming)
		const { data: sharedRows } = await supabase
			.from('chronomuse_shared_memories')
			.select('id, memory_id, sender_id, recipient_id, created_at')
			.eq('recipient_id', user_id)
			.order('created_at', { ascending: false })
			.limit(50);

		// 2. Fetch shared memories created/sent by this user to friends (Outgoing)
		const { data: sentRows } = await supabase
			.from('chronomuse_shared_memories')
			.select('id, memory_id, sender_id, recipient_id, created_at')
			.eq('sender_id', user_id)
			.order('created_at', { ascending: false })
			.limit(50);

		// 3. Fetch current user username
		const { data: currentUserData } = await supabase
			.from('chronomuse_users')
			.select('id, username')
			.eq('id', user_id)
			.single();
		const currentUsername = currentUserData?.username || '';

		// Collect all related memory IDs and user IDs
		const incomingMemoryIds = (sharedRows || []).map(r => r.memory_id);
		const outgoingMemoryIds = (sentRows || []).map(r => r.memory_id);
		const allMemoryIds = [...new Set([...incomingMemoryIds, ...outgoingMemoryIds])];

		const incomingSenderIds = (sharedRows || []).map(r => r.sender_id);
		const outgoingRecipientIds = (sentRows || []).map(r => r.recipient_id);
		const allRelatedUserIds = [...new Set([...incomingSenderIds, ...outgoingRecipientIds])];

		let memoriesMap = {};
		let usersMap = {};
		let recipientCopies = [];

		if (allMemoryIds.length > 0 || allRelatedUserIds.length > 0) {
			const [memoriesRes, usersRes, recipientCopiesRes] = await Promise.all([
				allMemoryIds.length > 0
					? supabase.from('chronomuse_memories').select('*').in('id', allMemoryIds)
					: Promise.resolve({ data: [] }),
				allRelatedUserIds.length > 0
					? supabase.from('chronomuse_users').select('id, username, avatar_url').in('id', allRelatedUserIds)
					: Promise.resolve({ data: [] }),
				outgoingRecipientIds.length > 0
					? supabase.from('chronomuse_memories').select('user_id, date, description, memory_tag').in('user_id', outgoingRecipientIds)
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

		// Also check user's own copies for incoming shared memories acceptance
		const { data: myUserCopies } = await supabase
			.from('chronomuse_memories')
			.select('date, description, memory_tag')
			.eq('user_id', user_id);
		const userCopies = myUserCopies || [];

		// Build incoming shared memories
		const sharedMemories = (sharedRows || []).map(row => {
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
						(uc.memory_tag || '').toLowerCase().includes(targetStr)
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
		const sentSharedMemories = (sentRows || []).map(row => {
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
						(rc.memory_tag || '').toLowerCase().includes(targetStr)
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

		// 4. Fetch pending friend requests
		const { data: pendingRequests } = await supabase
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
				.select('id, username, avatar_url')
				.in('id', senderIds);

			const sendersMap = (senders || []).reduce((acc, u) => {
				acc[u.id] = { username: u.username, avatar_url: u.avatar_url || null };
				return acc;
			}, {});

			incomingRequests = pendingRequests.map(r => ({
				request_id: r.id,
				sender_id: r.sender_id,
				sender_username: sendersMap[r.sender_id]?.username || 'User',
				sender_avatar_url: sendersMap[r.sender_id]?.avatar_url || null,
				created_at: r.created_at
			}));
		}

		const pendingMemoriesCount = sharedMemories.filter(m => m.status === 'pending').length;
		const totalPendingCount = pendingMemoriesCount + (incomingRequests ? incomingRequests.length : 0);

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
