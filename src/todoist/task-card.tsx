import {
  SFSymbolCalendar,
  SFSymbolChatBubble,
  SFSymbolDocCheckmark,
  SFSymbolFlag,
  SFSymbolFlame,
  SFSymbolLocationPin,
  SFSymbolPaperclip,
  SFSymbolPencil,
  SFSymbolRepeat,
  SFSymbolTag,
} from '@affine/core/components/pure/icons';
import React, { useEffect,useRef, useState } from 'react';

import { type TodoistProject, TodoistService, type TodoistTask } from './todoist-service';

interface TaskCardProps {
  task: TodoistTask;
  projects: TodoistProject[];
  onTaskUpdate: () => void;
  onDeleteTask: (taskId: string) => Promise<void>;
  onToggleTask: (task: TodoistTask) => Promise<void>;
  onSelectLabel?: (label: string) => void;
}

const PRIORITY_CONFIG = {
  4: { label: 'P1', color: '#de4c4a', bg: '#ffebee', icon: '🔥' },
  3: { label: 'P2', color: '#f97316', bg: '#fff3e0', icon: '⬆️' },
  2: { label: 'P3', color: '#2563eb', bg: '#e3f2fd', icon: '➡️' },
  1: { label: 'P4', color: '#808080', bg: '#f5f5f5', icon: '⬇️' },
} as const;

