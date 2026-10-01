import sharp from 'sharp';
import { optimiseImage, UnreadableImageError } from './image';

const photo = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg({ quality: 95 })
    .toBuffer();

describe('optimiseImage', () => {
  it('shrinks a large phone photo to WebP within 720px', async () => {
    const big = await photo(4000, 3000);
    const out = await optimiseImage(big, 'photo');
    const meta = await sharp(out.data).metadata();
    expect(out.mime).toBe('image/webp');
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width, meta.height)).toBe(720);
    expect(out.data.length).toBeLessThan(big.length);
  });

  it('never enlarges a small image', async () => {
    const out = await optimiseImage(await photo(300, 200), 'photo');
    const meta = await sharp(out.data).metadata();
    expect([meta.width, meta.height]).toEqual([300, 200]);
  });

  it('keeps QR codes lossless (PNG)', async () => {
    const qr = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    const out = await optimiseImage(qr, 'qr');
    const meta = await sharp(out.data).metadata();
    expect(out.mime).toBe('image/png');
    expect(meta.width).toBe(1000);
  });

  it('rejects files that are not images', async () => {
    await expect(optimiseImage(Buffer.from('not an image'), 'photo')).rejects.toBeInstanceOf(
      UnreadableImageError,
    );
  });
});
