// Generates a data-URI SVG placeholder so the storefront has consistent,
// offline-friendly product art before real photography/Supabase Storage is wired up.
export function placeholderImage(label: string, bg: string, fg = "#ffffff") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
    <rect width="600" height="800" fill="${bg}"/>
    <text x="300" y="400" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700" fill="${fg}" text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