const TaskCardComponent: React.FC<TaskCardProps> = ({
  task,
  projects,
  onTaskUpdate,
  onDeleteTask,
  onToggleTask,
  onSelectLabel,
}) => {
  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(task.content);
  const [editDescription, setEditDescription] = useState(task.description || '');
  const [editDueDate, setEditDueDate] = useState(task.due?.date || '');
  const [editDueTime, setEditDueTime] = useState(task.due?.datetime ? task.due.datetime.slice(11, 16) : '');
  const [editPriority, setEditPriority] = useState<number>(task.priority);
  const [editProjectId, setEditProjectId] = useState<string>(task.project_id || '');
  const [editLabels, setEditLabels] = useState<string[]>(task.labels || []);
  const [editDocId, setEditDocId] = useState<string>(task.linked_doc?.docId || '');
  const [editDocTitle, setEditDocTitle] = useState<string>(task.linked_doc?.docTitle || '');

  // Recurring state
  const [isRecurring, setIsRecurring] = useState(task.is_recurring || false);
  const [recurringPattern, setRecurringPattern] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>(
    task.recurring_pattern || 'daily'
  );
  const [recurringDays, setRecurringDays] = useState<number[]>(task.recurring_days || []);
  const [recurringMonthDay, setRecurringMonthDay] = useState<number>(task.recurring_month_day || 1);
  const [recurringUntil, setRecurringUntil] = useState<string>(task.recurring_until || '');
  const [showRecurringModal, setShowRecurringModal] = useState(false);

  // UI Popups & Modals
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ file_name: string; file_url: string; file_type?: string } | null>(null);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const priorityPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
      if (priorityPickerRef.current && !priorityPickerRef.current.contains(event.target as Node)) {
        setShowPriorityPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadComments = async () => {
    setIsLoadingComments(true);
    try {
      const response = await TodoistService.getTaskComments(task.id);
      if (response.success) {
        setComments(response.data);
      }
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const handleToggleComplete = async () => {
    await onToggleTask(task);
  };

  const handleDelete = async () => {
    try {
      await onDeleteTask(task.id);
      setShowDeleteConfirm(false);
      setShowMenu(false);
    } catch (err) {
      console.error('Failed to delete task:', err);
      setError('Failed to delete task');
    }
  };

  const handleUpdate = async () => {
    if (!editContent.trim()) {
      setError('Task content is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const updateData: any = {
        content: editContent.trim(),
        description: editDescription.trim() || undefined,
        priority: editPriority,
        project_id: editProjectId || undefined,
        labels: editLabels,
        linked_doc: editDocId.trim()
          ? {
              docId: editDocId.trim(),
              docTitle: editDocTitle.trim() || 'Linked Page',
              mode: 'page',
            }
          : undefined,
      };

      if (editDueDate) {
        if (editDueTime) {
          updateData.due_datetime = `${editDueDate}T${editDueTime}:00`;
        } else {
          updateData.due_date = editDueDate;
        }
      }

      const updatedTask = await TodoistService.updateTask(task.id, updateData);
      if (updatedTask) {
        onTaskUpdate();
        setIsEditing(false);
      } else {
        setError('Failed to update task');
      }
    } catch (err) {
      console.error('Failed to update task:', err);
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePriority = async (priority: number) => {
    try {
      await TodoistService.updateTask(task.id, { priority });
      onTaskUpdate();
    } catch (err) {
      console.error('Failed to update priority:', err);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAttachment(true);
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({
        file_name: file.name,
        file_url: reader.result as string,
        file_type: file.type || 'application/octet-stream',
      });
      setIsUploadingAttachment(false);
    };
    reader.onerror = () => {
      setError('Failed to read attached file');
      setIsUploadingAttachment(false);
    };
    reader.readAsDataURL(file);
    // Reset file input so same file can be selected again if desired
    e.target.value = '';
  };

  const handleAddComment = async () => {
    if (!newComment.trim() && !attachedFile) return;

    try {
      const commentText = newComment.trim() || (attachedFile ? `📎 ${attachedFile.file_name}` : '');
      const response = await TodoistService.addComment(task.id, commentText, attachedFile || undefined);
      if (response.success) {
        setComments(prev => [...prev, response.data]);
        setNewComment('');
        setAttachedFile(null);
        onTaskUpdate();
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
      setError('Failed to add comment');
    }
  };

  const getProjectName = (projectId?: string) => {
    if (!projectId) return 'Inbox';
    const project = projects.find(p => p.id === projectId);
    return project?.name || 'Inbox';
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
      });
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const isOverdue = !task.is_completed && task.due?.date && task.due.date < todayStr;
  const priority = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG[1];
  const dueDisplay = task.due?.string || formatDate(task.due?.date);
  const projectName = getProjectName(task.project_id);

  // Edit Mode Render
  if (isEditing) {
    return (
      <div className="task-card edit-mode">
        <div className="task-card-edit">
          <div className="edit-header">
            <h4>Edit Task</h4>
            <button className="close-edit" onClick={() => setIsEditing(false)}>
              ✕
            </button>
          </div>

          {error && <div className="edit-error">{error}</div>}

          <div className="edit-field">
            <label>Task *</label>
            <input
              type="text"
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              placeholder="What needs to be done?"
            />
          </div>

          <div className="edit-field">
            <label>Description</label>
            <textarea
              value={editDescription}
              onChange={e => setEditDescription(e.target.value)}
              placeholder="Add details..."
              rows={3}
            />
          </div>

          <div className="edit-field-row">
            <div className="edit-field">
              <label>Due Date</label>
              <input
                type="date"
                value={editDueDate}
                onChange={e => setEditDueDate(e.target.value)}
              />
            </div>
            <div className="edit-field">
              <label>Time</label>
              <input
                type="time"
                value={editDueTime}
                onChange={e => setEditDueTime(e.target.value)}
                step="300"
              />
            </div>
          </div>

          <div className="edit-field">
            <label>Priority</label>
            <div className="priority-select">
              {[4, 3, 2, 1].map(p => (
                <button
                  key={p}
                  className={`priority-option ${editPriority === p ? 'selected' : ''}`}
                  onClick={() => setEditPriority(p)}
                  style={{
                    background: editPriority === p ? PRIORITY_CONFIG[p as keyof typeof PRIORITY_CONFIG].bg : 'transparent',
                    borderColor: editPriority === p ? PRIORITY_CONFIG[p as keyof typeof PRIORITY_CONFIG].color : '#ddd',
                    color: editPriority === p ? PRIORITY_CONFIG[p as keyof typeof PRIORITY_CONFIG].color : '#666',
                  }}
                >
                  {PRIORITY_CONFIG[p as keyof typeof PRIORITY_CONFIG].label}
                </button>
              ))}
            </div>
          </div>

          <div className="edit-field">
            <label>Project</label>
            <select
              value={editProjectId}
              onChange={e => setEditProjectId(e.target.value)}
            >
              <option value="">📥 Inbox</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  #{p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="edit-field">
            <label>Labels (comma separated)</label>
            <input
              type="text"
              value={editLabels.join(', ')}
              onChange={e =>
                setEditLabels(
                  e.target.value
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean)
                )
              }
              placeholder="e.g. Daily routine, Work, Meeting"
            />
          </div>

          <div className="edit-field-row">
            <div className="edit-field">
              <label>Linked Doc / Canvas ID</label>
              <input
                type="text"
                value={editDocId}
                onChange={e => setEditDocId(e.target.value)}
                placeholder="e.g. doc-12345"
              />
            </div>
            <div className="edit-field">
              <label>Doc Title</label>
              <input
                type="text"
                value={editDocTitle}
                onChange={e => setEditDocTitle(e.target.value)}
                placeholder="Page Title"
              />
            </div>
          </div>

          <div className="edit-actions">
            <button className="save-btn" onClick={() => { handleUpdate().catch(console.error); }} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : '💾 Save Changes'}
            </button>
            <button className="cancel-btn" onClick={() => setIsEditing(false)} disabled={isSubmitting}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Delete Confirm Modal Render
  if (showDeleteConfirm) {
    return (
      <div className="task-card delete-confirm">
        <div className="delete-modal">
          <span className="delete-icon">🗑️</span>
          <h4>Delete Task?</h4>
          <p>
            This will permanently delete <strong>&quot;{task.content}&quot;</strong>.
          </p>
          <div className="delete-actions">
            <button className="confirm-delete" onClick={() => { handleDelete().catch(console.error); }}>
              Delete
            </button>
            <button className="cancel-delete" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Normal Card View Render
  return (
    <div className={`task-card ${task.is_completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}`}>
      {/* Left Checkbox & Main Content */}
      <div className="task-card-main">
        <div className="task-checkbox-wrapper">
          <button
            onClick={() => { handleToggleComplete().catch(console.error); }}
            className="task-checkbox-btn"
            style={{
              borderColor: priority.color,
              background: task.is_completed ? priority.color : 'transparent',
            }}
          >
            {task.is_completed && <span className="task-check-icon">✓</span>}
          </button>
        </div>

        <div className="task-content-wrapper">
          <div className="task-header">
            <span className="task-title">
              {task.is_completed ? <s>{task.content}</s> : task.content}
            </span>

            {!task.is_completed && (
              <span className="priority-badge" style={{ background: priority.bg, color: priority.color }}>
                {priority.icon} {priority.label}
              </span>
            )}
          </div>

          {task.description && <div className="task-description-preview">{task.description}</div>}

          <div className="task-meta">
            <span className="meta-item project-tag">
              <span className="project-dot" style={{ background: '#2563eb' }} />
              {projectName}
            </span>

            {dueDisplay && (
              <span className={`meta-item due-tag ${isOverdue ? 'overdue' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <SFSymbolCalendar width={12} height={12} /> {dueDisplay}
              </span>
            )}

            {isRecurring && (
              <span className="meta-item recurring-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <SFSymbolRepeat width={12} height={12} /> {recurringPattern === 'weekly' ? 'Weekly' : recurringPattern === 'monthly' ? 'Monthly' : recurringPattern === 'yearly' ? 'Yearly' : 'Every day'}
              </span>
            )}

            {task.is_habit && (
              <span className="meta-item habit-streak-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} title={`Habit Streak: ${task.habit_streak || 0} days`}>
                <SFSymbolFlame width={12} height={12} /> <strong>Current streak:</strong> {task.habit_streak || 0} days
              </span>
            )}

            {task.linked_doc && (
              <span
                className="meta-item linked-doc-tag"
                onClick={e => {
                  e.stopPropagation();
                  if (task.linked_doc?.docId) {
                    window.dispatchEvent(
                      new CustomEvent('affine:navigate-doc', {
                        detail: { docId: task.linked_doc.docId, blockId: task.linked_doc.blockId },
                      })
                    );
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#eff6ff',
                  color: '#2563eb',
                  border: '1px solid #bfdbfe',
                  borderRadius: '4px',
                  padding: '1px 6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title={`Open linked document: ${task.linked_doc.docTitle || task.linked_doc.docId}`}
              >
                <SFSymbolDocCheckmark width={12} height={12} /> {task.linked_doc.docTitle || task.linked_doc.docId}
              </span>
            )}

            {task.labels && task.labels.length > 0 && (
              <span className="meta-item labels-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <SFSymbolTag width={12} height={12} />
                {task.labels.map(l => (
                  <button
                    key={l}
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      if (onSelectLabel) onSelectLabel(l);
                    }}
                    style={{
                      background: '#2563eb18',
                      color: '#2563eb',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '1px 6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    title={`Filter by label: ${l}`}
                  >
                    @{l}
                  </button>
                ))}
              </span>
            )}

            {task.location && (
              <span
                className="meta-item location-tag"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#f0fdf4',
                  color: '#16a34a',
                  border: '1px solid #bbf7d0',
                  borderRadius: '4px',
                  padding: '1px 6px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
                title={`Location reminder: ${task.location} (${task.loc_trigger === 'on_leave' ? 'Leaving' : 'Arriving'})`}
              >
                <SFSymbolLocationPin width={12} height={12} /> {task.location}
              </span>
            )}

            {(() => {
              const count =
                comments.length > 0
                  ? comments.length
                  : task.comment_count ??
                    task.comments_count ??
                    (task.comments ? task.comments.length : 0);

              return (
                <span
                  className="meta-item comments-tag"
                  onClick={() => {
                    const nextState = !showComments;
                    setShowComments(nextState);
                    if (nextState) loadComments().catch(console.error);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    fontWeight: count > 0 ? 600 : 400,
                    color: count > 0 ? '#2563eb' : 'inherit',
                  }}
                  title="View comments"
                >
                  <SFSymbolChatBubble width={12} height={12} /> {count > 0 ? `${count} comment${count > 1 ? 's' : ''}` : 'Comments'}
                  {(task.has_attachments || task.attachments?.length) ? <SFSymbolPaperclip width={11} height={11} /> : ''}
                </span>
              );
            })()}
          </div>

          {showComments && (
            <div className="task-comments">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h5 style={{ margin: 0 }}>
                  Comments ({comments.length > 0 ? comments.length : (task.comment_count ?? task.comments_count ?? 0)})
                </h5>
                <button
                  type="button"
                  onClick={() => { loadComments().catch(console.error); }}
                  disabled={isLoadingComments}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '11px',
                    color: '#2563eb',
                    cursor: 'pointer',
                    padding: '2px 4px',
                  }}
                  title="Refresh comments"
                >
                  {isLoadingComments ? 'Refreshing...' : '🔄 Refresh'}
                </button>
              </div>

              {isLoadingComments ? (
                <div className="loading-comments">Loading...</div>
              ) : (
                <>
                  {comments.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#999', margin: '6px 0' }}>No comments yet</div>
                  ) : (
                    comments.map(comment => {
                      const attachment = comment.attachment || comment.file_attachment;
                      const fileType = (attachment?.file_type || '').toLowerCase();
                      const fileUrl = attachment?.file_url || '';
                      const fileName = attachment?.file_name || 'Attachment';
                      const isAffineDoc =
                        Boolean(attachment?.is_affine_doc) ||
                        fileUrl.includes('localhost:8080') ||
                        fileUrl.includes('/workspace/') ||
                        fileUrl.includes('affine') ||
                        comment.content?.includes('AFFiNE Doc');

                      const isImage =
                        fileType.startsWith('image/') ||
                        /\.(png|jpe?g|gif|webp|svg|bmp)(\?.*)?$/i.test(fileUrl);
                      const isAudio =
                        fileType.startsWith('audio/') ||
                        /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(fileUrl);
                      const isVideo =
                        fileType.startsWith('video/') ||
                        /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(fileUrl);

                      return (
                        <div key={comment.id} className={`comment-item ${isAffineDoc ? 'affine-doc' : ''}`}>
                          {comment.content && (
                            <div className="comment-text" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {comment.content}
                            </div>
                          )}

                          {attachment && (
                            <div className="comment-attachment" style={{ marginTop: '6px' }}>
                              {isAffineDoc ? (
                                <div
                                  className="attachment-affine-doc"
                                  onClick={() => window.open(fileUrl, '_blank')}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px 10px',
                                    background: '#e8f5e9',
                                    color: '#2e7d32',
                                    border: '1px solid #c8e6c9',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                  }}
                                >
                                  <span>📄 Open AFFiNE Doc ({fileName})</span>
                                  <span>↗</span>
                                </div>
                              ) : isImage ? (
                                <div className="attachment-image" style={{ marginTop: '4px' }}>
                                  <img
                                    src={fileUrl}
                                    alt={fileName}
                                    onClick={() => window.open(fileUrl, '_blank')}
                                    style={{
                                      maxWidth: '100%',
                                      maxHeight: '260px',
                                      borderRadius: '6px',
                                      border: '1px solid var(--affine-border-color, #eaeaea)',
                                      cursor: 'pointer',
                                      display: 'block',
                                      objectFit: 'contain',
                                    }}
                                    onError={e => {
                                      (e.currentTarget as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                  <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                                    <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>
                                      🖼️ {fileName}
                                    </a>
                                  </div>
                                </div>
                              ) : isAudio ? (
                                <div className="attachment-audio" style={{ marginTop: '4px' }}>
                                  <audio controls style={{ width: '100%', maxWidth: '320px', height: '36px' }}>
                                    <source src={fileUrl} type={fileType || undefined} />
                                    Your browser does not support audio playback.
                                  </audio>
                                  <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                                    🎵 {fileName}
                                  </div>
                                </div>
                              ) : isVideo ? (
                                <div className="attachment-video" style={{ marginTop: '4px' }}>
                                  <video controls style={{ maxWidth: '100%', maxHeight: '260px', borderRadius: '6px' }}>
                                    <source src={fileUrl} type={fileType || undefined} />
                                    Your browser does not support video playback.
                                  </video>
                                  <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                                    🎬 {fileName}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <a
                                    href={fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#2563eb', fontSize: '12px', textDecoration: 'underline' }}
                                  >
                                    📎 {fileName}
                                  </a>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="comment-date" style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>
                            {new Date(comment.posted_at || comment.created_at || Date.now()).toLocaleString()}
                          </div>
                        </div>
                      );
                    })
                  )}

                  {attachedFile && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#eff6ff',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#1e40af',
                        margin: '6px 0',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📎 Attached: <strong>{attachedFile.file_name}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setAttachedFile(null)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#de4c4a',
                          fontWeight: 'bold',
                        }}
                        title="Remove attachment"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  <div className="comment-input" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
                    <input
                      type="text"
                      placeholder="Add a comment..."
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddComment().catch(console.error);
                      }}
                      style={{ flex: 1 }}
                    />

                    {/* Hidden File Input */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: 'none' }}
                      onChange={handleFileSelect}
                    />

                    {/* Add Attachment Button next to Comment field */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingAttachment}
                      style={{
                        padding: '5px 10px',
                        background: attachedFile ? '#2563eb' : '#f1f3f5',
                        color: attachedFile ? '#ffffff' : '#495057',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      title="Attach image, audio, or document"
                    >
                      📎 {isUploadingAttachment ? '...' : attachedFile ? 'Attached' : 'Attach'}
                    </button>

                    <button
                      type="button"
                      onClick={() => { handleAddComment().catch(console.error); }}
                      style={{
                        padding: '5px 12px',
                        background: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Post
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Actions */}
      <div className="task-card-actions">
        {/* Quick Date Picker */}
        <div className="action-group" ref={datePickerRef}>
          <button
            className="action-btn date-btn"
            onClick={() => setShowDatePicker(!showDatePicker)}
            title="Change due date"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <SFSymbolCalendar width={14} height={14} />
          </button>
          {showDatePicker && (
            <div className="date-picker-popup">
              <input
                type="date"
                value={editDueDate}
                onChange={e => {
                  setEditDueDate(e.target.value);
                  TodoistService.updateTask(task.id, { due_date: e.target.value })
                    .then(() => onTaskUpdate())
                    .catch(console.error);
                  setShowDatePicker(false);
                }}
              />
            </div>
          )}
        </div>

        {/* Quick Priority Picker */}
        <div className="action-group" ref={priorityPickerRef}>
          <button
            className="action-btn priority-btn"
            onClick={() => setShowPriorityPicker(!showPriorityPicker)}
            title="Change priority"
            style={{ color: priority.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <SFSymbolFlag width={14} height={14} />
          </button>
          {showPriorityPicker && (
            <div className="priority-picker-popup">
              {[4, 3, 2, 1].map(p => (
                <button
                  key={p}
                  className={`priority-option ${task.priority === p ? 'selected' : ''}`}
                  onClick={() => {
                    handleUpdatePriority(p).catch(console.error);
                    setShowPriorityPicker(false);
                  }}
                  style={{
                    background: task.priority === p ? PRIORITY_CONFIG[p as keyof typeof PRIORITY_CONFIG].bg : 'transparent',
                    borderColor: task.priority === p ? PRIORITY_CONFIG[p as keyof typeof PRIORITY_CONFIG].color : '#ddd',
                    color: task.priority === p ? PRIORITY_CONFIG[p as keyof typeof PRIORITY_CONFIG].color : '#666',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <SFSymbolFlag width={12} height={12} /> {PRIORITY_CONFIG[p as keyof typeof PRIORITY_CONFIG].label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Edit Button */}
        <button
          className="action-btn edit-btn"
          onClick={() => setIsEditing(true)}
          title="Edit task (Ctrl+E)"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <SFSymbolPencil width={14} height={14} />
        </button>

        {/* Three Dot Menu */}
        <div className="action-group" ref={menuRef}>
          <button
            className="action-btn menu-btn"
            onClick={() => setShowMenu(!showMenu)}
            title="More actions"
          >
            ⋮
          </button>

          {showMenu && (
            <div className="task-menu-popup">
              <button
                onClick={() => {
                  setIsEditing(true);
                  setShowMenu(false);
                }}
              >
                ✏️ Edit <span className="shortcut">Ctrl+E</span>
              </button>
              <button
                onClick={() => {
                  setShowDatePicker(true);
                  setShowMenu(false);
                }}
              >
                📅 Set date <span className="shortcut">T</span>
              </button>
              <button
                onClick={() => {
                  setShowPriorityPicker(true);
                  setShowMenu(false);
                }}
              >
                🎯 Set priority <span className="shortcut">Y</span>
              </button>
              <button
                onClick={() => {
                  if (task.content) {
                    navigator.clipboard.writeText(task.content).catch(console.error);
                  }
                  setShowMenu(false);
                }}
              >
                🔗 Copy title <span className="shortcut">Ctrl+C</span>
              </button>
              <button
                onClick={() => {
                  TodoistService.toggleHabitTrack(task.id)
                    .then(() => onTaskUpdate())
                    .catch(console.error);
                  setShowMenu(false);
                }}
              >
                {task.is_habit ? '❌ Stop habit tracking' : '🔄 Track habit'} <span className="shortcut">H</span>
              </button>
              <button
                onClick={() => {
                  setShowRecurringModal(true);
                  setShowMenu(false);
                }}
              >
                🔄 Track habit / Repeat
              </button>
              <button
                className="danger"
                onClick={() => {
                  setShowDeleteConfirm(true);
                  setShowMenu(false);
                }}
              >
                🗑️ Delete <span className="shortcut">Delete</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recurring Task Settings Modal */}
      {showRecurringModal && (
        <div className="modal-overlay" onClick={() => setShowRecurringModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>🔄 Recurring Task Settings</h3>

            <div className="modal-field">
              <label>Repeat Pattern</label>
              <select
                value={recurringPattern}
                onChange={e => setRecurringPattern(e.target.value as any)}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            {recurringPattern === 'weekly' && (
              <div className="modal-field">
                <label>Days of Week</label>
                <div className="days-selector">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                    <button
                      key={day}
                      type="button"
                      className={`day-btn ${recurringDays.includes(idx) ? 'selected' : ''}`}
                      onClick={() => {
                        setRecurringDays(prev =>
                          prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx]
                        );
                      }}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {recurringPattern === 'monthly' && (
              <div className="modal-field">
                <label>Day of Month</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={recurringMonthDay}
                  onChange={e => setRecurringMonthDay(parseInt(e.target.value, 10) || 1)}
                />
              </div>
            )}

            <div className="modal-field">
              <label>Repeat Until (optional)</label>
              <input
                type="date"
                value={recurringUntil}
                onChange={e => setRecurringUntil(e.target.value)}
                min={todayStr}
              />
            </div>

            <div className="modal-actions">
              <button
                className="save-btn"
                onClick={() => {
                  TodoistService.updateRecurringTask(task.id, {
                    is_recurring: true,
                    recurring_pattern: recurringPattern,
                    recurring_days: recurringDays,
                    recurring_month_day: recurringMonthDay,
                    recurring_until: recurringUntil || undefined,
                  })
                    .then(() => {
                      setIsRecurring(true);
                      setShowRecurringModal(false);
                      onTaskUpdate();
                    })
                    .catch(console.error);
                }}
              >
                Save Changes
              </button>
              <button className="cancel-btn" onClick={() => setShowRecurringModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const TaskCard = React.memo(TaskCardComponent);
