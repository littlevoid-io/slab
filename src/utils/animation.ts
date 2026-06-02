import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { ListrRenderer, ListrTask } from 'listr2';
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
  const packagePath = path.join(root, 'package.json');
  if (fs.existsSync(packagePath)) {
    try {
      return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }
  return '1.0.0';
}

export function loadConfig(root: string): AnimationConfig {
  const configPath = path.join(root, 'ziptie.animation.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      return defaultAnimation;
    }
  }
  return defaultAnimation;
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

  constructor(private tasks: ListrTask<any, any>[], private options: any) {
    const root = resolveProjectRoot();
    this.version = loadVersion(root);
    this.animationConfig = loadConfig(root);
  }

  public render(): void {
    const speed = this.animationConfig.metadata.speedMs || 150;
    this.interval = setInterval(() => {
      this.currentFrameIndex = (this.currentFrameIndex + 1) % this.animationConfig.frames.length;
      this.draw();
    }, speed);

    this.tasks.forEach(task => {
      task.subscribe(() => {
        this.draw();
      });
    });
  }

  public end(err?: Error): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
    this.draw();
  }

  private draw(): void {
    this.clearLastOutput();

    const tasksOutput: string[] = [];
    this.tasks.forEach(task => this.formatTask(task, tasksOutput));

    const rawFrame = this.animationConfig.frames[this.currentFrameIndex];
    const rightColumn = rawFrame.map(line => line.replace(/\{\{VERSION\}\}/g, this.version));
    const mergedOutput = this.mergeColumns(tasksOutput, rightColumn);

    process.stdout.write(mergedOutput.join('\n') + '\n');
    this.lastLineCount = mergedOutput.length;
  }

  private clearLastOutput(): void {
    if (this.lastLineCount > 0) {
      process.stdout.write(`\u001b[${this.lastLineCount}A\u001b[0J`);
    }
  }

  private formatTask(task: ListrTask<any, any>, lines: string[], depth = 0): void {
    const indent = ' '.repeat(depth * 2);
    let statusIcon = '⏳';
    
    if (task.isCompleted()) statusIcon = chalk.green('✔');
    else if (task.isFailed()) statusIcon = chalk.red('✖');
    else if (task.isSkipped()) statusIcon = chalk.yellow('⚠');
    else if (task.isPending()) statusIcon = chalk.cyan('⠋');

    const title = task.title || 'Untitled';
    lines.push(`${indent}${statusIcon} ${title}`);

    if (task.hasSubtasks()) {
      task.subtasks.forEach(sub => this.formatTask(sub, lines, depth + 1));
    }
  }

  private mergeColumns(left: string[], right: string[]): string[] {
    const maxLines = Math.max(left.length, right.length);
    const result: string[] = [];
    const width = this.animationConfig.metadata.width || 25;

    for (let i = 0; i < maxLines; i++) {
      const leftLine = left[i] || '';
      const cleanLeft = leftLine.replace(/\u001b\[[0-9;]*m/g, '');
      const padWidth = Math.max(50 - cleanLeft.length, 0);
      const spacer = ' '.repeat(padWidth) + chalk.cyan('│') + ' ';

      const rightLine = right[i] || '';
      result.push(leftLine + spacer + chalk.bold.magenta(rightLine));
    }
    return result;
  }
}
