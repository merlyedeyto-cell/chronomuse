/**
 * ChronoMuse OOP Toast Service
 * Manages toast notification state and lifecycle across the application.
 * Adheres to Object-Oriented design principles and the Svelte store contract.
 */
export class ToastService {
	constructor() {
		/** @type {Set<Function>} */
		this.subscribers = new Set();
		this.state = {
			visible: false,
			message: '',
			type: 'success', // 'success' | 'error' | 'warning' | 'info'
			duration: 2800
		};
		/** @type {any} */
		this.timer = null;

		if (typeof window !== 'undefined') {
			window.addEventListener('chronomuse_toast', (event) => {
				const detail = /** @type {CustomEvent} */ (event).detail;
				if (detail?.message) {
					this.show(detail.message, detail.type || 'success', detail.duration);
				}
			});
		}
	}

	/**
	 * Svelte Store contract subscription
	 * @param {Function} run
	 * @returns {() => void}
	 */
	subscribe(run) {
		this.subscribers.add(run);
		run(this.state);
		return () => {
			this.subscribers.delete(run);
		};
	}

	/**
	 * Notify all active subscribers with current state
	 */
	notify() {
		for (const run of this.subscribers) {
			try {
				run(this.state);
			} catch (e) {
				console.error('[ToastService] Subscriber notification error:', e);
			}
		}
	}

	/**
	 * Display a toast notification
	 * @param {string} message
	 * @param {'success'|'error'|'warning'|'info'} [type='success']
	 * @param {number} [duration=2800]
	 */
	show(message, type = 'success', duration = 2800) {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}

		this.state = {
			visible: true,
			message,
			type,
			duration
		};
		this.notify();

		if (duration > 0) {
			this.timer = setTimeout(() => {
				this.dismiss();
			}, duration);
		}
	}

	/**
	 * Shortcut for success toast
	 * @param {string} message
	 * @param {number} [duration=2800]
	 */
	success(message, duration = 2800) {
		this.show(message, 'success', duration);
	}

	/**
	 * Shortcut for error toast
	 * @param {string} message
	 * @param {number} [duration=3500]
	 */
	error(message, duration = 3500) {
		this.show(message, 'error', duration);
	}

	/**
	 * Shortcut for warning toast
	 * @param {string} message
	 * @param {number} [duration=3500]
	 */
	warning(message, duration = 3500) {
		this.show(message, 'warning', duration);
	}

	/**
	 * Shortcut for info toast
	 * @param {string} message
	 * @param {number} [duration=2800]
	 */
	info(message, duration = 2800) {
		this.show(message, 'info', duration);
	}

	/**
	 * Dismiss the current toast immediately
	 */
	dismiss() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		this.state = {
			...this.state,
			visible: false
		};
		this.notify();
	}
}

// Global Singleton Instance
export const toast = new ToastService();
