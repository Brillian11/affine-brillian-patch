import React, { useState } from 'react';

import { TaskCard } from './task-card';
import { type TodoistProject, TodoistService, type TodoistTask } from './todoist-service';

interface DraggableTaskListProps {
  tasks: TodoistTask[];
  projects: TodoistProject[];
  onTaskUpdate: () => void;
  onDeleteTask: (taskId: string) => Promise<void>;
  onToggleTask: (task: TodoistTask) => Promise<void>;
  onSelectLabel?: (label: string) => void;
}

export const DraggableTaskList: React.FC<DraggableTaskListProps> = ({
  tasks,
  projects,
  onTaskUpdate,
  onDeleteTask,
  onToggleTask,
  onSelectLabel,
}) => {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTaskId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverTaskId !== id) {
      setDragOverTaskId(id);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    setDraggedTaskId(null);
    setDragOverTaskId(null);

    if (!sourceId || sourceId === targetId) return;

    const activeTasks = tasks.filter(t => !t.is_completed);
    const sourceIdx = activeTasks.findIndex(t => t.id === sourceId);
    const targetIdx = activeTasks.findIndex(t => t.id === targetId);

    if (sourceIdx === -1 || targetIdx === -1) return;

    const reordered = [...activeTasks];
    const [moved] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    const reorderedIds = reordered.map(t => t.id);
    await TodoistService.reorderTasks(reorderedIds);
    onTaskUpdate();
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverTaskId(null);
  };

  const activeTasks = tasks.filter(t => !t.is_completed);
  const completedTasks = tasks.filter(t => t.is_completed);

  return (
    <div className="draggable-task-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {activeTasks.map(task => (
        <div
          key={task.id}
          draggable
          onDragStart={e => handleDragStart(e, task.id)}
          onDragOver={e => handleDragOver(e, task.id)}
          onDrop={e => { handleDrop(e, task.id).catch(console.error); }}
          onDragEnd={handleDragEnd}
          style={{
            cursor: 'grab',
            opacity: draggedTaskId === task.id ? 0.4 : 1,
            borderTop: dragOverTaskId === task.id ? '2px solid #2563eb' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <TaskCard
            task={task}
            projects={projects}
            onTaskUpdate={onTaskUpdate}
            onDeleteTask={onDeleteTask}
            onToggleTask={onToggleTask}
            onSelectLabel={onSelectLabel}
          />
        </div>
      ))}

      {completedTasks.length > 0 && (
        <>
          {activeTasks.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0 8px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--affine-border-color, #eaeaea)' }} />
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>✅ Completed Tasks</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--affine-border-color, #eaeaea)' }} />
            </div>
          )}
          {completedTasks.map(task => (
            <div key={task.id}>
              <TaskCard
                task={task}
                projects={projects}
                onTaskUpdate={onTaskUpdate}
                onDeleteTask={onDeleteTask}
                onToggleTask={onToggleTask}
                onSelectLabel={onSelectLabel}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
};
