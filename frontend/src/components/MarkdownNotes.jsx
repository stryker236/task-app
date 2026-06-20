import { marked } from 'marked';

function sanitizedMarkdown(markdown) {
  const documentNode = new DOMParser().parseFromString(marked.parse(markdown || ''), 'text/html');
  documentNode.querySelectorAll('script, iframe, object, embed, style').forEach((node) => node.remove());
  documentNode.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  return documentNode.body.innerHTML;
}

export default function MarkdownNotes({ value, onChange, editable = false }) {
  if (!editable && !value) return null;
  return (
    <div className={`markdown-notes ${editable ? 'markdown-editor' : ''}`}>
      {editable && (
        <textarea
          rows="10"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Escreva notas em Markdown…"
        />
      )}
      <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: sanitizedMarkdown(value) }} />
    </div>
  );
}
