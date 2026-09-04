// src/lib/soundEffects.js

let audioCtx = null;

function getAudioContext() {
	if (typeof window === 'undefined') return null;
	const AudioContextClass = window.AudioContext || window.webkitAudioContext;
	if (!AudioContextClass) return null;
	if (!audioCtx) {
		audioCtx = new AudioContextClass();
	}
	if (audioCtx.state === 'suspended') {
		audioCtx.resume().catch(() => {});
	}
	return audioCtx;
}

if (typeof window !== 'undefined') {
	const unlockAudio = () => {
		if (audioCtx && audioCtx.state === 'suspended') {
			audioCtx.resume().catch(() => {});
		}
	};
	window.addEventListener('click', unlockAudio, { passive: true });
	window.addEventListener('touchstart', unlockAudio, { passive: true });
	window.addEventListener('keydown', unlockAudio, { passive: true });
}

let lastTypingSoundTime = 0;

/**
 * Play a subtle, cute bubble tap sound when the other user types
 */
export function playTypingSound() {
	const now = Date.now();
	if (now - lastTypingSoundTime < 700) return; // Debounce typing sound
	lastTypingSoundTime = now;

	try {
		const ctx = getAudioContext();
		if (!ctx) return;

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();

		osc.type = 'sine';
		osc.frequency.setValueAtTime(440, ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(680, ctx.currentTime + 0.05);

		gain.gain.setValueAtTime(0.04, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

		osc.connect(gain);
		gain.connect(ctx.destination);

		osc.start(ctx.currentTime);
		osc.stop(ctx.currentTime + 0.06);
	} catch (e) {}
}

/**
 * Play an outgoing send message sound (pleasant soft chime/pop)
 */
export function playMessageSentSound() {
	try {
		const ctx = getAudioContext();
		if (!ctx) return;

		const now = ctx.currentTime;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();

		osc.type = 'sine';
		osc.frequency.setValueAtTime(520, now);
		osc.frequency.exponentialRampToValueAtTime(880, now + 0.09);

		gain.gain.setValueAtTime(0.12, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

		osc.connect(gain);
		gain.connect(ctx.destination);

		osc.start(now);
		osc.stop(now + 0.11);
	} catch (e) {}
}

/**
 * Play an incoming message sound (crystal-clear 2-tone melodic notification chime)
 */
export function playIncomingMessageSound() {
	try {
		const ctx = getAudioContext();
		if (!ctx) return;

		const now = ctx.currentTime;

		// Note 1: G5 (784 Hz)
		const osc1 = ctx.createOscillator();
		const gain1 = ctx.createGain();
		osc1.type = 'sine';
		osc1.frequency.setValueAtTime(784, now);
		gain1.gain.setValueAtTime(0.16, now);
		gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
		osc1.connect(gain1);
		gain1.connect(ctx.destination);
		osc1.start(now);
		osc1.stop(now + 0.16);

		// Note 2: C6 (1046.5 Hz)
		const osc2 = ctx.createOscillator();
		const gain2 = ctx.createGain();
		osc2.type = 'sine';
		osc2.frequency.setValueAtTime(1046.5, now + 0.07);
		gain2.gain.setValueAtTime(0.2, now + 0.07);
		gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
		osc2.connect(gain2);
		gain2.connect(ctx.destination);
		osc2.start(now + 0.07);
		osc2.stop(now + 0.32);
	} catch (e) {}
}
