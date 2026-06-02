import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { ListrRenderer } from 'listr2';
import { resolveProjectRoot } from './project.js';
export interface AnimationConfig {
  metadata: {
    speedMs?: number;
    width?: number;
  };
  frames: string[][];
}
const defaultAnimation: AnimationConfig = {
  metadata: { speedMs: 150, width: 25 },
  frames: [
    ["   (====)   ", "  ((====))  ", "   ziptie   ", "   v{{VERSION}}  "],
    ["  ((====))  ", " (((====))) ", "   ziptie   ", "   v{{VERSION}}  "],
    [" (((====))) ", "((((====))))", "   ziptie   ", "   v{{VERSION}}  "]
  ]
};
export function loadVersion(root: string): string {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version || '1.0.0'; }
  catch { return '1.0.0'; }
}
export function loadConfig(root: string): AnimationConfig {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'ziptie.animation.json'), 'utf8')); }
  catch { return defaultAnimation; }
}

export class ColumnRenderer implements ListrRenderer {
  public static nonTTY = false;
  public static rendererOptions = {};
  public static rendererWithOutput = true;

  private interval: NodeJS.Timeout | null = null;
  private currentFrameIndex = 0;
  private lastLineCount = 0;
  private version = '1.0.0';
  private animationConfig: AnimationConfig;

  constructor(private tasks: any[], private options: any) {
    const root = resolveProjectRoot();
    this.version = loadVersion(root);
    this.animationConfig = loadConfig(root);
  }

  public render(): void {
    process.stdout.write('\u001b[?25l');
    this.interval = setInterval(() => {
      this.currentFrameIndex = (this.currentFrameIndex + 1) % this.animationConfig.frames.length;
      this.draw();
    }, this.animationConfig.metadata.speedMs || 150);

    this.subscribeToTasks(this.tasks);
  }

  public end(err?: Error): void {
    if (this.interval) clearInterval(this.interval);
    this.draw();
    process.stdout.write('\u001b[?25h');
  }

  private subscribeToTasks(tasks: any[]): void {
    tasks.forEach(task => {
      task.on('STATE', () => this.draw());
      task.on('OUTPUT', () => this.draw());
      task.on('SUBTASK', (sub: any[]) => Array.isArray(sub) && this.subscribeToTasks(sub));
      if (task.subtasks) this.subscribeToTasks(task.subtasks);
    });
  }

  private draw(): void {
    const tasksOutput: string[] = [];
    this.tasks.forEach(task => this.formatTask(task, tasksOutput));

    const width = this.animationConfig.metadata.width || 25;
    const rawFrame = this.animationConfig.frames[this.currentFrameIndex];
    const rightColumn = rawFrame.map(line => {
      if (line.includes('{{VERSION}}')) {
        const text = `ziptie v${this.version}`;
        const padTotal = width - text.length;
        const padLeft = Math.floor(padTotal / 2);
        const padRight = padTotal - padLeft;
        return ' '.repeat(padLeft) + text + ' '.repeat(padRight);
      }
      return line;
    });
    const mergedOutput = this.mergeColumns(tasksOutput, rightColumn);

    if (this.lastLineCount > 0) {
      process.stdout.write(`\u001b[${this.lastLineCount}A`);
    }

    const outputString = mergedOutput.map(line => `\u001b[K${line}`).join('\n') + '\n\u001b[J';
    process.stdout.write(outputString);
    this.lastLineCount = mergedOutput.length;
  }

  private formatTask(task: any, lines: string[], depth = 0): void {
    const indent = ' '.repeat(depth * 2);
    let statusIcon = '.';
    if (task.isCompleted()) statusIcon = chalk.green('√');
    else if (task.hasFailed()) statusIcon = chalk.red('x');
    else if (task.isSkipped()) statusIcon = chalk.yellow('-');
    else if (task.isPending()) statusIcon = chalk.cyan('>');

    lines.push(`${indent}${statusIcon} ${task.title || 'Untitled'}`);

    if (task.hasSubtasks() && (!task.isCompleted() || depth > 0)) {
      const subs = task.subtasks;
      const active = depth === 0 ? Math.max(0, subs.findIndex((s: any) => s.isPending()) - 1) : 0;
      subs.forEach((s: any, idx: number) => idx >= active && this.formatTask(s, lines, depth + 1));
    }
  }

  private mergeColumns(left: string[], right: string[]): string[] {
    const FIXED_HEIGHT = 18;
    let leftLines = left;
    if (leftLines.length > FIXED_HEIGHT) {
      leftLines = leftLines.slice(-FIXED_HEIGHT);
    } else {
      leftLines = [...leftLines];
      while (leftLines.length < FIXED_HEIGHT) {
        leftLines.push('');
      }
    }

    const result: string[] = [];
    const offset = FIXED_HEIGHT - right.length;

    for (let i = 0; i < FIXED_HEIGHT; i++) {
      const leftLine = leftLines[i];
      const cleanLeft = leftLine.replace(/\u001b\[[0-9;]*m/g, '');
      const padWidth = Math.max(50 - cleanLeft.length, 0);
      const spacer = ' '.repeat(padWidth) + chalk.cyan('│') + ' ';

      const rightIndex = i - offset;
      const rightLine = rightIndex >= 0 && rightIndex < right.length ? right[rightIndex] : '';
      result.push(leftLine + spacer + chalk.bold.magenta(rightLine));
    }
    return result;
  }
}
