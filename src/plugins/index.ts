import { pluginRegistry } from '@/core/plugin';
import { ShowAllPlugin } from './showAll';
import { SystemOnOffPlugin } from './systemOnOff';
import { AutorunsPlugin } from './autoruns';
import { FirewallPlugin } from './firewall';
import { TimeChangePlugin } from './timeChange';
import { UpdatePlugin } from './update';
import { EventResetPlugin } from './eventReset';
import { ServicesPlugin } from './services';
import { LogonPlugin } from './logon';
import { RdpLogonPlugin } from './rdpLogon';
import { AccountPlugin } from './account';
import { ProcessPlugin } from './process';
import { ApplicationErrorsPlugin } from './applicationErrors';
import { SoftwareInstallPlugin } from './softwareInstall';
import { UsbStoragePlugin } from './usbStorage';
import { CdRecordingPlugin } from './cdRecording';
import { DocumentPrintingPlugin } from './documentPrinting';
import { WirelessPlugin } from './wireless';

export function registerAllPlugins(): void {
  pluginRegistry.register(new ShowAllPlugin());
  pluginRegistry.register(new SystemOnOffPlugin());
  pluginRegistry.register(new AutorunsPlugin());
  pluginRegistry.register(new FirewallPlugin());
  pluginRegistry.register(new TimeChangePlugin());
  pluginRegistry.register(new UpdatePlugin());
  pluginRegistry.register(new EventResetPlugin());
  pluginRegistry.register(new ServicesPlugin());
  pluginRegistry.register(new LogonPlugin());
  pluginRegistry.register(new RdpLogonPlugin());
  pluginRegistry.register(new AccountPlugin());
  pluginRegistry.register(new ProcessPlugin());
  pluginRegistry.register(new ApplicationErrorsPlugin());
  pluginRegistry.register(new SoftwareInstallPlugin());
  pluginRegistry.register(new UsbStoragePlugin());
  pluginRegistry.register(new CdRecordingPlugin());
  pluginRegistry.register(new DocumentPrintingPlugin());
  pluginRegistry.register(new WirelessPlugin());
}

export { pluginRegistry };
