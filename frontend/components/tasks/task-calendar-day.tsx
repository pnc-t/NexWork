'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Task, Milestone } from '@/types/task';
import { taskService } from '@/services/task.service';
import { Diamond } from 'lucide-react';
import {
  format, isSameDay, parseISO, isAfter, startOfDay,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { CreateTaskDialog } from './create-task-dialog';
import { EventPopover } from './event-popover';
import { getEventColor, getEventBlockStyle } from './calendar-colors';

interface TaskCalendarDayProps {
  tasks: Task[];
  onUpdate: () => void;
  milestones?: Milestone[];
  projectId?: string;
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

const HOUR_HEIGHT = 64;
const SNAP_MINUTES = 15;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MIN_BLOCK_HEIGHT = 32;

interface DayBlock {
  task: Task;
  topPx: number;
  heightPx: number;
  col: number;
  totalCols: number;
}

function assignCols(blocks: DayBlock[]): DayBlock[] {
  if (blocks.length === 0) return blocks;
  const sorted = [...blocks].sort((a, b) => a.topPx - b.topPx);
  const groups: DayBlock[][] = [];
  for (const block of sorted) {
    const blockEnd = block.topPx + block.heightPx;
    const overlapping = groups.find(g =>
      g.some(b => b.topPx < blockEnd && b.topPx + b.heightPx > block.topPx)
    );
    if (overlapping) overlapping.push(block);
    else groups.push([block]);
  }
  const result: DayBlock[] = [];
  for (const group of groups) {
    const totalCols = group.length;
    group.forEach((b, i) => result.push({ ...b, col: i, totalCols }));
  }
  return result;
}

export function TaskCalendarDay({ tasks, onUpdate, milestones = [], projectId, currentDate, onDateChange }: TaskCalendarDayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [createInfo, setCreateInfo] = useState<{ date: string; startTime?: string } | null>(null);
  const [popoverTask, setPopoverTask] = useState<{ task: Task; rect: DOMRect } | null>(null);

  const isToday = isSameDay(currentDate, new Date());

  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      scrollRef.current.scrollTop = Math.max(0, now.getHours() * HOUR_HEIGHT - 120);
    }
  }, []);

  const allDayTasksForDay = useMemo(() =>
    tasks.filter(t => {
      if (!t.dueDate || !t.startDate) return false;
      const s = parseISO(t.startDate);
      const d = parseISO(t.dueDate);
      // 複数日にまたがり、かつ時刻が00:00のタスクのみ終日扱い
      if (!isAfter(startOfDay(d), startOfDay(s))) return false;
      if (s.getHours() !== 0 || s.getMinutes() !== 0 || d.getHours() !== 0 || d.getMinutes() !== 0) return false;
      // 当日を含むか
      return !isAfter(startOfDay(s), startOfDay(currentDate)) && !isAfter(startOfDay(currentDate), startOfDay(d));
    }),
  [tasks, currentDate]);

  const timedBlocks = useMemo<DayBlock[]>(() => {
    const raw: DayBlock[] = [];
    tasks.forEach(task => {
      if (!task.dueDate) return;
      const due = parseISO(task.dueDate);
      // 当日を含まないタスクはスキップ
      if (
        !isSameDay(due, currentDate) &&
        !(task.startDate && !isAfter(startOfDay(parseISO(task.startDate)), currentDate) && !isAfter(currentDate, startOfDay(due)))
      ) return;
      // 終日タスク（複数日+00:00）はスキップ（allDayで表示される）
      if (allDayTasksForDay.some(t => t.id === task.id)) return;

      const startDate = task.startDate ? parseISO(task.startDate) : due;
      let blockStartMin = isSameDay(startDate, currentDate) ? startDate.getHours() * 60 + startDate.getMinutes() : 0;
      let blockEndMin = isSameDay(due, currentDate) ? due.getHours() * 60 + due.getMinutes() : 24 * 60;
      // 時刻が00:00のタスク（時間未指定）はデフォルトで9:00-10:00に表示
      if (blockStartMin === 0 && blockEndMin === 0) {
        blockStartMin = 9 * 60;
        blockEndMin = 10 * 60;
      }
      if (blockEndMin <= blockStartMin) blockEndMin = blockStartMin + 60;

      raw.push({
        task,
        topPx: (blockStartMin / 60) * HOUR_HEIGHT,
        heightPx: Math.max(MIN_BLOCK_HEIGHT, ((blockEndMin - blockStartMin) / 60) * HOUR_HEIGHT),
        col: 0, totalCols: 1,
      });
    });
    return assignCols(raw);
  }, [tasks, currentDate, allDayTasksForDay]);

  const dayMilestones = milestones.filter(m => isSameDay(parseISO(m.dueDate), currentDate));

  // Drag state
  const [dragState, setDragState] = useState<{
    taskId: string; mode: 'move' | 'resize';
    startY: number; currentTopPx: number; currentHeightPx: number;
    originalTopPx: number; originalHeightPx: number;
  } | null>(null);
  const dragRef = useRef(dragState);
  dragRef.current = dragState;

  const handlePointerDown = useCallback((e: React.PointerEvent, block: DayBlock, mode: 'move' | 'resize') => {
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      taskId: block.task.id, mode,
      startY: e.clientY,
      currentTopPx: block.topPx, currentHeightPx: block.heightPx,
      originalTopPx: block.topPx, originalHeightPx: block.heightPx,
    });
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragRef.current;
    if (!ds) return;
    const deltaY = e.clientY - ds.startY;
    const snapPx = (SNAP_MINUTES / 60) * HOUR_HEIGHT;
    if (ds.mode === 'move') {
      const snappedTop = Math.max(0, Math.round((ds.originalTopPx + deltaY) / snapPx) * snapPx);
      setDragState(prev => prev ? { ...prev, currentTopPx: snappedTop } : null);
    } else {
      const snappedHeight = Math.max(snapPx, Math.round((ds.originalHeightPx + deltaY) / snapPx) * snapPx);
      setDragState(prev => prev ? { ...prev, currentHeightPx: snappedHeight } : null);
    }
  }, []);

  const handlePointerUp = useCallback(async (e: React.PointerEvent) => {
    const ds = dragRef.current;
    if (!ds) return;
    setDragState(null);
    const task = tasks.find(t => t.id === ds.taskId);
    if (!task) return;
    const startMinutes = Math.round((ds.currentTopPx / HOUR_HEIGHT) * 60);
    const durationMinutes = Math.round((ds.currentHeightPx / HOUR_HEIGHT) * 60);
    const newStart = new Date(currentDate);
    newStart.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    const newDue = new Date(currentDate);
    const endMin = startMinutes + durationMinutes;
    newDue.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
    if (
      Math.abs(startMinutes - ds.originalTopPx / HOUR_HEIGHT * 60) < 1 &&
      Math.abs(durationMinutes - ds.originalHeightPx / HOUR_HEIGHT * 60) < 1
    ) return;
    try {
      if (ds.mode === 'move') {
        await taskService.update(ds.taskId, { startDate: newStart.toISOString(), dueDate: newDue.toISOString() });
      } else {
        await taskService.update(ds.taskId, { dueDate: newDue.toISOString() });
      }
      onUpdate();
    } catch { onUpdate(); }
  }, [tasks, currentDate, onUpdate]);

  const clickRef = useRef<{ x: number; y: number } | null>(null);

  const getBlockDisplay = (block: DayBlock) => {
    if (dragState && dragState.taskId === block.task.id) {
      return { topPx: dragState.currentTopPx, heightPx: dragState.currentHeightPx, isDragging: true };
    }
    return { topPx: block.topPx, heightPx: block.heightPx, isDragging: false };
  };

  const now = new Date();
  const currentTimeTop = (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT;

  const handleEmptyClick = useCallback((e: React.MouseEvent) => {
    if (dragState) return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const totalMin = Math.floor(((e.clientY - rect.top) / HOUR_HEIGHT) * 60 / SNAP_MINUTES) * SNAP_MINUTES;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    setCreateInfo({
      date: format(currentDate, 'yyyy-MM-dd'),
      startTime: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    });
  }, [dragState, currentDate]);

  const isSun = currentDate.getDay() === 0;
  const isSat = currentDate.getDay() === 6;

  return (
    <div className="bg-white overflow-hidden h-full flex flex-col">
      {/* Day header */}
      <div className="px-5 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className={`text-xl font-bold inline-flex items-center justify-center w-10 h-10 rounded-full ${
            isToday
              ? 'bg-blue-600 text-white'
              : isSun ? 'text-red-500' : isSat ? 'text-blue-600' : 'text-gray-800'
          }`}>
            {format(currentDate, 'd')}
          </div>
          <div>
            <span className={`text-sm font-medium ${isSun ? 'text-red-600' : isSat ? 'text-blue-600' : 'text-gray-600'}`}>
              {format(currentDate, 'E', { locale: ja })}
            </span>
            {isToday && (
              <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full ml-2">今日</span>
            )}
          </div>
        </div>
        {dayMilestones.length > 0 && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {dayMilestones.map(m => (
              <span key={m.id} className="flex items-center gap-1 text-xs text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
                <Diamond className="w-3 h-3 fill-current" />{m.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* All-day tasks */}
      {allDayTasksForDay.length > 0 && (
        <div className="flex border-b border-gray-200 bg-gray-50/30 flex-shrink-0">
          <div className="w-14 flex-shrink-0 border-r border-gray-100 text-xs text-gray-400 font-medium flex items-center justify-center py-2">
            終日
          </div>
          <div className="flex-1 p-2 flex flex-wrap gap-1.5">
            {allDayTasksForDay.map(task => {
              const color = getEventColor(task);
              return (
                <div
                  key={task.id}
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setPopoverTask({ task, rect });
                  }}
                  className="text-xs font-medium px-2.5 py-1 rounded-lg cursor-pointer transition-all hover:brightness-90"
                  style={{ backgroundColor: color.bg, color: color.text }}
                >
                  {task.title}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Time grid */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onPointerMove={dragState ? handlePointerMove : undefined}
      >
        <div className="flex relative">
          {/* Time labels */}
          <div className="w-14 flex-shrink-0 border-r border-gray-100">
            {HOURS.map(hour => (
              <div key={hour} className="relative border-b border-gray-100" style={{ height: `${HOUR_HEIGHT}px` }}>
                {hour > 0 && (
                  <span className="absolute -top-2.5 right-2 text-[11px] font-medium text-gray-400 leading-none">
                    {hour}:00
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Event column */}
          <div
            className={`flex-1 relative cursor-pointer ${isToday ? 'bg-blue-50/20' : 'hover:bg-gray-50/50'}`}
            onClick={handleEmptyClick}
          >
            {HOURS.map(hour => (
              <div key={hour} className="border-b border-gray-100" style={{ height: `${HOUR_HEIGHT}px` }} />
            ))}

            {HOURS.map(hour => (
              <div
                key={`half-${hour}`}
                className="absolute left-0 right-0 border-b border-dashed border-gray-100 pointer-events-none"
                style={{ top: `${hour * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }}
              />
            ))}

            {isToday && (
              <div
                className="absolute left-0 right-0 border-t-2 border-red-400 z-20 pointer-events-none"
                style={{ top: `${currentTimeTop}px` }}
              >
                <div className="absolute -top-1.5 -left-1 w-3 h-3 bg-red-400 rounded-full" />
              </div>
            )}

            {timedBlocks.map(block => {
              const display = getBlockDisplay(block);
              const GAP = 2;
              const colFraction = 1 / block.totalCols;
              const leftPct = block.col * colFraction * 100;
              const widthCalc = block.totalCols > 1
                ? `calc(${colFraction * 100}% - ${GAP}px)`
                : `calc(100% - 8px)`;
              const blockStyle = getEventBlockStyle(block.task);

              return (
                <div
                  key={block.task.id}
                  className={`absolute px-2.5 py-1.5 overflow-hidden select-none z-10 transition-shadow
                    ${display.isDragging ? 'shadow-xl opacity-90 cursor-grabbing z-30 ring-2 ring-blue-400' : 'shadow-sm hover:shadow-md cursor-grab hover:brightness-90'}
                  `}
                  style={{
                    ...blockStyle,
                    top: `${display.topPx + 1}px`,
                    height: `${Math.max(MIN_BLOCK_HEIGHT, display.heightPx - 2)}px`,
                    left: `calc(${leftPct}% + 4px)`,
                    width: widthCalc,
                  }}
                  onPointerDown={e => {
                    e.stopPropagation();
                    clickRef.current = { x: e.clientX, y: e.clientY };
                    handlePointerDown(e, block, 'move');
                  }}
                  onPointerUp={e => {
                    e.stopPropagation();
                    if (clickRef.current) {
                      const dx = Math.abs(e.clientX - clickRef.current.x);
                      const dy = Math.abs(e.clientY - clickRef.current.y);
                      if (dx < 5 && dy < 5) {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setPopoverTask({ task: block.task, rect });
                      }
                    }
                    clickRef.current = null;
                    handlePointerUp(e);
                  }}
                >
                  <div className="text-xs font-semibold leading-snug truncate">{block.task.title}</div>
                  {display.heightPx > 48 && (
                    <div className="text-[11px] mt-0.5 leading-none opacity-80">
                      {block.task.startDate ? format(parseISO(block.task.startDate), 'HH:mm') : ''}
                      {block.task.startDate && block.task.dueDate ? '–' : ''}
                      {block.task.dueDate ? format(parseISO(block.task.dueDate), 'HH:mm') : ''}
                    </div>
                  )}
                  {display.heightPx > 72 && block.task.description && (
                    <div className="text-[11px] mt-1 line-clamp-2 opacity-70">{block.task.description}</div>
                  )}
                  <div
                    className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize hover:bg-white/20 rounded-b-lg"
                    onPointerDown={e => { e.stopPropagation(); handlePointerDown(e, block, 'resize'); }}
                    onPointerUp={e => { e.stopPropagation(); handlePointerUp(e); }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {createInfo && (
        <CreateTaskDialog
          open={!!createInfo}
          onClose={() => setCreateInfo(null)}
          onSuccess={() => { setCreateInfo(null); onUpdate(); }}
          projectId={projectId}
          initialDueDate={createInfo.date}
          initialStartDate={createInfo.date}
        />
      )}

      {popoverTask && (
        <EventPopover
          task={popoverTask.task}
          anchorRect={popoverTask.rect}
          onClose={() => setPopoverTask(null)}
        />
      )}
    </div>
  );
}
