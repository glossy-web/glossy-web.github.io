export interface PluginMenuEntry {
  name: string;
  label: string;
  icon: string;
  children?: PluginMenuEntry[];
}

export const pluginMenu: PluginMenuEntry[] = [
  {
    name: 'showAll',
    label: 'Show All Events',
    icon: 'fa-list-alt',
  },
  {
    name: 'System',
    label: 'System',
    icon: 'fa-server',
    children: [
      { name: 'systemOnOff', label: 'System On/Off', icon: 'fa-power-off' },
      { name: 'autoruns', label: 'Autoruns', icon: 'fa-play-circle' },
      { name: 'firewall', label: 'Firewall', icon: 'fa-shield' },
      { name: 'timeChange', label: 'Time Change', icon: 'fa-clock-o' },
      { name: 'update', label: 'Windows Update', icon: 'fa-refresh' },
      { name: 'eventReset', label: 'Event Reset', icon: 'fa-trash-o' },
      { name: 'services', label: 'Services', icon: 'fa-cogs' },
    ],
  },
  {
    name: 'Account',
    label: 'Account',
    icon: 'fa-user',
    children: [
      { name: 'logon', label: 'Account Logon', icon: 'fa-sign-in' },
      { name: 'rdpLogon', label: 'RDP Logon', icon: 'fa-desktop' },
      { name: 'account', label: 'Account Events', icon: 'fa-users' },
    ],
  },
  {
    name: 'Application',
    label: 'Application',
    icon: 'fa-window-maximize',
    children: [
      { name: 'process', label: 'Process Execution', icon: 'fa-terminal' },
      { name: 'applicationErrors', label: 'Application Error', icon: 'fa-exclamation-triangle' },
      { name: 'softwareInstall', label: 'Software Install', icon: 'fa-download' },
    ],
  },
  {
    name: 'Hardware',
    label: 'Hardware',
    icon: 'fa-hdd-o',
    children: [
      { name: 'usbStorage', label: 'USB Storage', icon: 'fa-usb' },
      { name: 'cdRecording', label: 'CD/DVD Recording', icon: 'fa-disc' },
      { name: 'documentPrinting', label: 'Document Printing', icon: 'fa-print' },
      { name: 'wireless', label: 'Wireless Connect', icon: 'fa-wifi' },
    ],
  },
];
