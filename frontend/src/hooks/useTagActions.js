import { deleteTag } from '../api';

export default function useTagActions({ setAvailableTags, setError, setFiltersByView }) {
  async function deleteUnusedTagFromCatalog(tag) {
    if (!window.confirm(`Eliminar a tag "${tag.name}"?`)) return;
    try {
      await deleteTag(tag.id);
      setFiltersByView((current) => Object.fromEntries(
        Object.entries(current).map(([key, value]) => [key, {
          ...value,
          tags: value.tags.filter((name) => name.toLocaleLowerCase() !== tag.name.toLocaleLowerCase())
        }])
      ));
      setAvailableTags((current) => current.filter((item) => item.id !== tag.id));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return { deleteUnusedTagFromCatalog };
}
