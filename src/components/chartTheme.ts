/**
 * Chart colors: the dataviz reference palette (categorical slots 1–4, validated
 * for CVD separation on a light surface) and its chrome tokens. Scatter charts
 * use at most three series, the all-pairs-validated subset.
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
}

const font = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const chartTheme: ChartTheme = {
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
  surface: '#fcfcfb',
  text: '#0b0b0b',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  border: 'rgba(11,11,11,0.10)',
  font,
};
