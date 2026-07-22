import type { Dispatch, SetStateAction } from 'react';
import type { Tag } from '../../../../../shared/types';
import { deleteTag, deleteTags, type TaskFilters } from '../api';
import type { ViewKey } from '../../../constants/tasks';

type TagWithUsage = Tag & {
  usageCount?: number;
  activeUsageCount?: number;
};

type FiltersByView = Record<ViewKey, TaskFilters>;

type UseTagActionsOptions = {
  setAvailableTags: Dispatch<SetStateAction<Tag[]>>;
  setError: (message: string) => void;
  setFiltersByView: Dispatch<SetStateAction<FiltersByView>>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function useTagActions({ setAvailableTags, setError, setFiltersByView }: UseTagActionsOptions) {
  function removeTagsFromFilters(names: string[]) {
    const normalizedNames = new Set(names.map((name) => name.toLocaleLowerCase()));
    setFiltersByView((current) => Object.fromEntries(
      Object.entries(current).map(([key, value]) => [key, {
        ...value,
        tags: (value.tags || []).filter((name) => !normalizedNames.has(name.toLocaleLowerCase()))
      }])
    ) as FiltersByView);
  }

  async function deleteUnusedTagFromCatalog(tag: TagWithUsage, { force = false } = {}) {
    const activeCount = tag.activeUsageCount ?? tag.usageCount ?? 0;
    const message = force && activeCount > 0
      ? `Forcar desativacao da tag "${tag.name}"? Ela sera removida de ${activeCount} tasks ativas e depois desativada.`
      : `Desativar a tag "${tag.name}"? Ela podera ser reativada automaticamente se voltares a usa-la.`;
    if (!window.confirm(message)) return;
    try {
      await deleteTag(tag.id, { force });
      removeTagsFromFilters([tag.name]);
      setAvailableTags((current) => current.filter((item) => item.id !== tag.id));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function deleteUnusedTagsFromCatalog(tags: TagWithUsage[], { force = false } = {}) {
    if (!tags.length) return;
    const activeUsage = tags.reduce((sum, tag) => sum + (tag.activeUsageCount ?? tag.usageCount ?? 0), 0);
    const message = force && activeUsage > 0
      ? `Forcar desativacao de ${tags.length} tags? Serao removidas ${activeUsage} associacoes em tasks ativas e as tags serao desativadas.`
      : `Desativar ${tags.length} tags sem uso ativo? Elas poderao ser reativadas automaticamente se voltares a usa-las.`;
    if (!window.confirm(message)) return;
    try {
      const result = await deleteTags(tags.map((tag) => tag.id), { force });
      const deletedIds = new Set(result.deactivatedIds || result.deletedIds || []);
      const deletedNames = tags.filter((tag) => deletedIds.has(tag.id)).map((tag) => tag.name);
      removeTagsFromFilters(deletedNames);
      setAvailableTags((current) => current.filter((item) => !deletedIds.has(item.id)));
      if (result.inUseIds?.length) setError(`${result.inUseIds.length} tags nao foram desativadas porque estao em tasks ativas.`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  return { deleteUnusedTagFromCatalog, deleteUnusedTagsFromCatalog };
}

