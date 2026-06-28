import { deleteTag, deleteTags } from '../api';

export default function useTagActions({ setAvailableTags, setError, setFiltersByView }) {
  function removeTagsFromFilters(names) {
    const normalizedNames = new Set(names.map((name) => name.toLocaleLowerCase()));
    setFiltersByView((current) => Object.fromEntries(
      Object.entries(current).map(([key, value]) => [key, {
        ...value,
        tags: value.tags.filter((name) => !normalizedNames.has(name.toLocaleLowerCase()))
      }])
    ));
  }

  async function deleteUnusedTagFromCatalog(tag, { force = false } = {}) {
    const activeCount = tag.activeUsageCount ?? tag.usageCount ?? 0;
    const message = force && activeCount > 0
      ? `Forçar desativação da tag "${tag.name}"? Ela será removida de ${activeCount} tasks ativas e depois desativada.`
      : `Desativar a tag "${tag.name}"? Ela poderá ser reativada automaticamente se voltares a usá-la.`;
    if (!window.confirm(message)) return;
    try {
      await deleteTag(tag.id, { force });
      removeTagsFromFilters([tag.name]);
      setAvailableTags((current) => current.filter((item) => item.id !== tag.id));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function deleteUnusedTagsFromCatalog(tags, { force = false } = {}) {
    if (!tags.length) return;
    const activeUsage = tags.reduce((sum, tag) => sum + (tag.activeUsageCount ?? tag.usageCount ?? 0), 0);
    const message = force && activeUsage > 0
      ? `Forçar desativação de ${tags.length} tags? Serão removidas ${activeUsage} associações em tasks ativas e as tags serão desativadas.`
      : `Desativar ${tags.length} tags sem uso ativo? Elas poderão ser reativadas automaticamente se voltares a usá-las.`;
    if (!window.confirm(message)) return;
    try {
      const result = await deleteTags(tags.map((tag) => tag.id), { force });
      const deletedIds = new Set(result.deactivatedIds || result.deletedIds || []);
      const deletedNames = tags.filter((tag) => deletedIds.has(tag.id)).map((tag) => tag.name);
      removeTagsFromFilters(deletedNames);
      setAvailableTags((current) => current.filter((item) => !deletedIds.has(item.id)));
      if (result.inUseIds?.length) setError(`${result.inUseIds.length} tags não foram desativadas porque estão em tasks ativas.`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return { deleteUnusedTagFromCatalog, deleteUnusedTagsFromCatalog };
}
