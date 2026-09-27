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

/** Every analysis module, in sidebar order within its category. */
export const plugins: Plugin[] = [
  showAll,
  systemOnOff,
  autoruns,
  services,
  firewall,
  timeChange,
  update,
  eventReset,
  logon,
  rdpLogon,
  accountManagement,
  processExecution,
  applicationErrors,
  softwareInstall,
  usbStorage,
  cdRecording,
  documentPrinting,
  wireless,
];

export const pluginByName = new Map(plugins.map(p => [p.name, p]));
