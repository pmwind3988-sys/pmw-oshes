import { useCallback, useEffect, useState } from "react";
import type { PortalFormDraft } from "../types";
import { EMPTY_DRAFT, clearDraft, draftLabel, readDraft, writeDraft } from "../utils/portalDraft";

/**
 * Draft state for one form, persisted on every keystroke and restored on load.
 * A 5s tick keeps the "Draft saved N ago" indicator honest without re-rendering
 * anything else.
 */
export function usePortalDraft(formId: string, seed?: Partial<PortalFormDraft>) {
  const [draft, setDraft] = useState<PortalFormDraft>(() => ({ ...EMPTY_DRAFT, ...seed }));
  const [savedAt, setSavedAt] = useState(0);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Switching form loads that form's own draft. Adjusted during render rather
  // than in an effect so the first paint already shows the restored answers.
  if (loadedFor !== formId) {
    const stored = readDraft(formId);
    setLoadedFor(formId);
    setDraft(stored ? { ...stored.draft, ...seed } : { ...EMPTY_DRAFT, ...seed });
    setSavedAt(stored?.savedAt ?? 0);
  }

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  const setField = useCallback(
    <K extends keyof PortalFormDraft>(key: K, value: PortalFormDraft[K]) => {
      setDraft((current) => {
        const next = { ...current, [key]: value };
        setSavedAt(writeDraft(formId, next));
        return next;
      });
    },
    [formId],
  );

  const reset = useCallback(
    (next: Partial<PortalFormDraft> = {}) => {
      clearDraft(formId);
      setDraft({ ...EMPTY_DRAFT, ...next });
      setSavedAt(0);
    },
    [formId],
  );

  return { draft, setField, reset, savedAt, savedLabel: draftLabel(savedAt) };
}
