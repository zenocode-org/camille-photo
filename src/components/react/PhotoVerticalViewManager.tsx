import { useState, useEffect } from 'react';
import PhotoVerticalView from './PhotoVerticalView';
import type { Image as ImageType } from '../../data/galleryData';

interface PhotoVerticalViewManagerProps {
	images: ImageType[];
}

export default function PhotoVerticalViewManager({ images }: PhotoVerticalViewManagerProps) {
	const [selectedImage, setSelectedImage] = useState<ImageType | null>(null);

	useEffect(() => {
		const handleImageClick = (e: MouseEvent) => {
			const target = e.target as HTMLElement;

			// First check if clicked element or its parent is a photo-item
			const photoItem = target.closest('.photo-item') as HTMLElement;
			if (!photoItem) return;

			// Don't handle clicks if it's already selected
			if (photoItem.classList.contains('selected')) return;

			// Try to get the image index from the photo-item.
			// This is more reliable than using the title, which can be duplicated across images.
			const imageIndexAttr = photoItem.dataset.imageIndex;
			let image: ImageType | undefined;

			if (imageIndexAttr !== undefined) {
				const imageIndex = parseInt(imageIndexAttr, 10);
				if (!Number.isNaN(imageIndex) && imageIndex >= 0 && imageIndex < images.length) {
					image = images[imageIndex];
				}
			}

			// Fallback: try to resolve by title if index is not available
			if (!image) {
				// Get image title from photo-item's data attribute or from nested data-photo-title
				let imageTitle = photoItem.dataset.imageTitle;
				if (!imageTitle) {
					const photoTitleElement = photoItem.querySelector('[data-photo-title]') as HTMLElement;
					imageTitle = photoTitleElement?.dataset.photoTitle || undefined;
				}

				if (!imageTitle) return;

				image = images.find((img) => img.title === imageTitle);
			}

			if (!image) return;

			e.preventDefault();
			e.stopPropagation();

			setSelectedImage(image);

			// Scroll to vertical view after a short delay to allow DOM update
			setTimeout(() => {
				const verticalView = document.getElementById('photo-vertical-view-container');
				if (verticalView) {
					verticalView.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
			}, 150);
		};

		// Use event delegation on the document to handle dynamically added/removed elements
		document.addEventListener('click', handleImageClick, true);

		// Close vertical view when a collection filter is clicked (e.g. in sidebar)
		const handleClosePreview = () => setSelectedImage(null);
		window.addEventListener('photo-grid:close-preview', handleClosePreview);

		return () => {
			document.removeEventListener('click', handleImageClick, true);
			window.removeEventListener('photo-grid:close-preview', handleClosePreview);
		};
	}, [images]);

	const handleCloseVerticalView = () => {
		setSelectedImage(null);

		// Scroll back to top of the grid
		setTimeout(() => {
			const gridContainer = document.querySelector('.photo-grid');
			if (gridContainer) {
				gridContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		}, 100);
	};

	return (
		<div id="photo-vertical-view-container" className="w-full">
			{selectedImage && (
				<div className="mt-8">
					<PhotoVerticalView image={selectedImage} onClose={handleCloseVerticalView} />
				</div>
			)}
		</div>
	);
}
