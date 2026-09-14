/**
 * src/lib/imageOptimizer.js
 * High-performance client-side image compression & optimization.
 * Reduces raw mobile photos (5-15MB) down to ultra-lightweight (150-350KB) WebP/JPEG
 * before uploading to Supabase Storage, dramatically saving bandwidth and storage.
 */

/**
 * Compresses an image file client-side using an offscreen canvas.
 * @param {File|Blob} file - The raw input file (JPEG, PNG, HEIC, WebP, etc.)
 * @param {Object} [options]
 * @param {number} [options.maxWidth=1920] - Maximum width constraint
 * @param {number} [options.maxHeight=1920] - Maximum height constraint
 * @param {number} [options.quality=0.82] - Compression quality (0.0 to 1.0)
 * @param {string} [options.outputType='image/jpeg'] - Preferred MIME type ('image/jpeg' or 'image/webp')
 * @returns {Promise<File>} Compressed File instance ready for upload
 */
export async function compressImage(file, options = {}) {
	if (!file || typeof window === 'undefined') return file;

	// If not an image (e.g. video), return original as-is
	if (file.type && !file.type.startsWith('image/')) {
		return file;
	}

	// If image is already very small (< 250 KB), skip compression
	if (file.size && file.size < 250 * 1024 && file.type === 'image/jpeg') {
		return file;
	}

	const {
		maxWidth = 1920,
		maxHeight = 1920,
		quality = 0.82,
		outputType = 'image/jpeg'
	} = options;

	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onload = (e) => {
			const img = new Image();
			img.onload = () => {
				let { width, height } = img;

				// Maintain aspect ratio while bounding within maxWidth/maxHeight
				if (width > maxWidth || height > maxHeight) {
					const ratio = Math.min(maxWidth / width, maxHeight / height);
					width = Math.round(width * ratio);
					height = Math.round(height * ratio);
				}

				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;

				const ctx = canvas.getContext('2d', { alpha: false });
				if (!ctx) {
					return resolve(file); // Fallback to original
				}

				// Fill white background for transparent PNGs converted to JPEG
				if (outputType === 'image/jpeg') {
					ctx.fillStyle = '#ffffff';
					ctx.fillRect(0, 0, width, height);
				}

				ctx.imageSmoothingEnabled = true;
				ctx.imageSmoothingQuality = 'high';
				ctx.drawImage(img, 0, 0, width, height);

				canvas.toBlob(
					(blob) => {
						if (!blob || blob.size >= file.size) {
							// If compressed version is somehow larger or failed, return original
							return resolve(file);
						}

						const fileName = (file.name || 'image.jpg').replace(/\.[^/.]+$/, '') + (outputType === 'image/webp' ? '.webp' : '.jpg');
						const compressedFile = new File([blob], fileName, {
							type: outputType,
							lastModified: Date.now()
						});

						resolve(compressedFile);
					},
					outputType,
					quality
				);
			};

			img.onerror = () => resolve(file);
			img.src = e.target?.result?.toString() || '';
		};

		reader.onerror = () => resolve(file);
		reader.readAsDataURL(file);
	});
}

/**
 * Debounce helper for high-frequency search inputs & resize events
 * @param {Function} fn
 * @param {number} delayMs
 * @returns {Function}
 */
export function debounce(fn, delayMs = 300) {
	let timer = null;
	return function (...args) {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			fn.apply(this, args);
		}, delayMs);
	};
}
