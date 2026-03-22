'use client';

import { useState, useCallback, useMemo } from 'react';
import { Task, Milestone } from '@/types/task';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Diamond, Plus } from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay,
  startOfWeek, endOfWeek, parseISO, isAfter, startOfDay,
  differenceInDays, addDays,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { TaskDndProvider } from '@/components/dnd/dnd-provider';
import { useTaskDrag } from '@/hooks/use-task-drag';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { CreateTaskDialog } from './create-task-dialog';
import { EventPopover } from './event-popover';
import { getEventColor, getEventPillStyle, getPriorityDotColor } from './calendar-colors';

interface TaskCalendarProps {
  tasks: Task[];
  onUpdate: () => void;
  milestones?: Milestone[];
  projectId?: string;
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

interface MultiDayEventLayout {
  task: Task;
  col: number;
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

const LANE_H = 26;

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

function isMultiDay(task: Task): boolean {
  if (!task.dueDate || !task.startDate) return false;
  return differenceInDays(startOfDay(parseISO(task.dueDate)), startOfDay(parseISO(task.startDate))) >= 1;
}

function layoutWeekEvents(tasks: Task[], weekStart: Date, weekEnd: Date): MultiDayEventLayout[] {
  const events = tasks
    .filter(t => {
      if (!t.dueDate || !t.startDate) return false;
      const s = startOfDay(parseISO(t.startDate));
      const e = startOfDay(parseISO(t.dueDate));
      return differenceInDays(e, s) >= 1 && !isAfter(s, weekEnd) && !isAfter(weekStart, e);
    })
    .map(t => {
      const s = startOfDay(parseISO(t.startDate!));
      const e = startOfDay(parseISO(t.dueDate!));
      const visStart = isAfter(s, weekStart) ? s : weekStart;
      const visEnd = isAfter(e, weekEnd) ? weekEnd : e;
      const col = differenceInDays(visStart, weekStart);
      const endCol = differenceInDays(visEnd, weekStart);
      return { task: t, col, span: endCol - col + 1, lane: 0, continuesBefore: isAfter(weekStart, s), continuesAfter: isAfter(e, weekEnd) };
    })
    .sort((a, b) => a.col - b.col || b.span - a.span);

  const laneEnds: number[] = [];
  return events.map(ev => {
    let lane = laneEnds.findIndex(end => end < ev.col);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = ev.col + ev.span - 1;
    return { ...ev, lane };
  });
}

// ---- Droppable cell ----
function DroppableTasksArea({ day, isOverDrop, children, onClick }: {
  day: Date; isOverDrop: boolean; children: React.ReactNode; onClick: () => void;
}) {
  const { setNodeRef } = useDroppable({ id: format(day, 'yyyy-MM-dd') });
  return (
    <div ref={setNodeRef} onClick={onClick}
      className={`min-h-[80px] p-1.5 transition-colors ${isOverDrop ? 'bg-blue-50' : ''}`}>
      {children}
    </div>
  );
}

// ---- Draggable chip (Google Calendar solid pill style) ----
function DraggableChip({ task, onClick }: { task: Task; onClick: (e: React.MouseEvent) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const pillStyle = getEventPillStyle(task);
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs cursor-pointer mb-1
        hover:brightness-90 transition-all select-none
        ${isDragging ? 'opacity-30' : ''}`}
      style={pillStyle}
    >
      <span className="truncate font-medium">{task.title}</span>
    </div>
  );
}

// ---- Main ----
export function TaskCalendar({ tasks, onUpdate, milestones = [], projectId, currentDate, onDateChange }: TaskCalendarProps) {
  const { updateTask } = useTaskDrag({ onUpdate });
  const [overDateId, setOverDateId] = useState<string | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [popoverTask, setPopoverTask] = useState<{ task: Task; rect: DOMRect } | null>(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { locale: ja });
  const calendarEnd = endOfWeek(monthEnd, { locale: ja });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weeks = chunk(calendarDays, 7);

  const multiDayTasks = useMemo(() => tasks.filter(isMultiDay), [tasks]);
  const singleDayTasks = useMemo(() => tasks.filter(t => !isMultiDay(t)), [tasks]);

  const getSingleDay = (d: Date) => singleDayTasks.filter(t => t.dueDate && isSameDay(parseISO(t.dueDate), d));
  const getDayMilestones = (d: Date) => milestones.filter(m => isSameDay(parseISO(m.dueDate), d));

  const handleDragOver = useCallback((e: DragOverEvent) => setOverDateId(e.over?.id as string | null), []);
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setOverDateId(null);
    const { active, over } = event;
    if (!over) return;
    const task = tasks.find(t => t.id === active.id);
    if (!task || !task.dueDate) return;
    const oldDue = parseISO(task.dueDate);
    const newDue = parseISO(over.id as string);
    if (isSameDay(oldDue, newDue)) return;
    newDue.setHours(oldDue.getHours(), oldDue.getMinutes());
    const data: Record<string, string> = { dueDate: newDue.toISOString() };
    if (task.startDate) {
      data.startDate = addDays(parseISO(task.startDate), differenceInDays(newDue, oldDue)).toISOString();
    }
    updateTask(active.id as string, data);
  }, [tasks, updateTask]);

  const handleEventClick = useCallback((e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverTask({ task, rect });
  }, []);

  return (
    <TaskDndProvider tasks={tasks} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="bg-white overflow-hidden h-full flex flex-col">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
            <div key={d} className={`py-2.5 text-center text-xs font-semibold tracking-wide
              ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* 週ごとのレンダリング */}
        <div className="flex-1 overflow-auto">
          {weeks.map((week, wi) => {
            const weekStart = startOfDay(week[0]);
            const weekEnd = startOfDay(week[6]);
            const layout = layoutWeekEvents(multiDayTasks, weekStart, weekEnd);
            const maxLane = layout.length > 0 ? Math.max(...layout.map(e => e.lane)) + 1 : 0;

            return (
              <div key={wi} className="border-b border-gray-100 last:border-b-0">
                {/* 日付行 */}
                <div className="grid grid-cols-7">
                  {week.map((day, di) => {
                    const inMonth = isSameMonth(day, currentDate);
                    const isToday = isSameDay(day, new Date());
                    const dayStr = format(day, 'yyyy-MM-dd');
                    return (
                      <div key={di}
                        className={`flex items-center justify-between px-2 py-1.5 border-r border-gray-100 last:border-r-0 group
                          ${!inMonth ? 'bg-gray-50/70' : ''}
                        `}
                      >
                        <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold
                          ${!inMonth ? 'text-gray-300'
                            : isToday ? 'bg-blue-600 text-white'
                            : day.getDay() === 0 ? 'text-red-500'
                            : day.getDay() === 6 ? 'text-blue-500'
                            : 'text-gray-700'
                          }`}
                        >
                          {format(day, 'd')}
                        </span>
                        {projectId && (
                          <button
                            onClick={e => { e.stopPropagation(); setCreateDate(dayStr); }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded transition-all"
                          >
                            <Plus className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* マルチデイバー (Google Calendar solid pill style) */}
                {maxLane > 0 && (
                  <div
                    className="relative border-b border-gray-50"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                      gridTemplateRows: `repeat(${maxLane}, ${LANE_H}px)`,
                      height: `${maxLane * LANE_H + 6}px`,
                      paddingTop: '3px',
                      paddingBottom: '3px',
                    }}
                  >
                    {[1,2,3,4,5,6].map(i => (
                      <div key={i} className="absolute top-0 bottom-0 border-r border-gray-100 pointer-events-none"
                        style={{ left: `${i / 7 * 100}%` }} />
                    ))}
                    {layout.map(ev => {
                      const color = getEventColor(ev.task);
                      return (
                        <button
                          key={ev.task.id}
                          className={`flex items-center text-xs font-medium cursor-pointer
                            hover:brightness-90 active:brightness-75 transition-all truncate
                            ${ev.continuesBefore ? 'rounded-l-none pl-1.5' : 'rounded-l ml-0.5 pl-2'}
                            ${ev.continuesAfter ? 'rounded-r-none pr-0' : 'rounded-r mr-0.5'}
                          `}
                          style={{
                            gridColumn: `${ev.col + 1} / ${ev.col + ev.span + 1}`,
                            gridRow: `${ev.lane + 1}`,
                            height: `${LANE_H - 6}px`,
                            backgroundColor: color.bg,
                            color: color.text,
                          }}
                          onClick={e => handleEventClick(e, ev.task)}
                        >
                          <span className="truncate">{ev.task.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 単日タスクエリア */}
                <div className="grid grid-cols-7">
                  {week.map((day, di) => {
                    const inMonth = isSameMonth(day, currentDate);
                    const dayStr = format(day, 'yyyy-MM-dd');
                    const dayTasks = getSingleDay(day);
                    const dayMs = getDayMilestones(day);
                    const isExpanded = expandedDays.has(dayStr);
                    const MAX_SHOW = 3;
                    const shown = isExpanded ? dayTasks : dayTasks.slice(0, MAX_SHOW);

                    return (
                      <DroppableTasksArea
                        key={di}
                        day={day}
                        isOverDrop={overDateId === dayStr}
                        onClick={() => {}}
                      >
                        <div className="h-full">
                          {/* Milestones */}
                          {dayMs.map(m => (
                            <div key={m.id}
                              className="flex items-center gap-1.5 px-1.5 py-0.5 mb-1 rounded-sm bg-purple-50 border border-purple-100">
                              <Diamond className="w-3 h-3 text-purple-500 fill-current flex-shrink-0" />
                              <span className="text-xs text-purple-700 font-medium truncate">{m.name}</span>
                            </div>
                          ))}

                          {shown.map(task => (
                            <DraggableChip key={task.id} task={task}
                              onClick={e => handleEventClick(e, task)}
                            />
                          ))}

                          {!isExpanded && dayTasks.length > MAX_SHOW && (
                            <button
                              onClick={e => { e.stopPropagation(); setExpandedDays(s => new Set(s).add(dayStr)); }}
                              className="text-xs text-blue-500 hover:text-blue-700 font-medium px-1 py-0.5"
                            >
                              +{dayTasks.length - MAX_SHOW} 件
                            </button>
                          )}
                          {isExpanded && dayTasks.length > MAX_SHOW && (
                            <button
                              onClick={e => { e.stopPropagation(); setExpandedDays(s => { const n = new Set(s); n.delete(dayStr); return n; }); }}
                              className="text-xs text-gray-400 hover:text-gray-600 px-1 py-0.5"
                            >
                              折りたたむ
                            </button>
                          )}
                        </div>
                      </DroppableTasksArea>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {createDate && (
        <CreateTaskDialog
          open={!!createDate}
          onClose={() => setCreateDate(null)}
          onSuccess={() => { setCreateDate(null); onUpdate(); }}
          projectId={projectId}
          initialDueDate={createDate}
        />
      )}

      {popoverTask && (
        <EventPopover
          task={popoverTask.task}
          anchorRect={popoverTask.rect}
          onClose={() => setPopoverTask(null)}
        />
      )}
    </TaskDndProvider>
  );
}
