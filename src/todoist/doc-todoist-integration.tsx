import './task-card.css';

import { notify } from '@affine/component';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { useService } from '@toeverything/infra';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

import { TaskCard } from './task-card';
import { type TodoistProject, TodoistService, type TodoistTask } from './todoist-service';

const SECTION_HIDDEN_KEY = 'affine:todoist-doc-section-hidden';

interface DocTodoistIntegrationProps {
  docId: string;
  docTitle?: string;
}

export const DocTodoistIntegration: React.FC<DocTodoistIntegrationProps> = ({
  docId,
  docTitle: propDocTitle,
}) => {
  const docDisplayMetaService = useService(DocDisplayMetaService);
  const resolvedDocTitle = propDocTitle || docDisplayMetaService.title$(docId).value || 'Current Document';

  const [allTasks, setAllTasks] = useState<TodoistTask[]>(() => TodoistService.getLocalTasks());
  const [projects, setProjects] = useState<TodoistProject[]>(() => TodoistService.getLocalProjects());

  // Track whether the linked-tasks section is hidden (persisted to localStorage)
  const [isSectionHidden, setIsSectionHidden] = useState<boolean>(
    () => localStorage.getItem(SECTION_HIDDEN_KEY) === 'true'
  );

  const toggleSectionHidden = useCallback(() => {
    setIsSectionHidden(prev => {
      const next = !prev;
      localStorage.setItem(SECTION_HIDDEN_KEY, String(next));
      return next;
    });
  }, []);

  // Tasks linked to this specific doc (from any source: toolbar, todo page, Todoist, etc.)
  const docTasks = useMemo(
    () =>
      allTasks.filter(task => {
        if (task.linked_doc?.docId === docId) return true;
        if (task.affine_doc_link && task.affine_doc_link.includes(docId)) return true;
        return false;
      }),
    [allTasks, docId]
  );



  const reloadData = useCallback(async () => {
    const local = TodoistService.getLocalTasks();
    setAllTasks(local);
    setProjects(TodoistService.getLocalProjects());

    const token = TodoistService.getToken();
    if (token) {
      try {
        const [freshProjects, freshTasks] = await Promise.all([
          TodoistService.getProjects(),
          TodoistService.getTasks(),
        ]);
        setProjects(freshProjects);
        setAllTasks(freshTasks);
      } catch (e) {
        console.error('[DocTodoistIntegration] Failed to fetch remote tasks:', e);
      }
    }
  }, []);

  const handleReloadData = useCallback(() => {
    reloadData().catch(console.error);
  }, [reloadData]);

  useEffect(() => {
    handleReloadData();

    const handleUpdate = () => {
      handleReloadData();
    };
    window.addEventListener('affine:todoist-token-updated', handleUpdate);
    window.addEventListener('focus', handleUpdate);

    return () => {
      window.removeEventListener('affine:todoist-token-updated', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
    };
  }, [handleReloadData]);

  // Create Task Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [taskContent, setTaskContent] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskPriority, setTaskPriority] = useState<number>(4);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [taskLabels, setTaskLabels] = useState<string[]>([]);
  const [taskLocation, setTaskLocation] = useState('');
  const [taskLocTrigger] = useState<'on_enter' | 'on_leave'>('on_enter');
  const [taskAttachment, setTaskAttachment] = useState<{
    file_name: string;
    file_url: string;
    file_type?: string;
  } | null>(null);
  const [isReadingAttachment, setIsReadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Picker Modal State
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  const [showDuePicker, setShowDuePicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Map of blockId -> { container: HTMLElement } for inline task card portals
  const [inlinePortals, setInlinePortals] = useState<Map<string, { taskId: string; container: HTMLElement }>>(
    () => new Map()
  );

  // Insert a marker paragraph block at the cursor position in the BlockSuite editor
  const insertTaskBlockAtCursor = useCallback((taskId: string) => {
    try {
      const ctx = (window as any).__todoistEditorCtx as
        | { store: any; anchorBlockId?: string }
        | undefined;
      if (!ctx?.store) return;

      const { store, anchorBlockId } = ctx;

      // Find the note (parent container)
      const root = store.root;
      if (!root) return;

      // Find the affine:note block (first one)
      const note = root.children?.find((c: any) => c.flavour === 'affine:note');
      if (!note) return;

      let insertIndex: number | undefined;
      if (anchorBlockId) {
        const idx = note.children?.findIndex((c: any) => c.id === anchorBlockId);
        if (idx !== undefined && idx !== -1) {
          insertIndex = idx + 1;
        }
      }

      // Insert paragraph block — text will be set after creation
      const newBlockId = store.addBlock(
        'affine:paragraph',
        {},
        note,
        insertIndex
      );

      // Set the marker text via the model's text field
      if (newBlockId) {
        try {
          const model = store.getModelById(newBlockId);
          if (model?.text) {
            model.text.insert(`[todoist:${taskId}]`, 0);
          }
        } catch (textErr) {
          console.warn('[DocTodoistIntegration] Could not set block text:', textErr);
        }
      }
    } catch (err) {
      console.warn('[DocTodoistIntegration] Could not insert task block at cursor:', err);
    }
  }, []);

  // Listen to toolbar custom events
  useEffect(() => {
    const handleOpenCreate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.initialTitle) {
        setTaskContent(detail.initialTitle);
      } else {
        setTaskContent('');
      }
      setTaskDescription('');
      setTaskDue('');
      setTaskPriority(4);
      setTaskLabels([]);
      setTaskLocation('');
      setTaskAttachment(null);
      setShowCreateModal(true);
    };

    const handleOpenPicker = () => {
      setPickerSearch('');
      setShowPickerModal(true);
    };

    window.addEventListener('affine:todoist-open-create-modal', handleOpenCreate);
    window.addEventListener('affine:todoist-open-picker-modal', handleOpenPicker);

    return () => {
      window.removeEventListener('affine:todoist-open-create-modal', handleOpenCreate);
      window.removeEventListener('affine:todoist-open-picker-modal', handleOpenPicker);
    };
  }, []);

  // MutationObserver: watch the editor DOM for [todoist:TASK_ID] marker paragraphs
  // and inject inline task card portals in their place
  useEffect(() => {
    const MARKER_RE = /^\[todoist:([^\]]+)\]$/;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scanAndMount = () => {
      // Find the editor root
      const editorEl =
        document.querySelector('.affine-page-viewport') ||
        document.querySelector('affine-page-root') ||
        document.querySelector('.affine-editor-container');
      if (!editorEl) return;

      const richTexts = editorEl.querySelectorAll('rich-text, .virgo-editor, [data-virgo-text="true"]');
      const newPortals = new Map<string, { taskId: string; container: HTMLElement }>();

      richTexts.forEach(el => {
        const text = el.textContent?.trim() ?? '';
        const match = MARKER_RE.exec(text);
        if (!match) return;

        const taskId = match[1];
        // Find the block container (typically the parent affine-paragraph element)
        const blockEl = el.closest('[data-block-id], affine-paragraph') as HTMLElement | null;
        if (!blockEl) return;

        const blockId = blockEl.dataset.blockId || blockEl.id || taskId;

        // Create a container for the portal if not already mounted
        let container = blockEl.querySelector('.todoist-inline-card-portal') as HTMLElement | null;
        if (!container) {
          container = document.createElement('div');
          container.className = 'todoist-inline-card-portal';
          container.style.cssText = 'display:block;position:relative;width:100%;margin:4px 0;';

          // Hide the raw marker text in the rich text editor
          const richTextEl = blockEl.querySelector('rich-text, .virgo-editor') as HTMLElement | null;
          if (richTextEl) {
            richTextEl.style.display = 'none';
          }

          blockEl.append(container);
        }

        newPortals.set(blockId, { taskId, container });
      });

      setInlinePortals(newPortals);
    };

    const debouncedScan = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(scanAndMount, 150);
    };

    // Initial scan after short delay to allow editor to render
    const initTimer = setTimeout(scanAndMount, 600);

    const observer = new MutationObserver(debouncedScan);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(initTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      observer.disconnect();
    };
  }, [allTasks]);

  const handleCreateTask = async () => {
    const content = taskContent.trim();
    if (!content) return;

    setIsSubmitting(true);
    try {
      const created = await TodoistService.createTask({
        content,
        description: taskDescription.trim() || undefined,
        due_string: taskDue.trim() || undefined,
        priority: taskPriority,
        project_id: selectedProjectId || undefined,
        labels: taskLabels.length > 0 ? taskLabels : undefined,
        location: taskLocation.trim() || undefined,
        loc_trigger: taskLocation.trim() ? taskLocTrigger : undefined,
        attachment: taskAttachment || undefined,
        linked_doc: {
          docId,
          docTitle: resolvedDocTitle,
          mode: 'page',
        },
      });

      setAllTasks(prev => [created, ...prev]);
      // Insert a placeholder block at cursor position in the editor body
      insertTaskBlockAtCursor(created.id);
      setShowCreateModal(false);
      notify.success({
        title: 'Task Created',
        message: `Task "${content}" attached to this document.`,
      });
    } catch (err: any) {
      console.error('[DocTodoistIntegration] Create error:', err);
      notify.error({
        title: 'Failed to create task',
        message: err?.message || 'Check your Todoist connection.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAttachExistingTask = async (task: TodoistTask) => {
    try {
      const updated = await TodoistService.updateTask(task.id, {
        linked_doc: {
          docId,
          docTitle: resolvedDocTitle,
          mode: 'page',
        },
      });

      if (updated) {
        setAllTasks(prev => prev.map(t => (t.id === task.id ? updated : t)));
      }

      // Add doc link comment to Todoist so two-way link is in cloud
      const token = TodoistService.getToken();
      if (token && !task.id.startsWith('local-')) {
        const docLink = `${window.location.origin}/workspace/all/${docId}`;
        await TodoistService.addAttachment(task.id, {
          file_url: docLink,
          file_name: resolvedDocTitle,
          content: `📄 **AFFiNE Doc**: ${resolvedDocTitle}\n${docLink}`,
        }).catch(() => null);
      }

      // Insert a placeholder block at cursor position in the editor body
      insertTaskBlockAtCursor(task.id);
      setShowPickerModal(false);
      notify.success({
        title: 'Task Attached',
        message: `Task "${task.content}" linked to this document.`,
      });
    } catch (err: any) {
      console.error('[DocTodoistIntegration] Attach error:', err);
      notify.error({
        title: 'Failed to attach task',
        message: err?.message || 'Could not link task.',
      });
    }
  };

  const handleDetachTask = async (taskId: string) => {
    try {
      const updated = await TodoistService.updateTask(taskId, {
        linked_doc: undefined,
      });
      if (updated) {
        setAllTasks(prev => prev.map(t => (t.id === taskId ? updated : t)));
      }
      notify.success({ title: 'Task Detached from Document' });
    } catch (err: any) {
      notify.error({ title: 'Failed to detach task', message: err?.message });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await TodoistService.deleteTask(taskId);
      setAllTasks(prev => prev.filter(t => t.id !== taskId));
      notify.success({ title: 'Task Deleted' });
    } catch (err: any) {
      notify.error({ title: 'Failed to delete task', message: err?.message });
    }
  };

  const handleToggleTask = async (task: TodoistTask) => {
    try {
      if (task.is_completed) {
        await TodoistService.reopenTask(task.id);
        setAllTasks(prev => prev.map(t => (t.id === task.id ? { ...t, is_completed: false } : t)));
      } else {
        await TodoistService.closeTask(task.id);
        setAllTasks(prev => prev.map(t => (t.id === task.id ? { ...t, is_completed: true } : t)));
      }
    } catch (err: any) {
      notify.error({ title: 'Failed to update task status', message: err?.message });
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <>
      {/* Inline task card portals — rendered directly inside BlockSuite editor blocks */}
      {Array.from(inlinePortals.entries()).map(([blockId, { taskId, container }]) => {
        const task = allTasks.find(t => t.id === taskId);
        if (!task) return null;
        return ReactDOM.createPortal(
          <div
            key={blockId}
            className="todoist-inline-block"
            style={{ padding: '4px 0', width: '100%' }}
          >
            <TaskCard
              task={task}
              projects={projects}
              onTaskUpdate={handleReloadData}
              onDeleteTask={handleDeleteTask}
              onToggleTask={handleToggleTask}
            />
          </div>,
          container
        );
      })}

      {/* ─── Attached Tasks Section (all tasks linked to this doc from any source) ─── */}
      {docTasks.length > 0 && (
        <div
          className="affine-doc-todoist-container"
          style={{
            margin: '16px auto',
            maxWidth: '800px',
            width: '100%',
            padding: '0 24px',
            boxSizing: 'border-box',
          }}
        >
          {/* Section header with collapse + add button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '8px',
              borderBottom: '1px solid var(--affine-border-color, #f1f5f9)',
              marginBottom: isSectionHidden ? 0 : '10px',
              cursor: 'default',
            }}
          >
            {/* Left: collapse toggle + label */}
            <button
              type="button"
              onClick={toggleSectionHidden}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: 'none',
                padding: '2px 4px',
                cursor: 'pointer',
                borderRadius: '4px',
                color: 'var(--affine-text-secondary-color, #475569)',
              }}
              title={isSectionHidden ? 'Show attached tasks' : 'Hide attached tasks'}
            >
              <span style={{ fontSize: '13px', lineHeight: 1 }}>
                {isSectionHidden ? '▶' : '▼'}
              </span>
              <span style={{ fontSize: '13px' }}>📋</span>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>
                Todoist Tasks ({docTasks.length})
              </span>
            </button>

            {/* Right: add task + hide label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {!isSectionHidden && (
                <button
                  type="button"
                  onClick={() => {
                    setTaskContent('');
                    setTaskDescription('');
                    setShowCreateModal(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'transparent',
                    border: '1px dashed var(--affine-border-color, #cbd5e1)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '12px',
                    color: 'var(--affine-text-secondary-color, #64748b)',
                    cursor: 'pointer',
                  }}
                >
                  ➕ Add Task
                </button>
              )}
              <button
                type="button"
                onClick={toggleSectionHidden}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '11px',
                  color: 'var(--affine-text-secondary-color, #94a3b8)',
                  cursor: 'pointer',
                  padding: '3px 6px',
                  borderRadius: '4px',
                }}
              >
                {isSectionHidden ? 'Show' : 'Hide'}
              </button>
            </div>
          </div>

          {/* Task list — hidden when collapsed */}
          {!isSectionHidden && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {docTasks.map(task => (
                <div key={task.id} style={{ position: 'relative' }}>
                  <TaskCard
                    task={task}
                    projects={projects}
                    onTaskUpdate={handleReloadData}
                    onDeleteTask={handleDeleteTask}
                    onToggleTask={handleToggleTask}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CREATE NEW TASK MODAL */}
      {showCreateModal && (

        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '560px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              position: 'relative',
              boxSizing: 'border-box',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header info */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📝</span>
                <span style={{ fontWeight: 600, fontSize: '15px', color: '#1e293b' }}>
                  Create Task for &quot;{resolvedDocTitle}&quot;
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            {/* Inputs */}
            <input
              type="text"
              placeholder="Task name or what needs to be done..."
              value={taskContent}
              onChange={e => setTaskContent(e.target.value)}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleCreateTask().catch(console.error);
                }
              }}
              style={{
                fontSize: '14px',
                fontWeight: 600,
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '10px 12px',
                outline: 'none',
              }}
            />

            <textarea
              placeholder="Description, notes or details..."
              value={taskDescription}
              onChange={e => setTaskDescription(e.target.value)}
              rows={3}
              style={{
                fontSize: '13px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px 12px',
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />

            {/* Attachment preview / Location tag */}
            {(taskAttachment || taskLocation) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {taskAttachment && (
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
                    <span>📎</span>
                    <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {taskAttachment.file_name}
                    </span>
                    <span
                      onClick={() => setTaskAttachment(null)}
                      style={{ cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      ×
                    </span>
                  </div>
                )}

                {taskLocation && (
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
                      {taskLocation} ({taskLocTrigger === 'on_leave' ? 'Leaving' : 'Arriving'})
                    </span>
                    <span
                      onClick={() => setTaskLocation('')}
                      style={{ cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      ×
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Toolbar Pills */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', paddingTop: '4px' }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Due Date Pill */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setShowDuePicker(!showDuePicker)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '16px',
                      border: '1px solid #e0e0e0',
                      background: '#ffffff',
                      fontSize: '12px',
                      color: taskDue ? '#22c55e' : '#666666',
                      cursor: 'pointer',
                    }}
                  >
                    📅 {taskDue ? taskDue.split('T')[0] : 'Today'}
                  </button>
                  {showDuePicker && (
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
                        value={taskDue.includes('T') ? taskDue.split('T')[0] : taskDue}
                        min={todayStr}
                        onChange={e => {
                          setTaskDue(e.target.value);
                          setShowDuePicker(false);
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
                    onClick={() => setShowPriorityPicker(!showPriorityPicker)}
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
                    }}
                  >
                    🏳 P{5 - taskPriority}
                  </button>
                  {showPriorityPicker && (
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
                          type="button"
                          onClick={() => {
                            setTaskPriority(p);
                            setShowPriorityPicker(false);
                          }}
                          style={{
                            padding: '6px 10px',
                            border: 'none',
                            background: taskPriority === p ? `${color}18` : 'transparent',
                            color,
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
                    onClick={() => setShowProjectPicker(!showProjectPicker)}
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
                    }}
                  >
                    📥 {selectedProjectId ? projects.find(p => p.id === selectedProjectId)?.name || 'Inbox' : 'Inbox'}
                  </button>
                  {showProjectPicker && (
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
                        type="button"
                        onClick={() => {
                          setSelectedProjectId('');
                          setShowProjectPicker(false);
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
                            type="button"
                            onClick={() => {
                              setSelectedProjectId(proj.id);
                              setShowProjectPicker(false);
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

                {/* Attachment Button */}
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
                      setTaskAttachment({
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
                    background: taskAttachment ? '#eff6ff' : '#ffffff',
                    fontSize: '12px',
                    color: taskAttachment ? '#2563eb' : '#666666',
                    cursor: isReadingAttachment ? 'not-allowed' : 'pointer',
                  }}
                >
                  📎 {isReadingAttachment ? 'Loading...' : taskAttachment ? '1 File' : 'Attachment'}
                </button>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#f1f5f9',
                    color: '#475569',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { handleCreateTask().catch(console.error); }}
                  disabled={isSubmitting || !taskContent.trim()}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#de4c4a',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: isSubmitting || !taskContent.trim() ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting || !taskContent.trim() ? 0.6 : 1,
                  }}
                >
                  {isSubmitting ? 'Adding...' : 'Add Task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PICK FROM EXISTING TASKS MODAL */}
      {showPickerModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowPickerModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '540px',
              maxHeight: '80vh',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              position: 'relative',
              boxSizing: 'border-box',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📋</span>
                <span style={{ fontWeight: 600, fontSize: '15px', color: '#1e293b' }}>
                  Link Existing Task to &quot;{resolvedDocTitle}&quot;
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPickerModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            <input
              type="text"
              placeholder="🔍 Search existing tasks by title, description or label..."
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              autoFocus
              style={{
                fontSize: '13px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px 12px',
                outline: 'none',
              }}
            />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                overflowY: 'auto',
                maxHeight: '380px',
                paddingRight: '4px',
              }}
            >
              {(() => {
                const q = pickerSearch.toLowerCase().trim();
                const filtered = allTasks.filter(t => {
                  if (t.is_completed) return false;
                  if (!q) return true;
                  return (
                    t.content.toLowerCase().includes(q) ||
                    t.description?.toLowerCase().includes(q) ||
                    t.labels?.some(l => l.toLowerCase().includes(q))
                  );
                });

                if (filtered.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '13px' }}>
                      No matching tasks found.
                    </div>
                  );
                }

                return filtered.map(task => {
                  const isAlreadyLinked =
                    task.linked_doc?.docId === docId ||
                    (task.affine_doc_link && task.affine_doc_link.includes(docId));

                  return (
                    <div
                      key={task.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        background: isAlreadyLinked ? '#f8fafc' : '#ffffff',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, marginRight: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>
                            {task.content}
                          </span>
                          {task.priority === 4 && <span style={{ fontSize: '11px', color: '#de4c4a', fontWeight: 600 }}>P1</span>}
                          {task.priority === 3 && <span style={{ fontSize: '11px', color: '#f97316', fontWeight: 600 }}>P2</span>}
                        </div>
                        {task.description && (
                          <span style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {task.description}
                          </span>
                        )}
                        {task.linked_doc?.docTitle && (
                          <span style={{ fontSize: '10px', color: '#3b82f6' }}>
                            Linked to: {task.linked_doc.docTitle}
                          </span>
                        )}
                      </div>

                      {isAlreadyLinked ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>
                            ✓ Linked
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              handleDetachTask(task.id).catch(console.error);
                            }}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              color: '#64748b',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            Detach
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            handleAttachExistingTask(task).catch(console.error);
                          }}
                          style={{
                            padding: '4px 12px',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#2563eb',
                            color: '#ffffff',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Attach to Doc
                        </button>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
};