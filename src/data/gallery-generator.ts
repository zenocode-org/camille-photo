import { program } from 'commander';
import * as fs from 'node:fs';
import yaml from 'js-yaml';
import path from 'path';
import fg from 'fast-glob';
import { type GalleryData, loadGallery, NullGalleryData } from './galleryData.ts';
import { createGalleryCollection, createGalleryImage } from './galleryEntityFactory.ts';
import { optimizeImage } from './imageProcessor.ts';

const defaultGalleryFileName = 'gallery.yaml';

interface OptimizationOptions {
	maxDimension: number;
	quality: number;
	skipOptimization: boolean;
}

async function generateGalleryFile(
	galleryDir: string,
	options: OptimizationOptions,
): Promise<void> {
	try {
		let galleryObj = await loadExistingGallery(galleryDir);
		galleryObj = mergeGalleriesObj(
			galleryObj,
			await createGalleryObjFrom(galleryDir, options),
		);
		await writeGalleryYaml(galleryDir, galleryObj);
	} catch (error) {
		console.error('Failed to create gallery file:', error);
		process.exit(1);
	}
}

async function loadExistingGallery(galleryDir: string) {
	const existingGalleryFile = path.join(galleryDir, defaultGalleryFileName);
	if (fs.existsSync(existingGalleryFile)) {
		return await loadGallery(existingGalleryFile);
	}
	return NullGalleryData;
}

function mergeGalleriesObj(
	targetGalleryObj: GalleryData,
	sourceGalleryObj: GalleryData,
): GalleryData {
	return {
		collections: getUpdatedCollectionList(targetGalleryObj, sourceGalleryObj),
		images: getUpdatedImageList(targetGalleryObj, sourceGalleryObj),
	};
}

function getUpdatedImageList(targetGalleryObj: GalleryData, sourceGalleryObj: GalleryData) {
	const imagesMap = new Map(targetGalleryObj.images.map((image) => [image.path, image]));
	sourceGalleryObj.images.forEach((image) => {
		const existingImage = imagesMap.get(image.path);
		if (existingImage === undefined) {
			imagesMap.set(image.path, image);
		} else {
			existingImage.exif = image.exif;
		}
	});
	return Array.from(imagesMap.values());
}

function getUpdatedCollectionList(targetGalleryObj: GalleryData, sourceGalleryObj: GalleryData) {
	const collectionsMap = new Map(
		targetGalleryObj.collections.map((collection) => [collection.id, collection]),
	);
	sourceGalleryObj.collections.forEach((collection) => {
		if (!collectionsMap.get(collection.id)) {
			collectionsMap.set(collection.id, collection);
		}
	});
	return Array.from(collectionsMap.values());
}

async function createGalleryObjFrom(
	galleryDir: string,
	options: OptimizationOptions,
): Promise<GalleryData> {
	const imageFiles = await fg(`${galleryDir}/**/*.{jpg,jpeg,png,JPG,JPEG,PNG}`, {
		dot: false,
		ignore: ['**/backup/**'], // Ignore backup folder
	});
	return {
		collections: createCollectionsFrom(imageFiles, galleryDir),
		images: await createImagesFrom(imageFiles, galleryDir, options),
	};
}

function createCollectionsFrom(imageFiles: string[], galleryDir: string) {
	const uniqueDirNames = new Set(
		imageFiles.map((file) => path.dirname(path.relative(galleryDir, file))),
	);

	return [...uniqueDirNames]
		.map((dir) => {
			return createGalleryCollection(dir);
		})
		.filter((col) => col.id !== '.' && !col.id.startsWith('backup'));
}

async function createImagesFrom(
	imageFiles: string[],
	galleryDir: string,
	options: OptimizationOptions,
) {
	// Process images in parallel, but limit concurrency to avoid overwhelming the system
	const batchSize = 10;
	const results: Awaited<ReturnType<typeof createGalleryImage>>[] = [];

	for (let i = 0; i < imageFiles.length; i += batchSize) {
		const batch = imageFiles.slice(i, i + batchSize);
		const batchResults = await Promise.all(
			batch.map(async (file) => {
				// Optimize image first
				await optimizeImage(
					file,
					galleryDir,
					options.maxDimension,
					options.quality,
					options.skipOptimization,
				);
				// Then create gallery metadata
				return createGalleryImage(galleryDir, file);
			}),
		);
		results.push(...batchResults);
	}

	return results;
}

async function writeGalleryYaml(galleryDir: string, galleryObj: GalleryData) {
	const filePath = path.join(galleryDir, defaultGalleryFileName);
	await fs.promises.writeFile(filePath, yaml.dump(galleryObj), 'utf8');
	console.log('Gallery file created/updated successfully at:', filePath);
}

program
	.argument('<path to images directory>')
	.option(
		'--max-dimension <number>',
		'Maximum width or height in pixels (default: 1920)',
		'1920',
	)
	.option('--quality <number>', 'JPEG/PNG quality 1-100 (default: 80)', '80')
	.option('--skip-optimization', 'Skip image optimization', false)
	.parse();

const directoryPath = program.args[0];
if (!directoryPath || !fs.existsSync(directoryPath)) {
	console.error('Invalid directory path provided.');
	process.exit(1);
}

const maxDimension = parseInt(program.opts().maxDimension, 10);
const quality = parseInt(program.opts().quality, 10);
const skipOptimization = program.opts().skipOptimization === true;

// Validate options
if (isNaN(maxDimension) || maxDimension < 1) {
	console.error('Invalid max-dimension value. Must be a positive number.');
	process.exit(1);
}

if (isNaN(quality) || quality < 1 || quality > 100) {
	console.error('Invalid quality value. Must be between 1 and 100.');
	process.exit(1);
}

const optimizationOptions: OptimizationOptions = {
	maxDimension,
	quality,
	skipOptimization,
};

(async () => {
	await generateGalleryFile(directoryPath, optimizationOptions);
})().catch((error) => {
	console.error('Unhandled error:', error);
	process.exit(1);
});
