// Colour-blind separation for the chart palettes (PLAN-THEMES.md, decision B): each colour simulated as
// people with protanopia, deuteranopia and tritanopia see it (Machado et al. 2009, severity 1.0), then
// the smallest CIELAB difference (ΔE76) between any two. Used by tests/theme.test.tsx.
const lin = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
const M: Record<string, number[][]> = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const lab = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => Math.min(1, Math.max(0, v)));
  const x = (0.4124 * r! + 0.3576 * g! + 0.1805 * b!) / 0.95047, y = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!, z = (0.0193 * r! + 0.1192 * g! + 0.9505 * b!) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};
const sim = (h: string, m: number[][]) => { const c = lin(h); return m.map((row) => row[0]! * c[0]! + row[1]! * c[1]! + row[2]! * c[2]!); };
const lum = (h: string) => { const c = lin(h); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
export const contrastOn = (h: string, bg: string) => { const [a, b] = [lum(h), lum(bg)]; return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
/** The smallest colour difference between any two palette entries, as each type of viewer sees them. */
export function minSeparation(palette: string[], firstN = palette.length) {
  const p = palette.slice(0, firstN);
  return Object.fromEntries(Object.entries(M).map(([k, m]) => {
    let min = Infinity;
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
      const [a, b] = [lab(sim(p[i]!, m)), lab(sim(p[j]!, m))];
      min = Math.min(min, Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!));
    }
    return [k, Math.round(min * 10) / 10];
  }));
}
