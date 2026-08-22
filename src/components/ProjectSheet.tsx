import { useEffect, useState } from 'react';
import { X, Plus, Folder } from 'lucide-react';
import { fetchProjectsForCustomer, createProject, setVisitProject } from '@/lib/api';
import type { Project } from '@/lib/types';

interface ProjectSheetProps {
  visitId: string;
  customerId: string;
  currentProjectId: string | null;
  onSelected: (projectId: string | null, projectName: string | null) => void;
  onClose: () => void;
}

export function ProjectSheet({ visitId, customerId, currentProjectId, onSelected, onClose }: ProjectSheetProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await fetchProjectsForCustomer(customerId);
        if (!alive) return;
        setProjects(p);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load projects');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [customerId]);

  async function handleSelect(projectId: string | null) {
    setSaving(true);
    setError(null);
    try {
      await setVisitProject(visitId, projectId);
      const proj = projectId ? projects.find((p) => p.id === projectId) : null;
      onSelected(projectId, proj?.name ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update project');
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const p = await createProject(customerId, newName.trim());
      await setVisitProject(visitId, p.id);
      onSelected(p.id, p.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create project');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[75dvh] w-full max-w-md flex-col rounded-t-[20px] border-t border-border-strong bg-ink pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-head text-[15px] font-bold text-chalk">Project</h2>
          <button onClick={onClose} aria-label="Close" className="text-mist hover:text-chalk">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mx-5 mb-2 rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[11.5px] text-coral">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto no-scrollbar px-5">
          {/* None option */}
          <button
            onClick={() => handleSelect(null)}
            disabled={saving}
            className={`flex w-full items-center gap-2.5 border-b border-border py-3 text-left disabled:opacity-50 ${
              currentProjectId === null ? 'text-amber' : 'text-mist'
            }`}
          >
            <span className="text-[13px] font-medium">None</span>
            {currentProjectId === null && <span className="text-[11px]">· current</span>}
          </button>

          {loading && <div className="py-3 text-[12px] text-mist">Loading…</div>}

          {!loading && projects.length > 0 && (
            <div className="mb-2">
              <div className="mb-2 mt-3 text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
                Existing projects
              </div>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelect(p.id)}
                  disabled={saving}
                  className={`flex w-full items-center gap-2.5 border-b border-border py-2.5 text-left disabled:opacity-50 ${
                    currentProjectId === p.id ? 'text-amber' : 'text-chalk'
                  }`}
                >
                  <Folder size={14} className="shrink-0 text-mist-dim" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium">{p.name}</div>
                  </div>
                  {currentProjectId === p.id && <span className="text-[11px] text-amber">current</span>}
                </button>
              ))}
            </div>
          )}

          {/* New project */}
          {showNew ? (
            <div className="mt-3 rounded-[16px] border border-border bg-cell p-3">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Project name"
                className="w-full rounded-[10px] border border-border bg-cell-2 px-3 py-2 text-[13px] text-chalk placeholder:text-mist-dim focus:border-amber focus:outline-none"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => { setShowNew(false); setNewName(''); }}
                  disabled={saving}
                  className="rounded-[10px] border border-border-strong bg-cell-2 px-3 py-2 text-[12px] text-mist disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || saving}
                  className="flex-1 rounded-[10px] bg-amber px-3 py-2 text-[12px] font-semibold text-amber-ink disabled:opacity-50"
                >
                  {saving ? 'Creating…' : 'Create & assign'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNew(true)}
              disabled={saving}
              className="mt-3 flex w-full items-center gap-2.5 rounded-[10px] border border-amber/30 bg-amber/10 px-3 py-2.5 text-left disabled:opacity-50"
            >
              <Plus size={16} className="text-amber" />
              <span className="text-[13px] font-medium text-amber">New project</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
