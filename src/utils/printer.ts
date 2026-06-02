import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { resolveProjectRoot } from './project.js';

function toUserFriendlyLabel(key: string): string {
  const spaced = key.replace(/([A-Z])/g, ' $1');
  const result = spaced.replace(/([A-Z])\s(?=[A-Z])/g, '$1');
  return result.charAt(0).toUpperCase() + result.slice(1).trim();
}

function isEqual(val1: any, val2: any, key?: string): boolean {
  if (Array.isArray(val1) && Array.isArray(val2)) {
    if (val1.length !== val2.length) return false;
    if (key === 'apps') {
      const s1 = [...val1].sort((a, b) => String(a).localeCompare(String(b)));
      const s2 = [...val2].sort((a, b) => String(a).localeCompare(String(b)));
      return s1.every((item, index) => item === s2[index]);
    }
    return val1.every((item, index) => item === val2[index]);
  }
  return val1 === val2;
}

function formatValue(value: any): string {
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const formatted = value.map((v) => (typeof v === 'string' ? `"${v}"` : String(v)));
    return `[${formatted.join(', ')}]`;
  }
  if (value === undefined || value === null) return 'undefined';
  return JSON.stringify(value);
}

function formatSettingLine(
  key: string,
  val: any,
  defaultVal: any,
  isCustom: boolean,
  padding: string,
): string {
  const label = toUserFriendlyLabel(key);
  const formattedVal = formatValue(val);
  if (isCustom) {
    const customText = chalk.yellow(`${label}:${padding} ${formattedVal}`);
    const defaultText = chalk.dim(` (default: ${formatValue(defaultVal)})`);
    return `  ${customText}${defaultText}`;
  }
  return chalk.dim(`  ${label}:${padding} ${formattedVal}`);
}

function printCategory(
  title: string,
  configCat: any,
  defaultCat: any,
): void {
  console.log(`\n${chalk.bold(title)}:`);
  const keys = Object.keys(configCat);
  if (keys.length === 0) return;
  const maxLen = Math.max(...keys.map((k) => toUserFriendlyLabel(k).length));
  for (const key of keys) {
    const isCustom = !isEqual(configCat[key], defaultCat[key], key);
    const labelLen = toUserFriendlyLabel(key).length;
    const padding = ' '.repeat(maxLen - labelLen);
    const line = formatSettingLine(key, configCat[key], defaultCat[key], isCustom, padding);
    console.log(line);
  }
}

function getUnmodifiedWindowsLabel(key: string, val: any): string {
  const label = toUserFriendlyLabel(key);
  if (typeof val === 'boolean') return label;
  return `${label} (${formatValue(val)})`;
}

function printWindowsCategory(configCat: any, defaultCat: any): void {
  console.log(`\n${chalk.bold('Windows')}:`);
  const keys = Object.keys(configCat);
  const customKeys = keys.filter((k) => !isEqual(configCat[k], defaultCat[k], k));
  const defaultKeys = keys.filter((k) => isEqual(configCat[k], defaultCat[k], k));
  if (customKeys.length > 0) {
    const maxLen = Math.max(...customKeys.map((k) => toUserFriendlyLabel(k).length));
    for (const key of customKeys) {
      const padding = ' '.repeat(maxLen - toUserFriendlyLabel(key).length);
      console.log(formatSettingLine(key, configCat[key], defaultCat[key], true, padding));
    }
    console.log('');
  }
  if (defaultKeys.length > 0) {
    const labels = defaultKeys.map((k) => getUnmodifiedWindowsLabel(k, configCat[k]));
    console.log(chalk.dim(`  Active Defaults:`));
    console.log(chalk.dim(`  ${labels.join(', ')}`));
  }
}

function loadDefaultConfig(): any {
  const projectRoot = resolveProjectRoot();
  const configPath = path.join(projectRoot, 'ziptie.default.config.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {}
  }
  return {};
}

function resolveDefaultConfigPaths(defaultConfig: any, customConfigPath: string | null): void {
  const configFilePath = customConfigPath
    ? path.resolve(customConfigPath)
    : path.resolve(process.cwd(), 'ziptie.config.json');
  const configDir = path.dirname(configFilePath);
  const pm = defaultConfig.packageManager;
  if (pm && typeof pm.localInstallersPath === 'string' && !path.isAbsolute(pm.localInstallersPath)) {
    pm.localInstallersPath = path.resolve(configDir, pm.localInstallersPath);
  }
  const st = defaultConfig.startupTask;
  if (st && typeof st.workingDir === 'string' && !path.isAbsolute(st.workingDir)) {
    st.workingDir = path.resolve(configDir, st.workingDir);
  }
}

export function printConfig(
  config: any,
  customConfigPath: string | null = null,
): void {
  console.log(chalk.bold.cyan('\n⚙️  Settings Overview:'));
  const defaultConfig = loadDefaultConfig();
  resolveDefaultConfigPaths(defaultConfig, customConfigPath);
  const categories = [
    { key: 'system', title: 'System' },
    { key: 'autologon', title: 'Autologon' },
    { key: 'startupTask', title: 'Startup Task' },
    { key: 'packageManager', title: 'Package Manager' },
  ];
  for (const { key, title } of categories) {
    printCategory(title, config[key] || {}, defaultConfig[key] || {});
  }
  printWindowsCategory(config.windows || {}, defaultConfig.windows || {});
  console.log('');
}
