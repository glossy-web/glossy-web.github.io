import type { Category } from './plugin';

/** Sidebar grouping; plugins list their own category. */
export const CATEGORIES: { id: Exclude<Category, 'All'>; label: string; icon: string }[] = [
  { id: 'System', label: 'System', icon: 'pc-display' },
  { id: 'Account', label: 'Account', icon: 'people' },
  { id: 'Application', label: 'Application', icon: 'window-stack' },
  { id: 'Hardware', label: 'Hardware', icon: 'usb-drive' },
];

/** Channels analysts usually need; the overview flags the ones missing from the loaded data. */
export const KEY_CHANNELS: { channel: string; offByDefault?: boolean; why: string }[] = [
  { channel: 'Security', why: 'Logons, accounts, process creation, policy changes' },
  { channel: 'System', why: 'Boot/shutdown, services, time changes, updates, driver installs' },
  { channel: 'Application', why: 'Crashes, MSI installs' },
  { channel: 'Microsoft-Windows-TerminalServices-LocalSessionManager/Operational', why: 'RDP sessions' },
  { channel: 'Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational', why: 'RDP authentication' },
  { channel: 'Microsoft-Windows-RemoteDesktopServices-RdpCoreTS/Operational', why: 'RDP connections (source IP)' },
  { channel: 'Microsoft-Windows-TerminalServices-RDPClient/Operational', why: 'Outbound RDP' },
  { channel: 'Microsoft-Windows-TaskScheduler/Operational', offByDefault: true, why: 'Scheduled tasks' },
  { channel: 'Microsoft-Windows-Partition/Diagnostic', why: 'Removable storage (Windows 10 1703+)' },
  { channel: 'Microsoft-Windows-Kernel-PnP/Configuration', why: 'Device installs and starts' },
  { channel: 'Microsoft-Windows-DriverFrameworks-UserMode/Operational', offByDefault: true, why: 'Device connect/disconnect' },
  { channel: 'Microsoft-Windows-PrintService/Operational', offByDefault: true, why: 'Printed documents' },
  { channel: 'Microsoft-Windows-WLAN-AutoConfig/Operational', why: 'Wi-Fi connections' },
  { channel: 'Microsoft-Windows-Windows Firewall With Advanced Security/Firewall', why: 'Firewall rule and profile changes' },
  { channel: 'Microsoft-Windows-Sysmon/Operational', offByDefault: true, why: 'Sysmon process and registry telemetry' },
];
