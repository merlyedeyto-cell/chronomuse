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
		isStandalone: isStandalone(),
		isAppInstalled: isAppInstalled()
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
		// Mark app as installed in localStorage
		try { localStorage.setItem('chronomuse_pwa_installed', 'true'); } catch(e) {}
		notifyListeners();
		// Auto launch the installed app in standalone mode
		setTimeout(() => {
			window.location.href = window.location.origin + '/';
		}, 500);
	});
}

export function subscribePWAStatus(callback) {
	listeners.add(callback);
	callback({
		isPromptReady,
		isWebview: isWebview(),
		isMobile: isMobile(),
		isIOS: isIOS(),
		isStandalone: isStandalone(),
		isAppInstalled: isAppInstalled()
	});
	return () => listeners.delete(callback);
}

export function isAppInstalled() {
	if (typeof window === 'undefined') return false;
	// If running in standalone, the app is definitely installed — also set the flag for Chrome detection
	if (isStandalone()) {
		try { localStorage.setItem('chronomuse_pwa_installed', 'true'); } catch(e) {}
		return true;
	}
	try { return localStorage.getItem('chronomuse_pwa_installed') === 'true'; } catch(e) { return false; }
}

export function openInstalledApp() {
	// Use window.open to trigger Chrome's launch_handler
	// This tells Chrome to open the installed PWA instead of a browser tab
	const appUrl = window.location.origin + '/?source=open-app';
	
	// Try window.open first - Chrome with launch_handler will intercept and open the PWA
	const opened = window.open(appUrl, '_blank');
	
	// If popup was blocked or failed, fallback to navigation
	if (!opened) {
		window.location.href = appUrl;
	}
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
		// Try to open in system browser so they can install from there
		try {
			const url = window.location.href;
			const ua = navigator.userAgent || '';

			// Android: use intent scheme to open in Chrome
			if (/android/i.test(ua)) {
				const intentUrl = 'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end;';
				window.location.href = intentUrl;
				return {
					success: false,
					needManualGuide: true,
					guide: 'Opening in Chrome... If it doesn\'t open, tap the menu (⋮) and select "Open in Chrome".'
				};
			}

			// iOS / other: try window.open
			window.open(url, '_system') || window.open(url, '_blank');
			return {
				success: false,
				needManualGuide: true,
				guide: 'Opening in your browser... Install from there for the best experience.'
			};
		} catch (e) {
			return {
				success: false,
				needManualGuide: true,
				guide: 'Tap the menu (⋮ or ⋯) and select "Open in Chrome" or "Open in Browser" to install.'
			};
		}
	}

	return {
		success: false,
		needManualGuide: true,
		guide: 'To install, open this website in Google Chrome or Edge and click Install.'
	};
}
