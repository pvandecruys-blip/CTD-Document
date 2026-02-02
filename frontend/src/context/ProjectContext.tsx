import { createContext, useContext, useState, useEffect } from 'react';
import type { Project } from '../types';
import { projects } from '../api/client';

interface ProjectCtx {
  current: Project | null;
  list: Project[];
  loading: boolean;
  select: (p: Project) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<ProjectCtx>({
  current: null,
  list: [],
  loading: true,
  select: () => {},
  reload: async () => {},
});

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await projects.list();
      setList(data.items);
      // auto-select first if nothing selected or selected was deleted
      if (data.items.length > 0) {
        if (!current || !data.items.find((p) => p.id === current.id)) {
          setCurrent(data.items[0]);
        }
      } else {
        setCurrent(null);
      }
    } catch {
      /* backend offline */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  return (
    <Ctx.Provider value={{ current, list, loading, select: setCurrent, reload }}>
      {children}
    </Ctx.Provider>
  );
}

export function useProject() {
  return useContext(Ctx);
}
