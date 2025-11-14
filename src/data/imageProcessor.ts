import sharp from 'sharp';
import * as fs from 'node:fs';
import path from 'path';

const BACKUP_DIR_NAME = 'backup';

/**
 * Generates a timestamp string for backup folders
 * Format: YYYY-MM-DD_HH-MM-SS
 */
function getTimestampFolder(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const seconds = String(now.getSeconds()).padStart(2, '0');
	return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

// Cache timestamp for the current run so all backups go to the same folder
let cachedTimestamp: string | null = null;

/**
 * Processes an image by resizing and compressing it
 * @param imagePath - Full path to the image file
 * @param maxDimension - Maximum width or height in pixels (maintains aspect ratio)
 * @param quality - JPEG/PNG quality (1-100)
 * @returns Processed image buffer
 */
export async function processImage(
	imagePath: string,
	maxDimension: number,
	quality: number,
): Promise<Buffer> {
	const image = sharp(imagePath);
	const metadata = await image.metadata();

	// Determine if resizing is needed
	const needsResize =
		metadata.width && metadata.height
			? metadata.width > maxDimension || metadata.height > maxDimension
			: false;

	let processedImage = image.keepMetadata(); // Preserve all EXIF and other metadata

	if (needsResize) {
		processedImage = processedImage.resize(maxDimension, maxDimension, {
			fit: 'inside',
			withoutEnlargement: true,
		});
	}

	// Apply compression based on file format
	const ext = path.extname(imagePath).toLowerCase();
	if (ext === '.png') {
		processedImage = processedImage.png({ quality });
	} else {
		// Default to JPEG for jpg, jpeg, and other formats
		processedImage = processedImage.jpeg({ quality });
	}

	return await processedImage.toBuffer();
}

/**
 * Creates a backup of the original image file
 * @param imagePath - Full path to the image file
 * @param galleryDir - Root directory of the gallery
 * @returns Path to the backup file
 */
export async function backupImage(imagePath: string, galleryDir: string): Promise<string> {
	// Use cached timestamp or generate a new one for this run
	if (!cachedTimestamp) {
		cachedTimestamp = getTimestampFolder();
	}

	const relativePath = path.relative(galleryDir, imagePath);
	const backupPath = path.join(galleryDir, BACKUP_DIR_NAME, cachedTimestamp, relativePath);
	const backupDir = path.dirname(backupPath);

	// Create backup directory structure if it doesn't exist
	await fs.promises.mkdir(backupDir, { recursive: true });

	// Copy original file to backup location
	await fs.promises.copyFile(imagePath, backupPath);

	return backupPath;
}

/**
 * Optimizes an image: backs it up, processes it, and replaces the original
 * @param imagePath - Full path to the image file
 * @param galleryDir - Root directory of the gallery
 * @param maxDimension - Maximum width or height in pixels
 * @param quality - JPEG/PNG quality (1-100)
 * @param skipOptimization - If true, skip optimization
 * @returns True if image was optimized, false otherwise
 */
export async function optimizeImage(
	imagePath: string,
	galleryDir: string,
	maxDimension: number,
	quality: number,
	skipOptimization: boolean = false,
): Promise<boolean> {
	if (skipOptimization) {
		return false;
	}

	try {
		// Check if file exists
		if (!fs.existsSync(imagePath)) {
			console.warn(`Image not found: ${imagePath}`);
			return false;
		}

		// Get original file stats
		const originalStats = await fs.promises.stat(imagePath);
		const originalSize = originalStats.size;

		// Get image metadata to check if processing is needed
		const metadata = await sharp(imagePath).metadata();
		const needsResize =
			metadata.width && metadata.height
				? metadata.width > maxDimension || metadata.height > maxDimension
				: false;

		// Skip if image is already small enough and doesn't need resizing
		// We'll still process if quality compression might help
		if (!needsResize && originalSize < 500 * 1024) {
			// Skip if image is already small (< 500KB) and doesn't need resizing
			return false;
		}

		// Create backup
		await backupImage(imagePath, galleryDir);

		// Process image
		const processedBuffer = await processImage(imagePath, maxDimension, quality);

		// Check if processed image is actually smaller
		if (processedBuffer.length >= originalSize) {
			console.log(
				`Skipping ${path.basename(imagePath)}: processed size (${processedBuffer.length}) >= original (${originalSize})`,
			);
			return false;
		}

		// Replace original with processed image
		await fs.promises.writeFile(imagePath, processedBuffer);

		const sizeReduction = ((originalSize - processedBuffer.length) / originalSize) * 100;
		console.log(
			`Optimized ${path.basename(imagePath)}: ${(originalSize / 1024).toFixed(1)}KB → ${(processedBuffer.length / 1024).toFixed(1)}KB (${sizeReduction.toFixed(1)}% reduction)`,
		);

		return true;
	} catch (error) {
		console.error(`Failed to optimize ${imagePath}:`, error);
		return false;
	}
}
