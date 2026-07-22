import type { AiCommand } from '../../../../../shared/types';
import type { AdvisorPreview } from '../api';

export function tagPatchFromCommand(command?: AiCommand | null) {
  return Array.isArray(command?.patch?.tags) ? command.patch.tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
}

export function isTagUpdateProposal(proposal: AdvisorPreview['commands'][number], rawCommand?: AiCommand | null) {
  return proposal.type === 'update_task' && tagPatchFromCommand(rawCommand).length > 0;
}

export function sameStringList(left: string[], right: string[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function customizeTagCommand(rawCommand: AiCommand, selectedTags: string[]) {
  return {
    ...rawCommand,
    patch: {
      ...(rawCommand.patch || {}),
      tags: selectedTags
    }
  };
}

export function AdvisorTagChoice({
  tags,
  selectedTags,
  disabled,
  onChange
}: {
  tags: string[];
  selectedTags: string[];
  disabled: boolean;
  onChange: (tags: string[]) => void;
}) {
  if (!tags.length) return null;
  const selectedSet = new Set(selectedTags.map((tag) => tag.toLocaleLowerCase()));
  function toggleTag(tag: string) {
    const isSelected = selectedSet.has(tag.toLocaleLowerCase());
    onChange(isSelected ? selectedTags.filter((item) => item.toLocaleLowerCase() !== tag.toLocaleLowerCase()) : [...selectedTags, tag]);
  }
  return (
    <div className="advisor-tag-choice">
      <div>
        <span>Tags a aplicar</span>
        <button type="button" className="button ghost tiny" onClick={() => onChange(tags)} disabled={disabled || selectedTags.length === tags.length}>
          Todas
        </button>
      </div>
      <div className="advisor-tag-choice-list">
        {tags.map((tag) => {
          const selected = selectedSet.has(tag.toLocaleLowerCase());
          return (
            <button
              type="button"
              key={`advisor-tag-choice-${tag}`}
              className={selected ? 'is-selected' : ''}
              onClick={() => toggleTag(tag)}
              disabled={disabled}
              aria-pressed={selected}
            >
              #{tag}
            </button>
          );
        })}
      </div>
      {!selectedTags.length && <small>Escolhe pelo menos uma tag para aceitar esta proposta.</small>}
    </div>
  );
}
