/**
 * Chart colors: the dataviz reference palette (categorical slots 1–4, validated
 * for CVD separation in light and dark mode) and its chrome tokens. Scatter charts
 * use at most three series, the all-pairs-validated subset. Surfaces match the
 * card color of the UI theme (src/style.css).
 */
export interface ChartTheme {
  series: string[];
  surface: string;
  text: string;
  muted: string;
  grid: string;
  axis: string;
  border: string;
  font: string;
  /** Low and high end of the single-hue scale for counts (calendar heatmap). */
  scale: [string, string];
  /** Links and marks that carry a failure. */
  danger: string;
}

const font = 'system-ui, -apple-system, "Segoe UI", sans-serif';

const light: ChartTheme = {
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
  surface: '#ffffff',
  text: '#0b0b0b',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  border: 'rgba(11,11,11,0.10)',
  font,
  scale: ['#b9d4f5', '#1d5aa3'],
  danger: '#dc2626',
};

const dark: ChartTheme = {
  series: ['#3987e5', '#d95926', '#199e70', '#c98500'],
  surface: '#18181b',
  text: '#fafafa',
  muted: '#9f9fa9',
  grid: '#2c2c30',
  axis: '#3f3f46',
  border: 'rgba(255,255,255,0.10)',
  font,
  scale: ['#24466e', '#8cc0f7'],
  danger: '#f87171',
};

export function chartTheme(isDark: boolean): ChartTheme {
  return isDark ? dark : light;
}
