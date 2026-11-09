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

/** A small valid JPEG with an APP1 "Exif" segment spliced in right after the SOI marker. */
async function jpegWithExif(width: number, height: number): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.fillRect(0, 0, width, height);
  const plain = new Uint8Array(await (await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.9))).arrayBuffer());
  const payload = new TextEncoder().encode('Exif\0\0GPS-LATITUDE-33.5');
  const segment = new Uint8Array([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]);
  const bytes = new Uint8Array(plain.length + segment.length);
  bytes.set(plain.subarray(0, 2), 0);
  bytes.set(segment, 2);
  bytes.set(plain.subarray(2), 2 + segment.length);
  return new File([bytes], 'IMG_small.jpg', { type: 'image/jpeg' });
}

async function containsAscii(file: File, text: string): Promise<boolean> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const needle = new TextEncoder().encode(text);
  outer: for (let i = 0; i <= bytes.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
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

  it('re-encodes a small decodable photo so its EXIF block (GPS) does not reach the listing', async () => {
    const photo = await jpegWithExif(64, 48);
    expect(await containsAscii(photo, 'Exif')).toBeTrue();
    expect(photo.size).toBeLessThan(LISTING_PHOTO_COMPRESSION.maxBytes);

    const result = await compressImageForUpload(photo, LISTING_PHOTO_COMPRESSION);

    expect(result).not.toBe(photo);
    expect(result.type).toBe('image/jpeg');
    expect(await containsAscii(result, 'Exif')).toBeFalse();
    const { width, height } = await dimensionsOf(result);
    expect([width, height]).toEqual([64, 48]);
  });

  it('leaves a small non-photo image type (svg) untouched', async () => {
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'a.svg', { type: 'image/svg+xml' });

    expect(await compressImageForUpload(svg, LISTING_PHOTO_COMPRESSION)).toBe(svg);
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
