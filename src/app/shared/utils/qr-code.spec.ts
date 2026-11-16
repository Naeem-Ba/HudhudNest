import { QR_QUIET_ZONE, buildQrMatrix, drawQrPoster, qrSvgDocument } from './qr-code';

describe('qr-code', () => {
  it('builds a matrix with the quiet zone and one path of dark runs', () => {
    const m = buildQrMatrix('https://hudhudnest.com/o/ab23cd45');
    expect(m.size).toBe(m.modules + QR_QUIET_ZONE * 2);
    expect(m.modules).toBeGreaterThanOrEqual(21);
    expect(m.path).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
    // The finder pattern in the top-left corner is dark.
    expect(m.isDark(0, 0)).toBeTrue();
  });

  it('is deterministic for the same text', () => {
    expect(buildQrMatrix('x').path).toBe(buildQrMatrix('x').path);
  });

  it('writes a standalone SVG black on white with an escaped label', () => {
    const svg = qrSvgDocument(buildQrMatrix('x'), 'A & "B" <c>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('fill="white"');
    expect(svg).toContain('fill="black"');
    expect(svg).toContain('aria-label="A &amp; &quot;B&quot; &lt;c&gt;"');
  });

  it('draws a 2048 px wide poster with the caption under the code', () => {
    const canvas = document.createElement('canvas');
    drawQrPoster(canvas, buildQrMatrix('https://hudhudnest.com/o/ab23cd45'), {
      title: 'مكتب الياسمين', subtitle: 'hudhudnest.com/o/ab23cd45', frameColor: 'black', textColor: 'black', rtl: true
    });
    expect(canvas.width).toBe(2048);
    expect(canvas.height).toBeGreaterThan(2048);
  });
});
