import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class ProcessPlugin extends PluginBase {
  name = 'process';
  category = 'Application';
  label = 'Process Execution';
  description = 'Process creation/termination with parent-child tracking';
  icon = 'fa-terminal';
  providers = ['Microsoft-Windows-Security-Auditing', 'Microsoft-Windows-Application-Experience'];
  eventIds = [4688, 4689, 500, 505];

  getFilterDefs(_events: EvtxEvent[]): FilterDef[] {
    return [
      { key: 'processName', label: 'Process Name', type: 'text', width: '160px' },
      { key: 'user', label: 'User', type: 'text', width: '160px' },
      { key: 'pid', label: 'PID', type: 'text', width: '160px' },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'action', label: 'Action', render: e => this.getAction(e) },
      { key: 'pid', label: 'PID', render: e => (e.data['_PID'] as string) || (e.data['NewProcessId'] as string) || (e.data['ProcessId'] as string) || '' },
      { key: 'processName', label: 'Process Name', render: e => (e.data['_ProcessName'] as string) || (e.data['NewProcessName'] as string) || (e.data['ProcessName'] as string) || '' },
      { key: 'parentPid', label: 'Parent PID', render: e => (e.data['_ParentPid'] as string) || '' },
      { key: 'parentName', label: 'Parent Path', render: e => (e.data['_ParentName'] as string) || '' },
      { key: 'user', label: 'User', render: e => (e.data['SubjectUserName'] as string) || (e.data['User'] as string) || '' },
      { key: 'commandLine', label: 'Command Line', render: e => (e.data['_CommandLine'] as string) || (e.data['ProcessCommandLine'] as string) || (e.data['CommandLine'] as string) || '' },
    ];
  }

  private getAction(e: EvtxEvent): string {
    switch (e.eventId) {
      case 4688: return 'Process Created';
      case 4689: return 'Process Terminated';
      case 500: return 'App Compat';
      case 505: return 'App Compat End';
      default: return `Event ${e.eventId}`;
    }
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    const sorted = [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // PID → full path map
    const pidMap = new Map<string, string>();

    // First pass: register all process creations
    for (const e of sorted) {
      if (e.eventId === 4688 || e.eventId === 500) {
        const pid = (e.data['NewProcessId'] as string) || (e.data['ProcessId'] as string);
        const name = (e.data['NewProcessName'] as string) || (e.data['ProcessName'] as string);
        if (pid && name) {
          pidMap.set(String(pid), name);
        }
      }
    }

    // Second pass: enrich events with resolved names
    for (const e of sorted) {
      const newPid = (e.data['NewProcessId'] as string) || (e.data['ProcessId'] as string);
      const newName = (e.data['NewProcessName'] as string) || (e.data['ProcessName'] as string);
      const parentPid = (e.data['ProcessId'] as string);
      const cmdLine = (e.data['ProcessCommandLine'] as string) || (e.data['CommandLine'] as string);

      if (e.eventId === 4688 || e.eventId === 500) {
        if (newPid && newName) {
          const short = newName.split('\\').pop() || newName;
          (e.data as Record<string, unknown>)._ProcessName = short;
          (e.data as Record<string, unknown>)._PID = String(newPid);
        }
        if (parentPid) {
          (e.data as Record<string, unknown>)._ParentPid = String(parentPid);
          (e.data as Record<string, unknown>)._ParentName = pidMap.get(String(parentPid)) || '(Unknown)';
        }
        if (cmdLine) {
          (e.data as Record<string, unknown>)._CommandLine = cmdLine;
        }
      } else if (e.eventId === 4689) {
        const termPid = (e.data['ProcessId'] as string);
        if (termPid) {
          (e.data as Record<string, unknown>)._PID = String(termPid);
          (e.data as Record<string, unknown>)._ProcessName = pidMap.get(String(termPid)) || '(Unknown)';
        }
      }
    }

    return sorted;
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    const procMap = new Map<string, number>();
    for (const e of events) {
      if (e.eventId === 4688) {
        const name = (e.data['_ProcessName'] as string) || (e.data['NewProcessName'] as string) || 'Unknown';
        const short = name.split('\\').pop() || name;
        procMap.set(short, (procMap.get(short) || 0) + 1);
      }
    }
    return {
      summary: [
        { title: 'Process Creations', value: events.filter(e => e.eventId === 4688 || e.eventId === 500).length },
        { title: 'Process Terminations', value: events.filter(e => e.eventId === 4689 || e.eventId === 505).length },
        { title: 'Unique Processes', value: procMap.size },
      ],
      charts: [{
        type: 'bar', title: 'Most Frequent Processes',
        data: Array.from(procMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => ({ name, count })),
        xKey: 'name', yKey: 'count',
      }],
    };
  }

  getChartData(events: EvtxEvent[]): ChartConfig[] {
    return [];
  }

  getExportData(events: EvtxEvent[]): Record<string, unknown>[] {
    return events.map(e => ({
      Timestamp: e.timestamp.toISOString(),
      EventID: e.eventId,
      Action: this.getAction(e),
      ProcessName: e.data['_ProcessName'] || e.data['NewProcessName'] || e.data['ProcessName'] || '',
      PID: e.data['_PID'] || e.data['NewProcessId'] || e.data['ProcessId'] || '',
      ParentPID: e.data['_ParentPid'] || '',
      ParentProcess: e.data['_ParentName'] || '',
      User: e.data['SubjectUserName'] || e.data['User'] || '',
      CommandLine: e.data['_CommandLine'] || e.data['ProcessCommandLine'] || e.data['CommandLine'] || '',
    }));
  }
}
