// Client-side image shrinking before upload.
//
// Why this exists: a current phone camera produces 3-12 MB JPEGs, but the API refuses any listing
// photo over 5,000,000 bytes (UploadPropertyImagesCommandHandler / AddShortStayListingPhotosCommandHandler)
// and any avatar over 2,000,000 bytes, and caps one multipart request at 20,000,000 bytes with up to
// 10 files in it. Before this, a normal camera photo was simply rejected and the user had to
// shrink it by hand.
//
// The byte targets below are therefore *ceilings the result must stay under*, chosen so that a full
// 10-photo request still fits the 20 MB request cap, not the exact server limit.
//
// Behaviour contract:
//  - a JPEG/PNG/WebP already under the target is re-encoded once at the same size so its EXIF block (GPS position,
//    device) is dropped; any other file under the target is returned untouched;
//  - anything else is decoded (EXIF orientation applied), scaled down to `maxDimension` on its longest
//    side if needed, and re-encoded as JPEG, lowering quality and then size until it fits;
//  - if decoding or encoding is impossible (corrupt file, unsupported format, no canvas) the ORIGINAL
//    file is returned so the caller's existing validation reports the problem exactly as before;
//  - the result is never larger than the input.

export interface ImageCompressionOptions {
  /** Ceiling for the produced file, in bytes. */
  readonly maxBytes: number;
  /** Longest side of the produced image, in pixels. */
  readonly maxDimension: number;
  /** First JPEG quality tried (0-1). */
  readonly initialQuality?: number;
  /** Lowest JPEG quality tried before the image is scaled down further (0-1). */
  readonly minQuality?: number;
}

/** Listing photos (property + short-stay): server cap 5,000,000 B per file, 20,000,000 B per request of up to 10. */
export const LISTING_PHOTO_COMPRESSION: ImageCompressionOptions = {
  maxBytes: 1_800_000,
  maxDimension: 2560
};

/** Profile avatar: server cap 2,000,000 B. */
export const AVATAR_COMPRESSION: ImageCompressionOptions = {
  maxBytes: 1_500_000,
  maxDimension: 1024
};

const QUALITY_STEP = 0.08;
const SCALE_STEP = 0.85;
const MAX_SCALE_ATTEMPTS = 6;

/** Fits `width` x `height` inside a `maxDimension` square without ever enlarging. */
export function fitWithin(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const longest = Math.max(width, height);

  if (longest <= maxDimension || longest <= 0) {
    return { width, height };
  }

  const ratio = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  };
}

/** "photo.heic" becomes "photo.jpg"; names without an extension just get one. */
export function toJpegFileName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '');
  return `${base || 'image'}.jpg`;
}

/** Photos the server accepts; re-encoding them in the browser drops their EXIF block (GPS position, device). */
const METADATA_CARRYING_TYPES = /^image\/(jpeg|png|webp)$/;

export async function compressImageForUpload(file: File, options: ImageCompressionOptions): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // A photo that already fits is still re-encoded once (QA phase 17, P17-D02): handing it over untouched would
  // publish the EXIF block, including the GPS position, on the public listing URL.
  const fitsAlready = file.size <= options.maxBytes;

  if (fitsAlready && !METADATA_CARRYING_TYPES.test(file.type)) {
    return file;
  }

  let source: DecodedImage | null = null;

  try {
    source = await decodeImage(file);
    const blob = await encodeWithinBudget(source, options);

    // Over budget: only use the result when it is really smaller. Within budget the point is stripping, so the
    // result is used whenever it still fits the ceiling (the server removes metadata too, this is the first layer).
    if (!blob || (fitsAlready ? blob.size > options.maxBytes : blob.size >= file.size)) {
      return file;
    }

    return new File([blob], toJpegFileName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified
    });
  } catch {
    return file;
  } finally {
    source?.release();
  }
}

/** Compresses every file independently; one failure never affects the others. */
export function compressImagesForUpload(files: readonly File[], options: ImageCompressionOptions): Promise<File[]> {
  return Promise.all(files.map(file => compressImageForUpload(file, options)));
}

interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly source: CanvasImageSource;
  release(): void;
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies the EXIF orientation so portrait phone shots are not saved sideways.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        release: () => bitmap.close()
      };
    } catch {
      // Fall through to the <img> path (older WebKit rejects the options bag).
    }
  }

  const url = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();

    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image,
      release: () => URL.revokeObjectURL(url)
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function encodeWithinBudget(image: DecodedImage, options: ImageCompressionOptions): Promise<Blob | null> {
  const initialQuality = options.initialQuality ?? 0.86;
  const minQuality = options.minQuality ?? 0.5;

  let maxDimension = options.maxDimension;
  let smallest: Blob | null = null;

  for (let scaleAttempt = 0; scaleAttempt < MAX_SCALE_ATTEMPTS; scaleAttempt += 1) {
    const size = fitWithin(image.width, image.height, maxDimension);

    for (let quality = initialQuality; quality >= minQuality - 1e-9; quality -= QUALITY_STEP) {
      const blob = await renderJpeg(image, size.width, size.height, quality);

      if (!blob) {
        return smallest;
      }

      if (!smallest || blob.size < smallest.size) {
        smallest = blob;
      }

      if (blob.size <= options.maxBytes) {
        return blob;
      }
    }

    maxDimension = Math.round(Math.max(size.width, size.height) * SCALE_STEP);
  }

  return smallest;
}

function renderJpeg(image: DecodedImage, width: number, height: number, quality: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    return Promise.resolve(null);
  }

  // JPEG has no alpha: a transparent PNG would otherwise turn black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image.source, 0, 0, width, height);

  return new Promise(resolve => {
    canvas.toBlob(
      blob => {
        // Release the pixel buffer right away; phones run out of canvas memory long before they run out of time.
        canvas.width = 0;
        canvas.height = 0;
        resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}
