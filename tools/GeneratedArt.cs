// Turns generated "pixel art" into real pixel art: loaded by
// tools/extract-art.ps1 through Add-Type, so no extra install is needed.
//
// Image generators draw pixel art as big blocks of colour on a flat magenta
// background, but never on the grid they're asked for and never with real
// transparency: blocks are 16 or 17.4 pixels rather than 8, and anything
// meant to be see-through is painted blended into the magenta. This:
//
//   1. keys the magenta out, and un-blends the pinkish pixels back into the
//      colour they were meant to be at the transparency they were meant to
//      have;
//   2. measures the image's actual block size and offset along each axis;
//   3. samples one pixel from the middle of every block, which rebuilds the
//      art at its true pixel-art resolution — crisp, like the rest of the
//      game, instead of a blurry shrink;
//   4. splits it into equal frames and trims every frame to the same box, so
//      an animation doesn't wobble.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class GeneratedArt
{
    // Premultiplied-free float RGBA, one entry per source pixel.
    private struct Px { public float R, G, B, A; }

    private static Px[] Load(string path, out int w, out int h)
    {
        using (var src = new Bitmap(path))
        using (var bmp = src.Clone(new Rectangle(0, 0, src.Width, src.Height), PixelFormat.Format32bppArgb))
        {
            w = bmp.Width; h = bmp.Height;
            var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var raw = new int[w * h];
            Marshal.Copy(data.Scan0, raw, 0, raw.Length);
            bmp.UnlockBits(data);
            var px = new Px[raw.Length];
            for (int i = 0; i < raw.Length; i++)
            {
                int c = raw[i];
                px[i] = new Px { R = (c >> 16) & 255, G = (c >> 8) & 255, B = c & 255, A = 1 };
            }
            return px;
        }
    }

    // unmix: "all"  un-blend every pinkish pixel;
    //        "warm" only when the recovered colour isn't blue — so real violet
    //               stays violet instead of being "un-blended" into cyan;
    //        "off"  pinkish pixels stay as painted.
    private static void Unmatte(Px[] px, string unmix)
    {
        for (int i = 0; i < px.Length; i++)
        {
            var p = px[i];
            float dr = 255 - p.R, dg = p.G, db = 255 - p.B;
            float distance = (float)Math.Sqrt(dr * dr + dg * dg + db * db);
            if (distance < 70) { px[i].A = 0; continue; }
            if (unmix == "off") continue;
            bool pinkish = p.R > 170 && p.B > 140 && p.G < 230 && distance < 200;
            if (!pinkish) continue;

            // Painted = a * colour + (1 - a) * magenta. Magenta has no green and
            // full red and blue, so the least transparent a that keeps every
            // channel in range is:
            float a = Math.Max(p.G / 255f, Math.Max((255 - p.R) / 255f, (255 - p.B) / 255f));
            if (a > 0.85f) continue;
            a = Math.Max(a, 0.15f);
            float r = Clamp((p.R - (1 - a) * 255) / a);
            float g = Clamp(p.G / a);
            float b = Clamp((p.B - (1 - a) * 255) / a);
            if (unmix == "warm" && b > r + 40) continue;
            // Un-blending pale violet gives green, which none of this art is
            // meant to be: that's a misread, so leave the pixel as painted.
            if (g > r + 30 && g > b + 30) continue;
            px[i] = new Px { R = r, G = g, B = b, A = a };
        }
    }

    private static float Clamp(float v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

    private static bool Differs(Px a, Px b)
    {
        if ((a.A > 0.5f) != (b.A > 0.5f)) return true;
        if (a.A <= 0.5f) return false;
        return Math.Abs(a.R - b.R) + Math.Abs(a.G - b.G) + Math.Abs(a.B - b.B) > 36;
    }

    // Block size and offset along one axis, from where colour changes: every
    // edge sits on a block boundary, so the right size puts them all at the
    // same phase. A divisor of the true size scores just as well, so this
    // takes the largest size that scores nearly the best.
    private static void Grid(List<float> edges, out float size, out float phase)
    {
        size = 8; phase = 0;
        if (edges.Count < 20) return;
        var scores = new List<KeyValuePair<float, float>>();
        float best = 0;
        for (float s = 5; s <= 48; s += 0.05f)
        {
            double sx = 0, sy = 0;
            foreach (var e in edges) { double t = 2 * Math.PI * e / s; sx += Math.Cos(t); sy += Math.Sin(t); }
            float r = (float)(Math.Sqrt(sx * sx + sy * sy) / edges.Count);
            scores.Add(new KeyValuePair<float, float>(s, r));
            if (r > best) best = r;
        }
        foreach (var kv in scores) if (kv.Value >= best * 0.9f) size = kv.Key;
        double cx = 0, cy = 0;
        foreach (var e in edges) { double t = 2 * Math.PI * e / size; cx += Math.Cos(t); cy += Math.Sin(t); }
        double angle = Math.Atan2(cy, cx);
        if (angle < 0) angle += 2 * Math.PI;
        phase = (float)(angle / (2 * Math.PI) * size);
    }

    // Returns a short report line. Writes a strip of `cols` frames per row;
    // with more than one row, one file per row (`outPattern` gets {row}).
    public static string Process(string path, int cols, int rows, string unmix, string outPattern)
    {
        int w, h;
        var px = Load(path, out w, out h);
        Unmatte(px, unmix);

        var xs = new List<float>();
        var ys = new List<float>();
        for (int y = 0; y < h; y += 3)
            for (int x = 1; x < w; x++)
                if (Differs(px[y * w + x], px[y * w + x - 1])) xs.Add(x);
        for (int x = 0; x < w; x += 3)
            for (int y = 1; y < h; y++)
                if (Differs(px[y * w + x], px[(y - 1) * w + x])) ys.Add(y);
        float bx, ox, by, oy;
        Grid(xs, out bx, out ox);
        Grid(ys, out by, out oy);

        // One sample per block, from the middle of it (a 3x3 average, so a
        // stray noisy pixel can't decide a block's colour).
        int nx = (int)Math.Floor((w - ox) / bx);
        int ny = (int)Math.Floor((h - oy) / by);
        var cells = new Px[nx * ny];
        var cellSrcX = new float[nx];
        var cellSrcY = new float[ny];
        for (int cy = 0; cy < ny; cy++)
        {
            float sy = oy + (cy + 0.5f) * by;
            cellSrcY[cy] = sy;
            for (int cx = 0; cx < nx; cx++)
            {
                float sx = ox + (cx + 0.5f) * bx;
                cellSrcX[cx] = sx;
                float r = 0, g = 0, b = 0, a = 0; int n = 0;
                for (int dy = -1; dy <= 1; dy++)
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        int ix = Math.Min(w - 1, Math.Max(0, (int)sx + dx));
                        int iy = Math.Min(h - 1, Math.Max(0, (int)sy + dy));
                        var p = px[iy * w + ix];
                        r += p.R * p.A; g += p.G * p.A; b += p.B * p.A; a += p.A; n++;
                    }
                cells[cy * nx + cx] = a > 0 ? new Px { R = r / a, G = g / a, B = b / a, A = a / n } : new Px();
            }
        }

        // Which frame each block belongs to, by where it sat in the source.
        float fw = (float)w / cols, fh = (float)h / rows;
        var report = new List<string>();
        for (int row = 0; row < rows; row++)
        {
            var frameCols = new List<int>[cols];
            for (int f = 0; f < cols; f++) frameCols[f] = new List<int>();
            for (int cx = 0; cx < nx; cx++) frameCols[Math.Min(cols - 1, (int)(cellSrcX[cx] / fw))].Add(cx);
            var rowCells = new List<int>();
            for (int cy = 0; cy < ny; cy++) if (Math.Min(rows - 1, (int)(cellSrcY[cy] / fh)) == row) rowCells.Add(cy);

            int frameW = 0;
            foreach (var list in frameCols) frameW = Math.Max(frameW, list.Count);
            int frameH = rowCells.Count;

            // One box that fits every frame's content, so frames stay aligned.
            int minX = frameW, maxX = -1, minY = frameH, maxY = -1;
            for (int f = 0; f < cols; f++)
                for (int i = 0; i < frameCols[f].Count; i++)
                    for (int j = 0; j < frameH; j++)
                        if (cells[rowCells[j] * nx + frameCols[f][i]].A > 0.1f)
                        {
                            minX = Math.Min(minX, i); maxX = Math.Max(maxX, i);
                            minY = Math.Min(minY, j); maxY = Math.Max(maxY, j);
                        }
            if (maxX < 0) throw new Exception("Nothing left after keying out the background: " + path);
            int outW = maxX - minX + 1, outH = maxY - minY + 1;

            using (var outBmp = new Bitmap(outW * cols, outH, PixelFormat.Format32bppArgb))
            {
                for (int f = 0; f < cols; f++)
                    for (int i = minX; i <= maxX; i++)
                        for (int j = minY; j <= maxY; j++)
                        {
                            if (i >= frameCols[f].Count) continue;
                            var c = cells[rowCells[j] * nx + frameCols[f][i]];
                            int alpha = c.A < 0.1f ? 0 : (int)Math.Round(Math.Min(1f, c.A) * 255);
                            outBmp.SetPixel(f * outW + (i - minX), j - minY,
                                Color.FromArgb(alpha, (int)c.R, (int)c.G, (int)c.B));
                        }
                string outPath = outPattern.Replace("{row}", (row + 1).ToString());
                outBmp.Save(outPath, ImageFormat.Png);
                report.Add(string.Format("{0} frames of {1}x{2}", cols, outW, outH));
            }
        }
        return string.Format("blocks {0:0.0}x{1:0.0}px -> ", bx, by) + string.Join("; ", report);
    }
}
