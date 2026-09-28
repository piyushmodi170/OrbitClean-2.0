const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY ?? "";

/** CARTO raster tile URL. Appends the basemap API key when configured. */
export function cartoTileUrl(style: string): string {
  const base = `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`;
  if (!CARTO_KEY) return base;
  return `${base}?key=${encodeURIComponent(CARTO_KEY)}`;
}

export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
