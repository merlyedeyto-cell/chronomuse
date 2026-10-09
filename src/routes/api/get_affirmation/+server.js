import { json } from '@sveltejs/kit';

const FALLBACK_QUOTES = [
	{ q: "Every day holds a special little moment worth remembering.", a: "Chronomuse" },
	{ q: "Collect beautiful moments, not just things.", a: "Unknown" },
	{ q: "Your story is unique, precious, and worth saving.", a: "Chronomuse" },
	{ q: "Small reflections today become cherished treasures tomorrow.", a: "Chronomuse" },
	{ q: "Smile, breathe, and capture the joy in today.", a: "Unknown" },
	{ q: "Gratitude turns what we have into enough.", a: "Aesop" },
	{ q: "Make each day a masterpiece in your timeline.", a: "John Wooden" },
	{ q: "Life is made of small moments noticed and cherished.", a: "Unknown" },
	{ q: "Peace comes from within. Do not seek it without.", a: "Buddha" },
	{ q: "What we think, we become.", a: "Buddha" },
	{ q: "The journey of a thousand miles begins with a single step.", a: "Lao Tzu" },
	{ q: "Happiness is not something ready made. It comes from your own actions.", a: "Dalai Lama" },
	{ q: "Be present in all things and thankful for all things.", a: "Maya Angelou" },
	{ q: "Keep your face always toward the sunshine, and shadows will fall behind you.", a: "Walt Whitman" }
];

let cachedQuotes = [];
let lastFetchTime = 0;
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes cache

async function fetchZenQuotes() {
	const now = Date.now();
	if (cachedQuotes.length > 0 && now - lastFetchTime < CACHE_DURATION_MS) {
		return cachedQuotes;
	}

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 4000);

		const res = await fetch('https://zenquotes.io/api/quotes', {
			signal: controller.signal,
			headers: {
				'Accept': 'application/json'
			}
		});
		clearTimeout(timeoutId);

		if (res.ok) {
			const data = await res.json();
			if (Array.isArray(data) && data.length > 0) {
				// Filter out invalid or empty quotes
				const clean = data
					.filter(item => item && item.q && item.q.trim())
					.map(item => ({
						q: item.q.trim(),
						a: item.a ? item.a.trim() : 'Unknown'
					}));

				if (clean.length > 0) {
					cachedQuotes = clean;
					lastFetchTime = now;
					return cachedQuotes;
				}
			}
		}
	} catch (err) {
		console.warn('ZenQuotes API fetch fallback triggered:', err.message);
	}

	// Fallback if fetch failed or cache is empty
	if (cachedQuotes.length === 0) {
		cachedQuotes = FALLBACK_QUOTES;
	}
	return cachedQuotes;
}

export async function GET({ url }) {
	try {
		const quotesList = await fetchZenQuotes();
		const isRandom = url.searchParams.get('random') === 'true';

		if (isRandom && quotesList.length > 0) {
			const randomIndex = Math.floor(Math.random() * quotesList.length);
			return json({
				success: true,
				quote: quotesList[randomIndex],
				total: quotesList.length
			});
		}

		return json({
			success: true,
			quotes: quotesList,
			total: quotesList.length
		});
	} catch (err) {
		return json({
			success: true,
			quotes: FALLBACK_QUOTES,
			total: FALLBACK_QUOTES.length,
			fallback: true
		});
	}
}
