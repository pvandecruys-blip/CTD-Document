import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Project, DocumentFile } from '../types';
import { projects, documents } from '../api/client';

interface ProjectCtx {
  current: Project | null;
  list: Project[];
  loading: boolean;
  select: (p: Project) => void;
  selectById: (id: string) => Promise<void>;
  reload: () => Promise<void>;
  /**
   * Return the documents in the current project that are tagged for a
   * given CTD section (e.g. "S.7.3"). Untagged documents are excluded.
   * Returns [] if there is no current project.
   */
  getDocumentsForSection: (sectionId: string) => Promise<DocumentFile[]>;
  /**
   * Toggle the section tag on a document. Returns the updated document.
   */
  toggleDocumentTag: (docId: string, sectionId: string) => Promise<DocumentFile | null>;
}

const Ctx = createContext<ProjectCtx>({
  current: null,
  list: [],
  loading: true,
  select: () => {},
  selectById: async () => {},
  reload: async () => {},
  getDocumentsForSection: async () => [],
  toggleDocumentTag: async () => null,
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

  const getDocumentsForSection = useCallback(async (sectionId: string): Promise<DocumentFile[]> => {
    if (!current) return [];
    try {
      const data = await documents.listForSection(current.id, sectionId);
      return data.items;
    } catch {
      return [];
    }
  }, [current]);

  const toggleDocumentTag = useCallback(async (docId: string, sectionId: string): Promise<DocumentFile | null> => {
    if (!current) return null;
    try {
      const data = await documents.list(current.id);
      const doc = data.items.find((d) => d.id === docId);
      if (!doc) return null;
      const has = (doc.section_tags || []).includes(sectionId);
      return has
        ? await documents.removeTag(current.id, docId, sectionId)
        : await documents.addTag(current.id, docId, sectionId);
    } catch {
      return null;
    }
  }, [current]);

  useEffect(() => { reload(); }, []);

  return (
    <Ctx.Provider value={{ current, list, loading, select: setCurrent, selectById, reload, getDocumentsForSection, toggleDocumentTag }}>
      {children}
    </Ctx.Provider>
  );
}

export function useProject() {
  return useContext(Ctx);
}
