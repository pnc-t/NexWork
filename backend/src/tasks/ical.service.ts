import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IcalService {
  constructor(private readonly prisma: PrismaService) {}

  async generateIcal(userId: string, projectId?: string): Promise<string> {
    const where: any = {};

    if (projectId) {
      where.projectId = projectId;
      // Verify access
      const member = await this.prisma.projectMember.findFirst({
        where: { projectId, userId },
      });
      if (!member) {
        throw new Error('プロジェクトへのアクセス権がありません');
      }
    } else {
      // All tasks the user has access to
      where.project = {
        members: { some: { userId } },
      };
    }

    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        project: { select: { name: true } },
      },
    });

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//NexWork//Task Manager//JP',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    for (const task of tasks) {
      if (!task.dueDate) continue;

      const uid = `${task.id}@nexwork`;
      const now = this.formatDate(new Date());
      const dtstart = task.startDate
        ? this.formatDate(new Date(task.startDate))
        : this.formatDate(new Date(task.dueDate));
      const dtend = this.formatDate(new Date(task.dueDate));
      const summary = this.escapeIcal(task.title);
      const description = this.escapeIcal(
        [task.description, task.project ? `プロジェクト: ${task.project.name}` : '']
          .filter(Boolean)
          .join('\\n'),
      );

      const statusMap: Record<string, string> = {
        todo: 'NEEDS-ACTION',
        in_progress: 'IN-PROCESS',
        done: 'COMPLETED',
      };

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${now}`);
      lines.push(`DTSTART:${dtstart}`);
      lines.push(`DTEND:${dtend}`);
      lines.push(`SUMMARY:${summary}`);
      if (description) lines.push(`DESCRIPTION:${description}`);
      lines.push(`STATUS:${statusMap[task.status] || 'NEEDS-ACTION'}`);
      const priorityMap: Record<string, number> = { high: 1, medium: 5, low: 9 };
      lines.push(`PRIORITY:${priorityMap[task.priority] || 5}`);
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  private formatDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  private escapeIcal(text: string): string {
    if (!text) return '';
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }
}
