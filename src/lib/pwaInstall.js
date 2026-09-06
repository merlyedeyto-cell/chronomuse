// src/lib/pwaInstall.js

/** @type {any} */
let deferredPrompt = null;
let isPromptReady = false;
/** @type {Set<(status: any) => void>} */
let listeners = new Set();

function notifyListeners() {
	listeners.forEach((callback) => callback({
		isPromptReady,
		isWebview: isWebview(),
		isMobile: isMobile(),
		isIOS: isIOS(),
		isStandalone: isStandalone()
	}));
}

export function isMobile() {
	if (typeof window === 'undefined') return false;
	const ua = navigator.userAgent || navigator.vendor || window.opera;
	return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
}

export function isIOS() {
	if (typeof window === 'undefined') return false;
	const ua = navigator.userAgent || navigator.vendor || window.opera;
	return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isWebview() {
	if (typeof window === 'undefined') return false;
	const ua = navigator.userAgent || navigator.vendor || window.opera;
	// Common in-app browsers: Facebook, Instagram, Messenger, Line, Twitter/X, WeChat, Webview tokens
	return /FBAN|FBAV|Instagram|FB_IAB|Messenger|Line|MicroMessenger|wv|WebView/i.test(ua);
}

export function isStandalone() {
	if (typeof window === 'undefined') return false;
	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		window.navigator.standalone === true ||
		document.referrer.includes('android-app://')
	);
}

export function initPWAInstall() {
	if (typeof window === 'undefined') return;

	// Listen for beforeinstallprompt event
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault();
		deferredPrompt = e;
		isPromptReady = true;
		notifyListeners();
	});

	window.addEventListener('appinstalled', () => {
		deferredPrompt = null;
		isPromptReady = false;
		notifyListeners();
	});
}

export function subscribePWAStatus(callback) {
	listeners.add(callback);
	callback({
		isPromptReady,
		isWebview: isWebview(),
		isMobile: isMobile(),
		isIOS: isIOS(),
		isStandalone: isStandalone()
	});
	return () => listeners.delete(callback);
}

export async function promptPWAInstall() {
	if (deferredPrompt) {
		deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		if (outcome === 'accepted') {
			deferredPrompt = null;
			isPromptReady = false;
			notifyListeners();
			return { success: true, outcome: 'accepted' };
		}
		return { success: false, outcome: 'dismissed' };
	}

	// Fallback handling when beforeinstallprompt event isn't supported directly (e.g. iOS or In-App Webview)
	if (isIOS()) {
		return {
			success: false,
			needManualGuide: true,
			guide: 'Tap the Share button in Safari, then select "Add to Home Screen".'
		};
	}

	if (isWebview()) {
		return {
			success: false,
			needManualGuide: true,
			guide: 'Tap the menu (⋮ or ⋯) and select "Open in Chrome" or "Open in Browser" to install.'
		};
	}

	return {
		success: false,
		needManualGuide: true,
		guide: 'To install, open this website in Google Chrome or Edge and click Install.'
	};
}
