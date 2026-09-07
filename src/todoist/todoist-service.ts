export interface LinkedDocRef {
  docId: string;
  docTitle?: string;
  blockId?: string;
  elementId?: string;
  mode?: 'page' | 'edgeless';
}

export interface TodoistAttachment {
  id: string;
  filename: string;
  url: string;
  size?: number;
  type?: string;
  is_affine_doc?: boolean;
}

export interface TodoistTask {
  id: string;
  content: string;
  description?: string;
  is_completed: boolean;
  due?: {
    date: string;
    string?: string;
    datetime?: string;
    is_recurring?: boolean;
  } | null;
  priority: number; // 1 (normal) to 4 (urgent)
  project_id?: string;
  url?: string;
  created_at?: string;
  is_recurring?: boolean;
  recurring_pattern?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurring_days?: number[];
  recurring_month_day?: number;
  recurring_until?: string;
  next_due_date?: string;
  order?: number;
  labels?: string[];
  location?: string;
  loc_trigger?: 'on_enter' | 'on_leave';
  is_habit?: boolean;
  habit_streak?: number;
  habit_longest_streak?: number;
  habit_last_completed?: string;
  habit_completed_dates?: string[];
  linked_doc?: LinkedDocRef;
  attachments?: TodoistAttachment[];
  comments?: any[];
  comment_count?: number;
  comments_count?: number;
  has_comments?: boolean;
  has_attachments?: boolean;
  affine_doc_link?: string;
}

export interface TodoistProject {
  id: string;
  name: string;
  color?: string;
  is_favorite?: boolean;
  is_inbox_project?: boolean;
}

const TODOIST_TOKEN_STORAGE_KEY = 'affine:brillian-patch:todoist-token';
const TODOIST_STANDALONE_SERVER = '/api/todoist';

async function todoistFetch(urlPath: string, options: RequestInit = {}): Promise<Response> {
  const cleanPath = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;

  let fullPath = cleanPath;
  if (!cleanPath.startsWith('/sync') && !cleanPath.startsWith('/rest') && !cleanPath.startsWith('/api')) {
    fullPath = `/api/v1${cleanPath}`;
  } else if (cleanPath.startsWith('/rest/v2')) {
    fullPath = cleanPath.replace('/rest/v2', '/api/v1');
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem(TODOIST_TOKEN_STORAGE_KEY) || '' : '';
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
  };

  // 1. Try same-origin proxy /api/todoist (routes via Nginx to todoist-server on server:3002)
  try {
    const res = await fetch(`${TODOIST_STANDALONE_SERVER}${fullPath}`, fetchOptions);
    if (res.ok || res.status < 500) {
      return res;
    }
  } catch {
    // Continue to fallback
  }

  // 2. Direct fallback to official Todoist API
  const directUrl = `https://api.todoist.com${fullPath}`;
  return await fetch(directUrl, fetchOptions);
}

const LOCAL_TASKS_KEY = 'affine:brillian-patch:todoist-local-tasks';
const LOCAL_PROJECTS_KEY = 'affine:brillian-patch:todoist-local-projects';

