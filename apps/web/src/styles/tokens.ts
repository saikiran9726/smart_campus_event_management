export const tokens = {
  brand: {
    indigo: '#4338CA',
    violet: '#6366F1',
    emerald: '#059669',
    rose: '#E11D48',
    amber: '#D97706',
    slate: '#0F172A',
  },
  light: {
    canvas: '#f8fafc',
    surface: '#ffffff',
    border: '#e2e8f0',
    bodyText: '#0f172a',
    mutedText: '#64748b',
    primary: '#4338CA',
    primaryForeground: '#ffffff',
    emerald: '#059669',
    rose: '#e11d48',
    amber: '#d97706',
  },
  dark: {
    canvas: '#0b0f19',
    surface: '#131b2e',
    border: '#1e293b',
    bodyText: '#f8fafc',
    mutedText: '#94a3b8',
    primary: '#6366F1',
    primaryForeground: '#ffffff',
    emerald: '#10b981',
    rose: '#f43f5e',
    amber: '#f59e0b',
  },
} as const;

export function getLuminance(hexColor: string): number {
  const cleanHex = hexColor.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const rLin = toLinear(r);
  const gLin = toLinear(g);
  const bLin = toLinear(b);

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}
