// TypeScript sample code
interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: Priority;
  dueDate: Date | null;
  tags: string[];
}
enum Priority {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}
type TaskFilter = 'all' | 'active' | 'completed';
class StateManager<T> {
  private items: T[] = [];
  add(item: T): void {
    this.items.push(item);
  }
  getAll(): readonly T[] {
    return [...this.items];
  }
}
class TaskManager {
  private tasks = new StateManager<Task>();
  createTask(title: string, priority: Priority = Priority.Medium): Task {
    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      completed: false,
      priority,
      dueDate: null,
      tags: [],
    };
    this.tasks.add(newTask);
    return newTask;
  }
  addTags(taskId: string, ...tags: string[]): void {
    const allTasks = this.tasks.getAll();
    const task = allTasks.find((t) => t.id === taskId);
    if (task) {
      task.tags = [...task.tags, ...tags];
    }
  }
  getTaskTitle(taskId: string): string {
    const allTasks = this.tasks.getAll();
    return allTasks.find((t) => t.id === taskId)?.title ?? 'Unknown Task';
  }
}
const manager = new TaskManager();
const newTask = manager.createTask('Learn TypeScript', Priority.High);
manager.addTags(newTask.id, 'programming', 'learning');
