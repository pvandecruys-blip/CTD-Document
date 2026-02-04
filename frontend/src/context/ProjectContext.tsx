import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Project } from '../types';
import { projects } from '../api/client';

interface ProjectCtx {
  current: Project | null;
  list: Project[];
  loading: boolean;
  select: (p: Project) => void;
  selectById: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<ProjectCtx>({
  current: null,
  list: [],
  loading: true,
  select: () => {},
  selectById: async () => {},
  reload: async () => {},
});

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await projects.list();
      setList(data.items);
      // Update current if it exists in the new list
      if (current) {
        const updated = data.items.find((p) => p.id === current.id);
        if (updated) {
          setCurrent(updated);
        }
      }
    } catch {
      /* storage error */
    } finally {
      setLoading(false);
    }
  }, [current]);

  const selectById = useCallback(async (id: string) => {
    // First check if it's in the list
    const existing = list.find((p) => p.id === id);
    if (existing) {
      setCurrent(existing);
      return;
    }
    // Otherwise try to load it
    try {
      const project = await projects.get(id);
      setCurrent(project);
      // Reload list to make sure it's in sync
      const data = await projects.list();
      setList(data.items);
    } catch {
      // Project not found
    }
  }, [list]);

  useEffect(() => { reload(); }, []);

  return (
    <Ctx.Provider value={{ current, list, loading, select: setCurrent, selectById, reload }}>
      {children}
    </Ctx.Provider>
  );
}

export function useProject() {
  return useContext(Ctx);
}
