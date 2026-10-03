import {
  AVATAR_COMPRESSION,
  LISTING_PHOTO_COMPRESSION,
  compressImageForUpload,
  compressImagesForUpload,
  fitWithin,
  toJpegFileName
} from './image-compression';

/** Random pixels do not compress, so this reliably yields a multi-megabyte "camera photo". */
async function noisyJpeg(width: number, height: number, name = 'IMG_0001.jpg'): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(width, height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i] = Math.random() * 256;
    pixels.data[i + 1] = Math.random() * 256;
    pixels.data[i + 2] = Math.random() * 256;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);

  const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.98));
  return new File([blob], name, { type: 'image/jpeg', lastModified: 1_700_000_000_000 });
}

async function dimensionsOf(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

describe('image-compression helpers', () => {
  it('fitWithin shrinks the longest side and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it('fitWithin never enlarges', () => {
    expect(fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600 });
  });

  it('toJpegFileName swaps the extension and tolerates names without one', () => {
    expect(toJpegFileName('photo.HEIC')).toBe('photo.jpg');
    expect(toJpegFileName('photo.final.png')).toBe('photo.final.jpg');
    expect(toJpegFileName('noextension')).toBe('noextension.jpg');
  });
});

describe('compressImageForUpload', () => {
  it('returns a file that is already within budget untouched', async () => {
    const small = new File([new Uint8Array(1000)], 'a.jpg', { type: 'image/jpeg' });

    expect(await compressImageForUpload(small, LISTING_PHOTO_COMPRESSION)).toBe(small);
  });

  it('does not touch non-image files even when they are large', async () => {
    const pdf = new File([new Uint8Array(LISTING_PHOTO_COMPRESSION.maxBytes + 1)], 'a.pdf', { type: 'application/pdf' });

    expect(await compressImageForUpload(pdf, LISTING_PHOTO_COMPRESSION)).toBe(pdf);
  });

  it('shrinks an oversized photo under the byte ceiling and the dimension cap, as a jpeg', async () => {
    const options = { maxBytes: 600_000, maxDimension: 1000 };
    const photo = await noisyJpeg(2400, 1600);
    expect(photo.size).toBeGreaterThan(options.maxBytes);

    const result = await compressImageForUpload(photo, options);

    expect(result).not.toBe(photo);
    expect(result.size).toBeLessThanOrEqual(options.maxBytes);
    expect(result.size).toBeLessThan(photo.size);
    expect(result.type).toBe('image/jpeg');
    expect(result.name).toBe('IMG_0001.jpg');
    expect(result.lastModified).toBe(photo.lastModified);

    const { width, height } = await dimensionsOf(result);
    expect(Math.max(width, height)).toBeLessThanOrEqual(options.maxDimension);
    // 3:2 landscape stays landscape and keeps its ratio.
    expect(width).toBeGreaterThan(height);
    expect(width / height).toBeCloseTo(1.5, 1);
  }, 30000);

  it('falls back to the original file when the bytes are not a decodable image', async () => {
    const corrupt = new File([new Uint8Array(50_000).fill(7)], 'broken.jpg', { type: 'image/jpeg' });

    expect(await compressImageForUpload(corrupt, { maxBytes: 1000, maxDimension: 500 })).toBe(corrupt);
  });

  it('compresses each file independently', async () => {
    const options = { maxBytes: 400_000, maxDimension: 800 };
    const big = await noisyJpeg(1800, 1200, 'big.jpg');
    const small = new File([new Uint8Array(10)], 'tiny.jpg', { type: 'image/jpeg' });

    const [bigOut, smallOut] = await compressImagesForUpload([big, small], options);

    expect(bigOut.size).toBeLessThanOrEqual(options.maxBytes);
    expect(smallOut).toBe(small);
  }, 30000);

  it('keeps the shipped ceilings below the server caps and a 10-photo request below its 20 MB cap', () => {
    expect(LISTING_PHOTO_COMPRESSION.maxBytes).toBeLessThanOrEqual(5_000_000);
    expect(LISTING_PHOTO_COMPRESSION.maxBytes * 10).toBeLessThan(20_000_000);
    expect(AVATAR_COMPRESSION.maxBytes).toBeLessThanOrEqual(2_000_000);
  });
});
