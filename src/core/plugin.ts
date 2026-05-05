import type { EvtxEvent, EventFilter } from './evtx/types';
import { eventStore } from './store';

export interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'scatter';
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  categoryKey?: string;
}

export interface DashboardData {
  summary: {
    title: string;
    value: number | string;
    unit?: string;
  }[];
  charts: ChartConfig[];
}

export interface TableColumn {
  key: string;
  label: string;
  render?: (event: EvtxEvent) => string;
  sortable?: boolean;
  visible?: boolean;
  width?: string;
}

export interface FilterDef {
  key: string;
  label: string;
  type: 'select' | 'text';
  options?: string[];
  width?: string;
}

export interface Plugin {
  name: string;
  category: string;
  label: string;
  description: string;
  icon: string;
  providers: string[];
  eventIds: number[];

  getFilters(baseFilter?: EventFilter): EventFilter;
  getFilterDefs(events: EvtxEvent[]): FilterDef[];
  getTableColumns(): TableColumn[];
  processEvents(events: EvtxEvent[]): EvtxEvent[];
  getDashboardData(events: EvtxEvent[]): DashboardData;
  getChartData(events: EvtxEvent[]): ChartConfig[];
  getExportData(events: EvtxEvent[]): Record<string, unknown>[];
}

export abstract class PluginBase implements Plugin {
  abstract name: string;
  abstract category: string;
  abstract label: string;
  abstract description: string;
  abstract icon: string;
  abstract providers: string[];
  abstract eventIds: number[];

  getFilters(baseFilter?: EventFilter): EventFilter {
    return {
      ...baseFilter,
      providers: this.providers.length > 0 ? this.providers : undefined,
      eventIds: this.eventIds.length > 0 ? this.eventIds : undefined,
    };
  }

  getFilterDefs(_events: EvtxEvent[]): FilterDef[] {
    return [];
  }

  abstract getTableColumns(): TableColumn[];
  abstract processEvents(events: EvtxEvent[]): EvtxEvent[];
  abstract getDashboardData(events: EvtxEvent[]): DashboardData;
  abstract getChartData(events: EvtxEvent[]): ChartConfig[];
  abstract getExportData(events: EvtxEvent[]): Record<string, unknown>[];
}

export class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map();
  private categories: Map<string, Plugin[]> = new Map();

  register(plugin: Plugin): void {
    this.plugins.set(plugin.name, plugin);

    const cat = plugin.category || 'Uncategorized';
    if (!this.categories.has(cat)) {
      this.categories.set(cat, []);
    }
    this.categories.get(cat)!.push(plugin);
  }

  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  getAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getCategories(): Map<string, Plugin[]> {
    return this.categories;
  }

  getPluginEvents(pluginName: string): EvtxEvent[] {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return [];

    const filter = plugin.getFilters();
    const events = eventStore.query(filter);
    return plugin.processEvents(events);
  }
}

export const pluginRegistry = new PluginRegistry();
