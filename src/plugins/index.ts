import type { Plugin } from '@/core/plugin';
import { showAll } from './showAll';
import { systemOnOff } from './systemOnOff';
import { autoruns } from './autoruns';
import { services } from './services';
import { firewall } from './firewall';
import { timeChange } from './timeChange';
import { update } from './update';
import { eventReset } from './eventReset';
import { logon } from './logon';
import { rdpLogon } from './rdpLogon';
import { accountManagement } from './account';
import { processExecution } from './process';
import { applicationErrors } from './applicationErrors';
import { softwareInstall } from './softwareInstall';
import { usbStorage } from './usbStorage';
import { cdRecording } from './cdRecording';
import { documentPrinting } from './documentPrinting';
import { wireless } from './wireless';
import { powershell } from './powershell';
import { defender } from './defender';
import { createTimeline } from './timeline';
import { starred } from './starred';

/** Analysis modules, in sidebar order within their category. */
const modules: Plugin[] = [
  systemOnOff,
  autoruns,
  services,
  firewall,
  timeChange,
  update,
  eventReset,
  defender,
  logon,
  rdpLogon,
  accountManagement,
  processExecution,
  powershell,
  applicationErrors,
  softwareInstall,
  usbStorage,
  cdRecording,
  documentPrinting,
  wireless,
];

/** Every page: All Events, the timeline over the modules and the starred events, then the modules. */
export const plugins: Plugin[] = [showAll, createTimeline(modules), starred, ...modules];

export const pluginByName = new Map(plugins.map(p => [p.name, p]));
