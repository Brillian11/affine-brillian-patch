import './task-card.css';

import { Button, Input, notify } from '@affine/component';
import { DocsService } from '@affine/core/modules/doc';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  SFSymbolCalendar,
  SFSymbolChatBubble,
  SFSymbolDocCheckmark,
  SFSymbolFlag,
  SFSymbolLocationPin,
  SFSymbolPaperclip,
  SFSymbolPlus,
  SFSymbolRepeat,
  SFSymbolTag,
  SFSymbolTray,
} from '@affine/core/components/pure/icons';

import { DraggableTaskList } from './draggable-task-list';
import { HabitTracker } from './habit-tracker';
import { TaskCard } from './task-card';
import { type TodoistProject, TodoistService, type TodoistTask } from './todoist-service';

export const TodoistManager = () => {
  const docsService = useService(DocsService);
  const docDisplayMetaService = useService(DocDisplayMetaService);
  const docRecords = useLiveData(docsService.list.docs$);

  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>(
    TodoistService.getToken() ? 'connected' : 'disconnected'
  );

  const [projects, setProjects] = useState<TodoistProject[]>(() => TodoistService.getLocalProjects());
  const [tasks, setTasks] = useState<TodoistTask[]>(() => TodoistService.getLocalTasks());
  const [loading, setLoading] = useState(false);

  // New Task Form & Floating Card Modal State
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskContent, setNewTaskContent] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<number>(4); // Todoist 4 = P1 Urgent
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [showTaskDatePicker, setShowTaskDatePicker] = useState(false);
  const [showTaskPriorityPicker, setShowTaskPriorityPicker] = useState(false);
  const [showTaskProjectPicker, setShowTaskProjectPicker] = useState(false);
  const [newTaskLabels, setNewTaskLabels] = useState<string[]>([]);
  const [showTaskLabelPicker, setShowTaskLabelPicker] = useState(false);
  const [newTaskDocId, setNewTaskDocId] = useState('');
  const [newTaskDocTitle, setNewTaskDocTitle] = useState('');
  const [showTaskDocPicker, setShowTaskDocPicker] = useState(false);
  const [newTaskAttachment, setNewTaskAttachment] = useState<{
    file_name: string;
    file_url: string;
    file_type?: string;
  } | null>(null);
  const [isReadingAttachment, setIsReadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [newTaskLocation, setNewTaskLocation] = useState('');
  const [newTaskLocTrigger, setNewTaskLocTrigger] = useState<'on_enter' | 'on_leave'>('on_enter');
  const [showTaskLocationPicker, setShowTaskLocationPicker] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'today' | 'upcoming' | 'overdue' | 'completed' | 'habits'>('today');

  const loadData = useCallback(async () => {
    // 1. Instantly display local cached data
    const localTasks = TodoistService.getLocalTasks();
    const localProjects = TodoistService.getLocalProjects();
    if (localTasks.length > 0) setTasks(localTasks);
    if (localProjects.length > 0) setProjects(localProjects);

    const currentToken = TodoistService.getToken();
    if (!currentToken) {
      setConnectionStatus('disconnected');
      return;
    }

    setLoading(true);
    try {
      const [fetchedProjects, fetchedTasks] = await Promise.all([
        TodoistService.getProjects(),
        TodoistService.getTasks(),
      ]);
      setProjects(fetchedProjects);
      setTasks(fetchedTasks);
      setConnectionStatus('connected');
    } catch {
      // Retain local cached data on sync error
      setConnectionStatus('connected');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData().catch(console.error);

    const handleUpdate = () => {
      loadData().catch(console.error);
    };

    // Listen for token updates
    window.addEventListener('affine:todoist-token-updated', handleUpdate);

    // Sync on window focus (when switching back from Todoist mobile/web)
    window.addEventListener('focus', handleUpdate);

    // Auto-poll Todoist every 15 seconds to fetch new/updated tasks in the background
    const interval = setInterval(() => {
      loadData().catch(console.error);
    }, 15000);

    return () => {
      window.removeEventListener('affine:todoist-token-updated', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
      clearInterval(interval);
    };
  }, [loadData]);

  const handleCreateTask = async () => {
    const content = newTaskContent.trim();
    if (!content) return;

    try {
      const created = await TodoistService.createTask({
        content,
        description: newTaskDescription.trim() || undefined,
        due_string: newTaskDue.trim() || undefined,
        priority: newTaskPriority,
        project_id: selectedProjectId || undefined,
        labels: newTaskLabels.length > 0 ? newTaskLabels : undefined,
        location: newTaskLocation.trim() || undefined,
        loc_trigger: newTaskLocation.trim() ? newTaskLocTrigger : undefined,
        attachment: newTaskAttachment || undefined,
        linked_doc: newTaskDocId.trim()
          ? {
              docId: newTaskDocId.trim(),
              docTitle: newTaskDocTitle.trim() || 'Linked Doc',
              mode: 'page',
            }
          : undefined,
      });

      setTasks(prev => [created, ...prev]);
      setNewTaskContent('');
      setNewTaskDescription('');
      setNewTaskDue('');
      setNewTaskLabels([]);
      setNewTaskDocId('');
      setNewTaskDocTitle('');
      setNewTaskAttachment(null);
      setNewTaskLocation('');
      setShowAddTaskModal(false);
      notify.success({ title: 'Task Created', message: `"${content}" added to Todoist.` });
    } catch (err: any) {
      notify.error({ title: 'Failed to create task', message: err?.message });
    }
  };

  const handleToggleTask = async (task: TodoistTask) => {
    try {
      if (task.is_completed) {
        await TodoistService.reopenTask(task.id);
        const updated = tasks.map(t => (t.id === task.id ? { ...t, is_completed: false } : t));
        setTasks(updated);
        TodoistService.saveLocalTasks(updated);
      } else {
        await TodoistService.closeTask(task.id);
        const updated = tasks.map(t => (t.id === task.id ? { ...t, is_completed: true } : t));
        setTasks(updated);
        TodoistService.saveLocalTasks(updated);
        notify.success({ title: 'Task Completed', message: `🎉 Completed "${task.content}"` });
      }
    } catch (err: any) {
      notify.error({ title: 'Failed to update task', message: err?.message });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await TodoistService.deleteTask(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      notify.success({ title: 'Task Deleted' });
    } catch (err: any) {
      notify.error({ title: 'Failed to delete task', message: err?.message });
    }
  };

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortType, setSortType] = useState<'due_date' | 'priority' | 'alphabetical'>('due_date');

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;

    try {
      const proj = await TodoistService.createProject(name);
      setProjects(prev => [...prev, proj]);
      setNewProjectName('');
      setShowNewProjectModal(false);
      notify.success({ title: 'Project Created', message: `Project "${name}" added.` });
    } catch (err: any) {
      notify.error({ title: 'Failed to create project', message: err?.message });
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await TodoistService.deleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (selectedProjectId === projectId) setSelectedProjectId('');
      if (selectedProjectFilter === projectId) setSelectedProjectFilter('all');
      notify.success({ title: 'Project Deleted' });
    } catch (err: any) {
      notify.error({ title: 'Failed to delete project', message: err?.message });
    }
  };

  const handleSelectLabel = (label: string) => {
    setSearchQuery(`@${label}`);
  };

  // Split tasks into Overdue and Today / Upcoming
  const { overdueTasks, regularTasks } = useMemo(() => {
    const overdue: TodoistTask[] = [];
    let regular: TodoistTask[] = [];

    const inboxProject = projects.find(
      p => p.is_inbox_project || (p as any).inbox || p.name.toLowerCase() === 'inbox'
    );
    const inboxProjectId = inboxProject ? inboxProject.id : null;

    tasks.forEach(task => {
      if (selectedProjectFilter !== 'all') {
        if (selectedProjectFilter === 'inbox' || selectedProjectFilter === '📥 Inbox') {
          // Task belongs to inbox if it has no project_id, matches inbox project id/name, or labeled inbox
          if (
            task.project_id &&
            task.project_id !== 'inbox' &&
            task.project_id !== inboxProjectId &&
            (task as any).project_name !== 'Inbox' &&
            !task.labels?.includes('inbox')
          ) {
            return;
          }
        } else if (task.project_id !== selectedProjectFilter && (task as any).project_name !== selectedProjectFilter) {
          return;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim().replace(/^@/, '');
        const matchesContent = task.content.toLowerCase().includes(q);
        const matchesDesc = task.description?.toLowerCase().includes(q);
        const matchesLabel = task.labels?.some(l => l.toLowerCase().includes(q));
        if (!matchesContent && !matchesDesc && !matchesLabel) return;
      }

      if (filterTab === 'completed') {
        if (task.is_completed) {
          regular.push(task);
        }
        return;
      }

      const taskDueDate = task.due?.date ? task.due.date.slice(0, 10) : null;
      const isOverdue = taskDueDate && taskDueDate < todayStr && !task.is_completed;
      if (isOverdue) {
        overdue.push(task);
      } else {
        if (filterTab === 'today') {
          if (!task.is_completed && (!taskDueDate || taskDueDate === todayStr)) {
            regular.push(task);
          }
        } else if (filterTab === 'upcoming') {
          if (!task.is_completed && taskDueDate && taskDueDate > todayStr) {
            regular.push(task);
          }
        } else if (filterTab === 'overdue') {
          // Handled in overdue list
        } else {
          // 'all' tab: includes active and completed tasks
          regular.push(task);
        }
      }
    });

    if (sortType === 'priority') {
      regular.sort((a, b) => b.priority - a.priority);
    } else if (sortType === 'alphabetical') {
      regular.sort((a, b) => a.content.localeCompare(b.content));
    } else {
      regular.sort((a, b) => {
        const dateA = a.due?.date || '9999-12-31';
        const dateB = b.due?.date || '9999-12-31';
        return dateA.localeCompare(dateB);
      });
    }

    return { overdueTasks: overdue, regularTasks: regular };
  }, [tasks, projects, todayStr, filterTab, selectedProjectFilter, searchQuery, sortType]);

  const renderTaskRow = (task: TodoistTask) => {
    return (
      <TaskCard
        key={task.id}
        task={task}
        projects={projects}
        onTaskUpdate={() => {
          loadData().catch(console.error);
        }}
        onDeleteTask={handleDeleteTask}
        onToggleTask={handleToggleTask}
        onSelectLabel={handleSelectLabel}
      />
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '840px', margin: '0 auto' }}>
      {/* Header Dashboard Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--affine-text-primary-color, #1f1f1f)', margin: 0 }}>
            {filterTab === 'today' ? 'Today' : filterTab === 'upcoming' ? 'Upcoming' : filterTab === 'overdue' ? 'Overdue' : filterTab === 'completed' ? 'Completed Tasks' : 'All Tasks'}
          </h1>
          <div style={{ fontSize: '13px', color: 'var(--affine-text-secondary-color, #666)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <SFSymbolDocCheckmark width={14} height={14} /> {tasks.filter(t => !t.is_completed).length} active
            </span>
            <span>•</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <SFSymbolChatBubble width={14} height={14} /> {tasks.reduce((sum, t) => sum + (t.comment_count ?? t.comments_count ?? t.comments?.length ?? 0), 0)} comments
            </span>
            <span>•</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: connectionStatus === 'connected' ? '#10b981' : '#94a3b8', fontWeight: 500 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: connectionStatus === 'connected' ? '#10b981' : '#94a3b8', display: 'inline-block' }} />
              {connectionStatus === 'connected' ? 'Todoist synced' : 'Todoist ready'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {/* Header Dashboard Title */}
        </div>
      </div>

      {/* Action Buttons & Add Task Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        {!showAddTaskModal ? (
          <button
            onClick={() => setShowAddTaskModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              background: 'transparent',
              color: '#de4c4a',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              padding: '6px 8px',
              borderRadius: '6px',
            }}
          >
            <SFSymbolPlus width={14} height={14} /> Add task
          </button>
        ) : null}

        <button
          onClick={() => setShowNewProjectModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            border: 'none',
            background: 'transparent',
            color: '#de4c4a',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            padding: '6px 8px',
            borderRadius: '6px',
          }}
        >
          <SFSymbolPlus width={14} height={14} /> New project
        </button>

        <button
          onClick={() => { loadData().catch(console.error); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            border: 'none',
            background: 'transparent',
            color: '#de4c4a',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            padding: '6px 8px',
            borderRadius: '6px',
          }}
        >
          <SFSymbolRepeat width={14} height={14} /> Sync
        </button>
      </div>

      {/* New Project Modal Card */}
      {showNewProjectModal && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px',
            background: 'var(--affine-background-primary-color, #ffffff)',
            borderRadius: '8px',
            border: '1px solid #2563eb',
            alignItems: 'center',
          }}
        >
          <Input
            value={newProjectName}
            onChange={setNewProjectName}
            placeholder="Project name (e.g. Work, Personal, Shopping)"
            style={{ flex: 1, fontSize: '13px' }}
          />
          <Button onClick={() => { handleCreateProject().catch(console.error); }} type="primary">
            Create
          </Button>
          <Button onClick={() => setShowNewProjectModal(false)} variant="plain">
            Cancel
          </Button>
        </div>
      )}

      {/* Floating Todoist Add Task Card Modal */}
      {showAddTaskModal && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '16px',
            background: 'var(--affine-background-primary-color, #ffffff)',
            borderRadius: '12px',
            border: '1px solid var(--affine-border-color, #e0e0e0)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.12)',
            transition: 'all 0.2s ease',
          }}
        >
          <input
            value={newTaskContent}
            onChange={e => setNewTaskContent(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreateTask().catch(console.error);
              }
            }}
            placeholder="Task name"
            autoFocus
            style={{
              fontSize: '15px',
              fontWeight: 500,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              width: '100%',
              color: 'var(--affine-text-primary-color, #1f1f1f)',
            }}
          />

          <input
            value={newTaskDescription}
            onChange={e => setNewTaskDescription(e.target.value)}
            placeholder="Description"
            style={{
              fontSize: '13px',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              width: '100%',
              color: 'var(--affine-text-secondary-color, #666666)',
            }}
          />

          {/* Selected Attachment or Location Badges Preview */}
          {(newTaskAttachment || newTaskLocation) && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
              {newTaskAttachment && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    color: '#2563eb',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  {newTaskAttachment.file_type?.startsWith('image/') ? (
                    <img
                      src={newTaskAttachment.file_url}
                      alt="preview"
                      style={{ width: '18px', height: '18px', borderRadius: '3px', objectFit: 'cover' }}
                    />
                  ) : (
                    <span>📎</span>
                  )}
                  <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {newTaskAttachment.file_name}
                  </span>
                  <span
                    onClick={() => setNewTaskAttachment(null)}
                    style={{ cursor: 'pointer', fontWeight: 'bold', marginLeft: '2px' }}
                    title="Remove"
                  >
                    ×
                  </span>
                </div>
              )}

              {newTaskLocation && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#16a34a',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  <span>📍</span>
                  <span>
                    {newTaskLocation} ({newTaskLocTrigger === 'on_leave' ? 'Leaving' : 'Arriving'})
                  </span>
                  <span
                    onClick={() => setNewTaskLocation('')}
                    style={{ cursor: 'pointer', fontWeight: 'bold', marginLeft: '2px' }}
                    title="Remove"
                  >
                    ×
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Floating Toolbar Pills */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', paddingTop: '8px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Due Date Pill */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowTaskDatePicker(!showTaskDatePicker)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '16px',
                    border: '1px solid #e0e0e0',
                    background: '#ffffff',
                    fontSize: '12px',
                    color: newTaskDue ? '#22c55e' : '#666666',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  📅 {newTaskDue ? newTaskDue.split('T')[0] : 'Today'} ×
                </button>
                {showTaskDatePicker && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      background: '#ffffff',
                      border: '1px solid #e0e0e0',
                      borderRadius: '8px',
                      padding: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 100,
                    }}
                  >
                    <input
                      type="date"
                      value={newTaskDue.includes('T') ? newTaskDue.split('T')[0] : newTaskDue}
                      min={todayStr}
                      onChange={e => {
                        setNewTaskDue(e.target.value);
                        setShowTaskDatePicker(false);
                      }}
                      style={{ fontSize: '12px', padding: '4px 6px' }}
                    />
                  </div>
                )}
              </div>

              {/* Priority Pill */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowTaskPriorityPicker(!showTaskPriorityPicker)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '16px',
                    border: '1px solid #e0e0e0',
                    background: '#ffffff',
                    fontSize: '12px',
                    color: '#666666',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  🏳 Priority
                </button>
                {showTaskPriorityPicker && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      background: '#ffffff',
                      border: '1px solid #e0e0e0',
                      borderRadius: '8px',
                      padding: '4px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 100,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      minWidth: '110px',
                    }}
                  >
                    {[
                      { p: 4, label: 'P1 Urgent', color: '#de4c4a' },
                      { p: 3, label: 'P2 High', color: '#f97316' },
                      { p: 2, label: 'P3 Normal', color: '#2563eb' },
                      { p: 1, label: 'P4 Low', color: '#808080' },
                    ].map(({ p, label, color }) => (
                      <button
                        key={p}
                        onClick={() => {
                          setNewTaskPriority(p);
                          setShowTaskPriorityPicker(false);
                        }}
                        style={{
                          padding: '6px 10px',
                          border: 'none',
                          background: newTaskPriority === p ? `${color}18` : 'transparent',
                          color: color,
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                          textAlign: 'left',
                          borderRadius: '4px',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Project Pill */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowTaskProjectPicker(!showTaskProjectPicker)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '16px',
                    border: '1px solid #e0e0e0',
                    background: '#ffffff',
                    fontSize: '12px',
                    color: '#666666',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  📥 {selectedProjectId ? projects.find(p => p.id === selectedProjectId)?.name || 'Inbox' : 'Inbox'}
                </button>
                {showTaskProjectPicker && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      background: '#ffffff',
                      border: '1px solid #e0e0e0',
                      borderRadius: '8px',
                      padding: '4px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 100,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      minWidth: '140px',
                    }}
                  >
                    <button
                      onClick={() => {
                        setSelectedProjectId('');
                        setShowTaskProjectPicker(false);
                      }}
                      style={{
                        padding: '6px 10px',
                        border: 'none',
                        background: !selectedProjectId ? '#2563eb18' : 'transparent',
                        color: '#333',
                        cursor: 'pointer',
                        fontSize: '12px',
                        textAlign: 'left',
                        borderRadius: '4px',
                      }}
                    >
                      📥 Inbox
                    </button>
                    {projects
                      .filter(p => !p.is_inbox_project && (p as any).inbox !== true && p.name.toLowerCase() !== 'inbox')
                      .map(proj => (
                      <button
                        key={proj.id}
                        onClick={() => {
                          setSelectedProjectId(proj.id);
                          setShowTaskProjectPicker(false);
                        }}
                        style={{
                          padding: '6px 10px',
                          border: 'none',
                          background: selectedProjectId === proj.id ? '#2563eb18' : 'transparent',
                          color: '#333',
                          cursor: 'pointer',
                          fontSize: '12px',
                          textAlign: 'left',
                          borderRadius: '4px',
                        }}
                      >
                        #{proj.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Labels Pill */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowTaskLabelPicker(!showTaskLabelPicker)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '16px',
                    border: '1px solid #e0e0e0',
                    background: '#ffffff',
                    fontSize: '12px',
                    color: newTaskLabels.length > 0 ? '#2563eb' : '#666666',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  🏷 {newTaskLabels.length > 0 ? newTaskLabels.map(l => `@${l}`).join(', ') : 'Labels'}
                </button>
                {showTaskLabelPicker && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      background: '#ffffff',
                      border: '1px solid #e0e0e0',
                      borderRadius: '8px',
                      padding: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 100,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      minWidth: '180px',
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Add label e.g. Daily routine"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = (e.currentTarget.value || '').trim();
                          if (val && !newTaskLabels.includes(val)) {
                            setNewTaskLabels(prev => [...prev, val]);
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                      style={{ fontSize: '12px', padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {['Daily routine', 'Work', 'Personal', 'Urgent'].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setNewTaskLabels(prev =>
                              prev.includes(preset) ? prev.filter(l => l !== preset) : [...prev, preset]
                            );
                          }}
                          style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            border: newTaskLabels.includes(preset) ? '1px solid #2563eb' : '1px solid #e0e0e0',
                            background: newTaskLabels.includes(preset) ? '#2563eb18' : '#f8fafc',
                            color: newTaskLabels.includes(preset) ? '#2563eb' : '#64748b',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          @{preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Link Doc Pill */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowTaskDocPicker(!showTaskDocPicker)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '16px',
                    border: '1px solid #e0e0e0',
                    background: '#ffffff',
                    fontSize: '12px',
                    color: newTaskDocId ? '#2563eb' : '#666666',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  📄 {newTaskDocTitle ? newTaskDocTitle : 'Link Doc'}
                </button>
                {showTaskDocPicker && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      background: '#ffffff',
                      border: '1px solid #e0e0e0',
                      borderRadius: '8px',
                      padding: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 100,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      minWidth: '240px',
                      maxWidth: '300px',
                      maxHeight: '220px',
                      overflowY: 'auto',
                    }}
                  >
                    <input
                      type="text"
                      placeholder="🔍 Search doc or type title..."
                      value={newTaskDocTitle}
                      onChange={e => setNewTaskDocTitle(e.target.value)}
                      autoFocus
                      style={{ fontSize: '12px', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', outline: 'none' }}
                    />
                    <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {/* Existing Workspace Docs Matches */}
                      {docRecords
                        ?.filter(doc => {
                          if (doc.trash$.value) return false;
                          const title = docDisplayMetaService.title$(doc.id).value || '';
                          return !newTaskDocTitle.trim() || title.toLowerCase().includes(newTaskDocTitle.toLowerCase().trim());
                        })
                        .slice(0, 5)
                        .map(doc => {
                          const title = docDisplayMetaService.title$(doc.id).value || 'Untitled Page';
                          return (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => {
                                setNewTaskDocId(doc.id);
                                setNewTaskDocTitle(title);
                                setShowTaskDocPicker(false);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 8px',
                                borderRadius: '4px',
                                border: newTaskDocId === doc.id ? '1px solid #2563eb' : '1px solid #f1f5f9',
                                background: newTaskDocId === doc.id ? '#eff6ff' : '#f8fafc',
                                color: '#1e293b',
                                fontSize: '12px',
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              📄 <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                            </button>
                          );
                        })}

                      {/* Create New Page Option */}
                      {newTaskDocTitle.trim() ? (
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              const createdDoc = docsService.createDoc({ title: newTaskDocTitle.trim() });
                              setNewTaskDocId(createdDoc.id);
                              setNewTaskDocTitle(newTaskDocTitle.trim());
                              setShowTaskDocPicker(false);
                              notify.success({ title: 'New Doc Created', message: `Created "${newTaskDocTitle.trim()}"` });
                            } catch {
                              setNewTaskDocId(`doc-${Date.now()}`);
                              setShowTaskDocPicker(false);
                            }
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px dashed #2563eb',
                            background: '#eff6ff',
                            color: '#2563eb',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textAlign: 'left',
                            marginTop: '2px',
                          }}
                        >
                          ➕ Create new doc &quot;{newTaskDocTitle.trim()}&quot;
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              {/* Hidden File Input for Attachment */}
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setIsReadingAttachment(true);
                  const reader = new FileReader();
                  reader.onload = () => {
                    setNewTaskAttachment({
                      file_name: file.name,
                      file_url: reader.result as string,
                      file_type: file.type || 'application/octet-stream',
                    });
                    setIsReadingAttachment(false);
                  };
                  reader.onerror = () => {
                    notify.error({ title: 'Attachment Error', message: 'Failed to read file' });
                    setIsReadingAttachment(false);
                  };
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />

              {/* Attachment Pill */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isReadingAttachment}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '16px',
                  border: '1px solid #e0e0e0',
                  background: newTaskAttachment ? '#eff6ff' : '#ffffff',
                  fontSize: '12px',
                  color: newTaskAttachment ? '#2563eb' : '#666666',
                  cursor: isReadingAttachment ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                  maxWidth: '180px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={newTaskAttachment ? `Attached: ${newTaskAttachment.file_name}` : 'Attach image or file'}
              >
                📎 {isReadingAttachment ? 'Loading...' : newTaskAttachment ? newTaskAttachment.file_name : 'Attachment'}
                {newTaskAttachment && (
                  <span
                    onClick={e => {
                      e.stopPropagation();
                      setNewTaskAttachment(null);
                    }}
                    style={{ marginLeft: '4px', color: '#94a3b8', fontWeight: 'bold' }}
                    title="Remove attachment"
                  >
                    ×
                  </span>
                )}
              </button>

              {/* Location Pill */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowTaskLocationPicker(!showTaskLocationPicker)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '16px',
                    border: '1px solid #e0e0e0',
                    background: newTaskLocation ? '#f0fdf4' : '#ffffff',
                    fontSize: '12px',
                    color: newTaskLocation ? '#16a34a' : '#666666',
                    cursor: 'pointer',
                    fontWeight: 500,
                    maxWidth: '180px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={newTaskLocation ? `Location: ${newTaskLocation} (${newTaskLocTrigger === 'on_leave' ? 'Leaving' : 'Arriving'})` : 'Set location'}
                >
                  📍 {newTaskLocation ? newTaskLocation : 'Location'}
                  {newTaskLocation && (
                    <span
                      onClick={e => {
                        e.stopPropagation();
                        setNewTaskLocation('');
                      }}
                      style={{ marginLeft: '4px', color: '#94a3b8', fontWeight: 'bold' }}
                      title="Clear location"
                    >
                      ×
                    </span>
                  )}
                </button>
                {showTaskLocationPicker && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      background: '#ffffff',
                      border: '1px solid #e0e0e0',
                      borderRadius: '8px',
                      padding: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 100,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      minWidth: '220px',
                    }}
                  >
                    <input
                      type="text"
                      placeholder="📍 Enter location (e.g. Office, Home)..."
                      value={newTaskLocation}
                      onChange={e => setNewTaskLocation(e.target.value)}
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setShowTaskLocationPicker(false);
                        }
                      }}
                      style={{ fontSize: '12px', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setNewTaskLocTrigger('on_enter')}
                        style={{
                          flex: 1,
                          padding: '4px 6px',
                          borderRadius: '4px',
                          border: '1px solid',
                          borderColor: newTaskLocTrigger === 'on_enter' ? '#16a34a' : '#e2e8f0',
                          background: newTaskLocTrigger === 'on_enter' ? '#f0fdf4' : '#f8fafc',
                          color: newTaskLocTrigger === 'on_enter' ? '#16a34a' : '#64748b',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: newTaskLocTrigger === 'on_enter' ? 600 : 400,
                        }}
                      >
                        🛬 Arriving
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewTaskLocTrigger('on_leave')}
                        style={{
                          flex: 1,
                          padding: '4px 6px',
                          borderRadius: '4px',
                          border: '1px solid',
                          borderColor: newTaskLocTrigger === 'on_leave' ? '#16a34a' : '#e2e8f0',
                          background: newTaskLocTrigger === 'on_leave' ? '#f0fdf4' : '#f8fafc',
                          color: newTaskLocTrigger === 'on_leave' ? '#16a34a' : '#64748b',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: newTaskLocTrigger === 'on_leave' ? 600 : 400,
                        }}
                      >
                        🛫 Leaving
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {['Home', 'Office', 'Supermarket', 'Gym', 'Airport'].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setNewTaskLocation(preset);
                            setShowTaskLocationPicker(false);
                          }}
                          style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            border: newTaskLocation === preset ? '1px solid #16a34a' : '1px solid #e0e0e0',
                            background: newTaskLocation === preset ? '#f0fdf4' : '#f8fafc',
                            color: newTaskLocation === preset ? '#16a34a' : '#64748b',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          📍 {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setShowAddTaskModal(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#f1f5f9',
                  color: '#475569',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { handleCreateTask().catch(console.error); }}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#de4c4a',
                  color: '#ffffff',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                title="Add task"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter, Search & Sort Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: '1px solid #eaeaea', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#666', fontWeight: 600 }}>Filter:</span>
            {(['today', 'upcoming', 'overdue', 'completed', 'habits', 'all'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setFilterTab(tab)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: filterTab === tab ? '#de4c4a' : 'transparent',
                  color: filterTab === tab ? '#ffffff' : 'var(--affine-text-secondary-color, #666)',
                  fontSize: '12px',
                  fontWeight: filterTab === tab ? 600 : 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  textTransform: 'capitalize',
                }}
              >
                {tab === 'habits' ? (
                  <>
                    <SFSymbolRepeat width={12} height={12} /> Habits & Streaks
                  </>
                ) : (
                  tab
                )}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Search Input */}
            <Input
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search tasks..."
              style={{ width: '160px', fontSize: '12px' }}
            />

            {/* Sort Selector */}
            <select
              value={sortType}
              onChange={e => setSortType(e.target.value as any)}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #e0e0e0',
                background: '#ffffff',
                fontSize: '12px',
              }}
            >
              <option value="due_date">Sort by Due Date</option>
              <option value="priority">Sort by Priority</option>
              <option value="alphabetical">Sort Alphabetically</option>
            </select>
          </div>
        </div>

        {/* Projects Bar */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: '#666', fontWeight: 600 }}>Project:</span>
          {/* All Projects button */}
          <button
            onClick={() => setSelectedProjectFilter('all')}
            style={{
              padding: '3px 8px',
              borderRadius: '4px',
              border: selectedProjectFilter === 'all' ? '1px solid #2563eb' : '1px solid #e0e0e0',
              background: selectedProjectFilter === 'all' ? '#2563eb18' : 'transparent',
              color: selectedProjectFilter === 'all' ? '#2563eb' : '#666',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            All Projects
          </button>

          {/* Persistent Inbox Feature button */}
          <button
            onClick={() => setSelectedProjectFilter('inbox')}
            style={{
              padding: '3px 8px',
              borderRadius: '4px',
              border: selectedProjectFilter === 'inbox' ? '1px solid #2563eb' : '1px solid #e0e0e0',
              background: selectedProjectFilter === 'inbox' ? '#2563eb18' : 'transparent',
              color: selectedProjectFilter === 'inbox' ? '#2563eb' : '#666',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <SFSymbolTray width={12} height={12} /> Inbox
          </button>

          {/* User Custom Projects */}
          {projects.filter(p => !p.is_inbox_project && p.name.toLowerCase() !== 'inbox').map(proj => (
            <div key={proj.id} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <button
                onClick={() => setSelectedProjectFilter(proj.id)}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: selectedProjectFilter === proj.id ? '1px solid #2563eb' : '1px solid #e0e0e0',
                  background: selectedProjectFilter === proj.id ? '#2563eb18' : 'transparent',
                  color: selectedProjectFilter === proj.id ? '#2563eb' : '#666',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                #{proj.name}
              </button>
              <span
                onClick={() => { handleDeleteProject(proj.id).catch(console.error); }}
                style={{ cursor: 'pointer', fontSize: '11px', color: '#a3a3a3', padding: '0 2px' }}
                title="Delete Project"
              >
                ×
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Task List / Habit Tracker Rendering */}
      {filterTab === 'habits' ? (
        <HabitTracker
          habits={tasks.filter(t =>
            t.is_habit ||
            t.is_recurring ||
            t.due?.is_recurring ||
            t.labels?.some(l => l.toLowerCase().includes('daily routine') || l.toLowerCase().includes('habit'))
          )}
          onHabitUpdate={() => {
            loadData().catch(console.error);
          }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Overdue Section Header & List */}
          {overdueTasks.length > 0 && filterTab !== 'upcoming' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#de4c4a' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>Overdue ({overdueTasks.length})</span>
              </div>
              {overdueTasks.map(renderTaskRow)}
            </div>
          )}

          {/* Main Task List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {loading && tasks.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: '#888' }}>
                Loading tasks from Todoist...
              </div>
            ) : regularTasks.length === 0 && overdueTasks.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', fontSize: '14px', color: '#888' }}>
                🎉 All clear! No tasks for this view.
              </div>
            ) : (
              <DraggableTaskList
                tasks={regularTasks}
                projects={projects}
                onTaskUpdate={() => {
                  loadData().catch(console.error);
                }}
                onDeleteTask={handleDeleteTask}
                onToggleTask={handleToggleTask}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