export class TodoistService {
  static getLocalTasks(): TodoistTask[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(LOCAL_TASKS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  static saveLocalTasks(tasks: TodoistTask[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
  }

  static getLocalProjects(): TodoistProject[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(LOCAL_PROJECTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  static saveLocalProjects(projects: TodoistProject[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(projects));
  }

  static getToken(): string {
    if (typeof window === 'undefined') return '';
    return (
      localStorage.getItem(TODOIST_TOKEN_STORAGE_KEY) ||
      localStorage.getItem('todoist_token') ||
      localStorage.getItem('todoist-token') ||
      ''
    );
  }

  static setToken(token: string): void {
    if (typeof window === 'undefined') return;
    const cleanToken = token.trim();
    if (cleanToken) {
      localStorage.setItem(TODOIST_TOKEN_STORAGE_KEY, cleanToken);
    } else {
      localStorage.removeItem(TODOIST_TOKEN_STORAGE_KEY);
      localStorage.removeItem(LOCAL_TASKS_KEY);
      localStorage.removeItem(LOCAL_PROJECTS_KEY);
    }
    window.dispatchEvent(
      new CustomEvent('affine:todoist-token-updated', {
        detail: { token: cleanToken },
      })
    );
  }

  static async testConnection(token: string): Promise<{ success: boolean; error?: string }> {
    if (!token) return { success: false, error: 'Token cannot be empty' };
    try {
      const response = await todoistFetch('/projects', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        return { success: true };
      }
      const errText = await response.text().catch(() => '');
      return {
        success: false,
        error: response.status === 401 || response.status === 403
          ? 'Invalid API Token'
          : `HTTP ${response.status}: ${errText || response.statusText}`,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error connecting to Todoist' };
    }
  }

  static async getProjects(): Promise<TodoistProject[]> {
    const token = this.getToken();
    const local = this.getLocalProjects();
    if (!token) return local;

    try {
      const response = await todoistFetch('/projects', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const text = await response.text();
        const data = JSON.parse(text);
        const projectsList = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : null;
        if (projectsList) {
          const normalized = projectsList.map((p: any) => ({
            ...p,
            is_inbox_project: Boolean(p.is_inbox_project || p.inbox || p.name?.toLowerCase() === 'inbox'),
          }));
          this.saveLocalProjects(normalized);
          return normalized;
        }
      }
    } catch {
      // Return local cache on network error
    }

    return local;
  }

  static async getTasks(filter?: string): Promise<TodoistTask[]> {
    const token = this.getToken();
    const local = this.getLocalTasks();
    if (!token) return local;

    try {
      const activePath = filter ? `/tasks?filter=${encodeURIComponent(filter)}` : '/tasks';
      const activePromise = todoistFetch(activePath, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const completedPromise = todoistFetch('/tasks/completed', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);

      const [activeRes, completedRes] = await Promise.all([activePromise, completedPromise]);

      if (activeRes.ok) {
        const activeRaw = await activeRes.json();
        const activeData: any[] = Array.isArray(activeRaw)
          ? activeRaw
          : Array.isArray(activeRaw?.results)
          ? activeRaw.results
          : Array.isArray(activeRaw?.items)
          ? activeRaw.items
          : [];

        let completedData: any[] = [];
        if (completedRes && completedRes.ok) {
          const compJson = await completedRes.json().catch(() => []);
          completedData = Array.isArray(compJson)
            ? compJson
            : Array.isArray(compJson?.items)
            ? compJson.items
            : Array.isArray(compJson?.results)
            ? compJson.results
            : [];
        }

        // Remote items: active (is_completed: false) + completed (is_completed: true)
        const allRemote = [
          ...activeData.map((t: any) => ({ ...t, is_completed: false })),
          ...completedData.map((t: any) => ({ ...t, is_completed: true })),
        ];

        const merged = allRemote.map(remote => {
          const matchedLocal = local.find(l => l.id === remote.id);
          const commentCount =
            remote.comment_count ??
            remote.comments_count ??
            (Array.isArray(remote.comments) ? remote.comments.length : undefined) ??
            (Array.isArray(matchedLocal?.comments) ? matchedLocal.comments.length : matchedLocal?.comment_count) ??
            0;

          if (matchedLocal) {
            return {
              ...remote,
              is_completed: remote.is_completed,
              comments: remote.comments || matchedLocal.comments || [],
              comment_count: commentCount,
              comments_count: commentCount,
              has_comments: commentCount > 0,
              is_habit: matchedLocal.is_habit,
              habit_streak: matchedLocal.habit_streak,
              habit_longest_streak: matchedLocal.habit_longest_streak,
              habit_last_completed: matchedLocal.habit_last_completed,
              habit_completed_dates: matchedLocal.habit_completed_dates,
              is_recurring: remote.is_recurring ?? matchedLocal.is_recurring,
              recurring_pattern: matchedLocal.recurring_pattern || remote.recurring_pattern,
              recurring_days: matchedLocal.recurring_days || remote.recurring_days,
              recurring_month_day: matchedLocal.recurring_month_day || remote.recurring_month_day,
              recurring_until: matchedLocal.recurring_until || remote.recurring_until,
              linked_doc: matchedLocal.linked_doc || (remote as any).linked_doc,
              location: matchedLocal.location || (remote as any).location,
              loc_trigger: matchedLocal.loc_trigger || (remote as any).loc_trigger,
            };
          }
          return {
            ...remote,
            comment_count: commentCount,
            comments_count: commentCount,
            has_comments: commentCount > 0,
          };
        });

        // Local unsaved drafts (only tasks with local- prefix that haven't synced yet)
        const localDrafts = local.filter(l => l.id.startsWith('local-') && !merged.some(m => m.id === l.id));

        // Combine deduplicated tasks: remote is source of truth, plus any unsaved local drafts
        const taskMap = new Map<string, TodoistTask>();
        merged.forEach(t => taskMap.set(t.id, t));
        localDrafts.forEach(t => {
          if (!taskMap.has(t.id)) taskMap.set(t.id, t);
        });

        const fullTasks = Array.from(taskMap.values());
        this.saveLocalTasks(fullTasks);
        return fullTasks;
      }
    } catch (err) {
      console.error('[TodoistService] getTasks network error:', err);
    }

    // Fallback: Todoist Sync API v1 (/api/v1/sync)
    try {
      const syncResponse = await todoistFetch('/api/v1/sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'sync_token=*&resource_types=["items","projects"]',
      });

      if (syncResponse.ok) {
        const data = await syncResponse.json();
        if (Array.isArray(data.items)) {
          const syncTasks: TodoistTask[] = data.items.map((item: any) => {
            const matchedLocal = local.find(l => l.id === item.id);
            return {
              id: item.id,
              content: item.content,
              description: item.description,
              is_completed: item.checked === 1 || item.is_completed === true,
              priority: item.priority || 1,
              project_id: item.project_id,
              due: item.due ? { date: item.due.date, string: item.due.string, is_recurring: item.due.is_recurring } : null,
              labels: Array.isArray(item.labels) ? item.labels : [],
              linked_doc: matchedLocal?.linked_doc,
              is_habit: matchedLocal?.is_habit,
              habit_streak: matchedLocal?.habit_streak,
              habit_longest_streak: matchedLocal?.habit_longest_streak,
              habit_last_completed: matchedLocal?.habit_last_completed,
              habit_completed_dates: matchedLocal?.habit_completed_dates,
              is_recurring: matchedLocal?.is_recurring || item.due?.is_recurring || false,
              recurring_pattern: matchedLocal?.recurring_pattern,
              recurring_days: matchedLocal?.recurring_days,
              recurring_month_day: matchedLocal?.recurring_month_day,
              recurring_until: matchedLocal?.recurring_until,
            };
          });
          const previouslyCompleted = local.filter(l => l.is_completed && !syncTasks.some(s => s.id === l.id) && !l.id.startsWith('local-'));
          const localDrafts = local.filter(l => l.id.startsWith('local-') && !syncTasks.some(s => s.id === l.id));
          const fullSyncTasks = [...syncTasks, ...previouslyCompleted, ...localDrafts];

          this.saveLocalTasks(fullSyncTasks);
          if (Array.isArray(data.projects)) {
            this.saveLocalProjects(data.projects);
          }
          return fullSyncTasks;
        }
      }
    } catch {
      // Use local cache
    }

    return local;
  }

  static async createTask(params: {
    content: string;
    description?: string;
    due_string?: string;
    due_date?: string;
    priority?: number;
    project_id?: string;
    labels?: string[];
    linked_doc?: LinkedDocRef;
    location?: string;
    loc_trigger?: 'on_enter' | 'on_leave';
    attachment?: {
      file_name: string;
      file_url: string;
      file_type?: string;
    };
  }): Promise<TodoistTask> {
    const local = this.getLocalTasks();
    const newTask: TodoistTask = {
      id: `local-${Date.now()}`,
      content: params.content,
      description: params.description,
      is_completed: false,
      priority: params.priority || 1,
      project_id: params.project_id,
      labels: params.labels || [],
      linked_doc: params.linked_doc,
      location: params.location,
      loc_trigger: params.loc_trigger,
      due: params.due_string ? { date: new Date().toISOString().slice(0, 10), string: params.due_string } : undefined,
      created_at: new Date().toISOString(),
    };

    const updated = [newTask, ...local];
    this.saveLocalTasks(updated);

    const token = this.getToken();
    if (token) {
      try {
        const {
          linked_doc: _,
          attachment: initialAttachment,
          location: _loc,
          loc_trigger: _trigger,
          ...apiParams
        } = params;
        const response = await todoistFetch('/tasks', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(apiParams),
        });
        if (response.ok) {
          const remoteTask: TodoistTask = await response.json();

          // 1. If an attachment was provided, upload/attach it as a comment
          if (initialAttachment) {
            await this.addComment(
              remoteTask.id,
              `📎 ${initialAttachment.file_name}`,
              initialAttachment
            ).catch(err => console.error('[TodoistService] Failed to attach initial file:', err));
          }

          // 2. If a linked doc was provided, attach doc link
          if (params.linked_doc) {
            const docLink = `${window.location.origin}/workspace/all/${params.linked_doc.docId}`;
            await this.addAttachment(remoteTask.id, {
              file_url: docLink,
              file_name: params.linked_doc.docTitle || 'AFFiNE Doc Link',
              content: `📄 **AFFiNE Doc**: ${params.linked_doc.docTitle || 'Linked Doc'}\n${docLink}`,
            }).catch(() => null);
          }

          const synced = updated.map(t =>
            t.id === newTask.id
              ? {
                  ...remoteTask,
                  linked_doc: params.linked_doc,
                  location: params.location,
                  loc_trigger: params.loc_trigger,
                  has_attachments: Boolean(initialAttachment || params.linked_doc),
                }
              : t
          );
          this.saveLocalTasks(synced);
          return {
            ...remoteTask,
            linked_doc: params.linked_doc,
            location: params.location,
            loc_trigger: params.loc_trigger,
            has_attachments: Boolean(initialAttachment || params.linked_doc),
          };
        } else {
          const errText = await response.text().catch(() => '');
          console.error('[Todoist API Error] Failed to create task:', response.status, errText);
          throw new Error(`Todoist API responded with HTTP ${response.status}: ${errText || response.statusText}`);
        }
      } catch (err: any) {
        console.error('[Todoist Create Task Error]:', err);
        throw err;
      }
    }

    return newTask;
  }

  static async addAttachment(
    taskId: string,
    attachment: {
      content?: string;
      file_url: string;
      file_name: string;
      file_type?: string;
    }
  ): Promise<boolean> {
    const token = this.getToken();
    if (!token || taskId.startsWith('local-')) return false;

    try {
      const response = await todoistFetch(`/comments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_id: taskId,
          content: attachment.content || `📎 **${attachment.file_name}**\n${attachment.file_url}`,
          attachment: {
            file_name: attachment.file_name,
            file_url: attachment.file_url,
            file_type: attachment.file_type || 'text/plain',
          },
        }),
      });
      return response.ok;
    } catch (err) {
      console.error('[TodoistService] Failed to add attachment comment:', err);
      return false;
    }
  }

  static async closeTask(taskId: string): Promise<boolean> {
    const local = this.getLocalTasks();
    const updated = local.map(t => (t.id === taskId ? { ...t, is_completed: true } : t));
    this.saveLocalTasks(updated);

    const token = this.getToken();
    if (token && !taskId.startsWith('local-')) {
      try {
        await todoistFetch(`/tasks/${taskId}/close`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (err) {
        console.error('Failed to close task on Todoist API:', err);
      }
    }

    return true;
  }

  static async reopenTask(taskId: string): Promise<boolean> {
    const local = this.getLocalTasks();
    const updated = local.map(t => (t.id === taskId ? { ...t, is_completed: false } : t));
    this.saveLocalTasks(updated);

    const token = this.getToken();
    if (token && !taskId.startsWith('local-')) {
      try {
        await todoistFetch(`/tasks/${taskId}/reopen`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (err) {
        console.error('Failed to reopen task on Todoist API:', err);
      }
    }
    return true;
  }

  static async createProject(name: string, color?: string): Promise<TodoistProject> {
    const local = this.getLocalProjects();
    const newProject: TodoistProject = {
      id: `local-proj-${Date.now()}`,
      name,
      color: color || 'grey',
    };

    const updated = [...local, newProject];
    this.saveLocalProjects(updated);

    const token = this.getToken();
    if (token) {
      try {
        const response = await todoistFetch('/projects', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name, color }),
        });
        if (response.ok) {
          const remoteProject: TodoistProject = await response.json();
          const synced = updated.map(p => (p.id === newProject.id ? remoteProject : p));
          this.saveLocalProjects(synced);
          return remoteProject;
        }
      } catch {
        // Keep local project
      }
    }

    return newProject;
  }

  static async deleteProject(projectId: string): Promise<boolean> {
    const local = this.getLocalProjects();
    const updated = local.filter(p => p.id !== projectId);
    this.saveLocalProjects(updated);

    const token = this.getToken();
    if (token && !projectId.startsWith('local-')) {
      try {
        await todoistFetch(`/projects/${projectId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // Ignore
      }
    }

    return true;
  }

  static async updateTask(
    taskId: string,
    params: {
      content?: string;
      description?: string;
      due_date?: string;
      due_datetime?: string;
      due_string?: string;
      priority?: number;
      project_id?: string;
      labels?: string[];
      linked_doc?: LinkedDocRef;
    }
  ): Promise<TodoistTask | null> {
    const local = this.getLocalTasks();
    const existing = local.find(t => t.id === taskId);
    if (!existing) return null;

    const updatedTask: TodoistTask = {
      ...existing,
      content: params.content !== undefined ? params.content : existing.content,
      description: params.description !== undefined ? params.description : existing.description,
      priority: params.priority !== undefined ? params.priority : existing.priority,
      project_id: params.project_id !== undefined ? params.project_id : existing.project_id,
      labels: params.labels !== undefined ? params.labels : existing.labels,
      linked_doc: params.linked_doc !== undefined ? params.linked_doc : existing.linked_doc,
      due: params.due_date || params.due_datetime || params.due_string
        ? {
            date: params.due_date || (params.due_datetime ? params.due_datetime.slice(0, 10) : new Date().toISOString().slice(0, 10)),
            string: params.due_string || params.due_date,
            datetime: params.due_datetime,
          }
        : existing.due,
    };

    const updatedTasks = local.map(t => (t.id === taskId ? updatedTask : t));
    this.saveLocalTasks(updatedTasks);

    const token = this.getToken();
    if (token && !taskId.startsWith('local-')) {
      try {
        const { linked_doc: _, ...apiParams } = params as any;
        const response = await todoistFetch(`/tasks/${taskId}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(apiParams),
        });
        if (response.ok) {
          const remoteTask: TodoistTask = await response.json();
          const synced = updatedTasks.map(t => (t.id === taskId ? { ...remoteTask, linked_doc: updatedTask.linked_doc } : t));
          this.saveLocalTasks(synced);
          return { ...remoteTask, linked_doc: updatedTask.linked_doc };
        }
      } catch {
        // Keep local updated task
      }
    }

    return updatedTask;
  }

  static async getTaskComments(taskId: string): Promise<{ success: boolean; data: any[] }> {
    const token = this.getToken();
    if (token && !taskId.startsWith('local-')) {
      try {
        const response = await todoistFetch(`/comments?task_id=${taskId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const raw = await response.json();
          const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : [];
          // Update local cached task with fresh comments and accurate count
          const local = this.getLocalTasks();
          const updated = local.map(t => {
            if (t.id === taskId) {
              return {
                ...t,
                comments: list,
                comment_count: list.length,
                comments_count: list.length,
                has_comments: list.length > 0,
              };
            }
            return t;
          });
          this.saveLocalTasks(updated);
          return { success: true, data: list };
        }
      } catch {
        // Fallback below
      }
    }
    const local = this.getLocalTasks();
    const task = local.find(t => t.id === taskId);
    return { success: true, data: task?.comments || [] };
  }

  static async uploadFile(
    fileName: string,
    fileData: string,
    fileType: string
  ): Promise<{
    success: boolean;
    file_url?: string;
    file_name?: string;
    file_type?: string;
    upload_state?: string;
    image?: string | null;
    image_width?: number | null;
    image_height?: number | null;
    resource_type?: string;
  }> {
    try {
      const token = this.getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(`${TODOIST_STANDALONE_SERVER}/upload`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          file_name: fileName,
          file_data: fileData,
          file_type: fileType,
        }),
      });
      if (response.ok) {
        const json = await response.json();
        return {
          success: true,
          file_url: json.file_url,
          file_name: json.file_name,
          file_type: json.file_type,
          upload_state: json.upload_state,
          image: json.image,
          image_width: json.image_width,
          image_height: json.image_height,
          resource_type: json.resource_type,
        };
      }
    } catch (err) {
      console.error('[TodoistService] uploadFile error:', err);
    }
    return { success: false };
  }

  static async addComment(
    taskId: string,
    content: string,
    attachment?: {
      file_url: string;
      file_name: string;
      file_type?: string;
    }
  ): Promise<{ success: boolean; data: any }> {
    let resolvedAttachment: any = attachment;

    // If attachment is a base64 Data URL, upload it to the local server first
    if (attachment && attachment.file_url.startsWith('data:')) {
      const uploadResult = await this.uploadFile(
        attachment.file_name,
        attachment.file_url,
        attachment.file_type || 'application/octet-stream'
      );
      if (uploadResult.success && uploadResult.file_url) {
        resolvedAttachment = {
          file_url: uploadResult.file_url,
          file_name: uploadResult.file_name || attachment.file_name,
          file_type: uploadResult.file_type || attachment.file_type,
          upload_state: uploadResult.upload_state,
          image: uploadResult.image,
          image_width: uploadResult.image_width,
          image_height: uploadResult.image_height,
          resource_type: uploadResult.resource_type,
        };
      }
    }

    const newComment: any = {
      id: `comment-${Date.now()}`,
      task_id: taskId,
      content,
      posted_at: new Date().toISOString(),
    };

    if (resolvedAttachment) {
      newComment.file_attachment = {
        file_name: resolvedAttachment.file_name,
        file_url: resolvedAttachment.file_url,
        file_type: resolvedAttachment.file_type || 'text/plain',
        ...(resolvedAttachment.upload_state && { upload_state: resolvedAttachment.upload_state }),
        ...(resolvedAttachment.image && { image: resolvedAttachment.image }),
        ...(resolvedAttachment.image_width && { image_width: resolvedAttachment.image_width }),
        ...(resolvedAttachment.image_height && { image_height: resolvedAttachment.image_height }),
        ...(resolvedAttachment.resource_type && { resource_type: resolvedAttachment.resource_type }),
      };
    }

    const token = this.getToken();
    if (token && !taskId.startsWith('local-')) {
      try {
        const payload: any = { task_id: taskId, content };
        if (resolvedAttachment) {
          payload.attachment = {
            file_name: resolvedAttachment.file_name,
            file_url: resolvedAttachment.file_url,
            file_type: resolvedAttachment.file_type || 'text/plain',
            ...(resolvedAttachment.upload_state && { upload_state: resolvedAttachment.upload_state }),
            ...(resolvedAttachment.image && { image: resolvedAttachment.image }),
            ...(resolvedAttachment.image_width && { image_width: resolvedAttachment.image_width }),
            ...(resolvedAttachment.image_height && { image_height: resolvedAttachment.image_height }),
            ...(resolvedAttachment.resource_type && { resource_type: resolvedAttachment.resource_type }),
          };
        }

        const response = await todoistFetch('/comments', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          const data = await response.json();
          // Update local cached task comment count
          const local = this.getLocalTasks();
          const updated = local.map(t => {
            if (t.id === taskId) {
              const count = (t.comment_count || t.comments?.length || 0) + 1;
              return {
                ...t,
                comment_count: count,
                comments_count: count,
                has_comments: true,
                comments: t.comments ? [...t.comments, data] : [data],
              };
            }
            return t;
          });
          this.saveLocalTasks(updated);
          return { success: true, data };
        }
      } catch {
        // Fallback below
      }
    }

    // Local fallback
    const local = this.getLocalTasks();
    const updated = local.map(t => {
      if (t.id === taskId) {
        const count = (t.comment_count || t.comments?.length || 0) + 1;
        return {
          ...t,
          comment_count: count,
          comments_count: count,
          has_comments: true,
          comments: t.comments ? [...t.comments, newComment] : [newComment],
        };
      }
      return t;
    });
    this.saveLocalTasks(updated);
    return { success: true, data: newComment };
  }

  static async updateRecurringTask(
    taskId: string,
    params: {
      is_recurring?: boolean;
      recurring_pattern?: 'daily' | 'weekly' | 'monthly' | 'yearly';
      recurring_days?: number[];
      recurring_month_day?: number;
      recurring_until?: string;
    }
  ): Promise<TodoistTask | null> {
    const local = this.getLocalTasks();
    const existing = local.find(t => t.id === taskId);
    if (!existing) return null;

    const updatedTask: TodoistTask = {
      ...existing,
      is_recurring: params.is_recurring !== undefined ? params.is_recurring : true,
      recurring_pattern: params.recurring_pattern || existing.recurring_pattern || 'daily',
      recurring_days: params.recurring_days || existing.recurring_days,
      recurring_month_day: params.recurring_month_day || existing.recurring_month_day,
      recurring_until: params.recurring_until || existing.recurring_until,
    };

    const updatedTasks = local.map(t => (t.id === taskId ? updatedTask : t));
    this.saveLocalTasks(updatedTasks);
    return updatedTask;
  }

  static async reorderTasks(taskIds: string[]): Promise<boolean> {
    const local = this.getLocalTasks();
    const taskMap = new Map(local.map(t => [t.id, t]));
    const reordered: TodoistTask[] = [];

    taskIds.forEach((id, idx) => {
      const task = taskMap.get(id);
      if (task) {
        reordered.push({ ...task, order: idx });
        taskMap.delete(id);
      }
    });

    // Append remaining tasks not in taskIds
    taskMap.forEach(task => reordered.push(task));

    this.saveLocalTasks(reordered);
    return true;
  }

  static async toggleHabitTrack(taskId: string): Promise<TodoistTask | null> {
    const local = this.getLocalTasks();
    const task = local.find(t => t.id === taskId);
    if (!task) return null;

    const isHabit = !task.is_habit;
    const updatedTask: TodoistTask = {
      ...task,
      is_habit: isHabit,
      habit_streak: isHabit ? task.habit_streak || 0 : 0,
      habit_longest_streak: isHabit ? task.habit_longest_streak || 0 : 0,
      habit_completed_dates: isHabit ? task.habit_completed_dates || [] : [],
    };

    const updatedTasks = local.map(t => (t.id === taskId ? updatedTask : t));
    this.saveLocalTasks(updatedTasks);
    return updatedTask;
  }

  static async completeHabit(taskId: string): Promise<TodoistTask | null> {
    const local = this.getLocalTasks();
    const task = local.find(t => t.id === taskId);
    if (!task) return null;

    const todayStr = new Date().toISOString().slice(0, 10);
    const completedDates = task.habit_completed_dates || [];
    const hasToday = completedDates.includes(todayStr);

    const newCompletedDates = hasToday ? completedDates : [...completedDates, todayStr];
    const newStreak = (task.habit_streak || 0) + (hasToday ? 0 : 1);
    const newLongest = Math.max(task.habit_longest_streak || 0, newStreak);

    const updatedTask: TodoistTask = {
      ...task,
      is_completed: true,
      habit_streak: newStreak,
      habit_longest_streak: newLongest,
      habit_last_completed: todayStr,
      habit_completed_dates: newCompletedDates,
    };

    const updatedTasks = local.map(t => (t.id === taskId ? updatedTask : t));
    this.saveLocalTasks(updatedTasks);
    return updatedTask;
  }

  static async resetHabitStreak(taskId: string): Promise<TodoistTask | null> {
    const local = this.getLocalTasks();
    const task = local.find(t => t.id === taskId);
    if (!task) return null;

    const updatedTask: TodoistTask = {
      ...task,
      habit_streak: 0,
    };

    const updatedTasks = local.map(t => (t.id === taskId ? updatedTask : t));
    this.saveLocalTasks(updatedTasks);
    return updatedTask;
  }

  static async deleteTask(taskId: string): Promise<boolean> {
    const local = this.getLocalTasks();
    const updated = local.filter(t => t.id !== taskId);
    this.saveLocalTasks(updated);

    const token = this.getToken();
    if (token && !taskId.startsWith('local-')) {
      try {
        await todoistFetch(`/tasks/${taskId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // Ignore
      }
    }

    return true;
  }
}

