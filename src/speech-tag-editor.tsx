import React, {useEffect, useMemo, useRef, useState} from 'react';
import {applyAudioTag, filterAudioTags, incompleteTagAt} from './domain/audio-tags';

const caretOffset = (textarea: HTMLTextAreaElement, position: number) => {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const properties = [
    'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'textTransform',
    'lineHeight', 'wordSpacing', 'whiteSpace', 'wordWrap', 'overflowWrap',
  ] as const;
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '0';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflow = 'hidden';
  for (const property of properties) {
    mirror.style[property] = style[property];
  }
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement('span');
  marker.textContent = textarea.value.slice(position, position + 1) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop - textarea.scrollTop;
  const left = marker.offsetLeft - textarea.scrollLeft;
  mirror.remove();
  return {top, left};
};

type SpeechTagEditorProps = {
  value: string;
  onChange: (value: string) => void;
  'aria-label'?: string;
};

export const SpeechTagEditor: React.FC<SpeechTagEditorProps> = ({value, onChange, 'aria-label': ariaLabel}) => {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [menu, setMenu] = useState({top: 0, left: 0});
  const matches = useMemo(() => filterAudioTags(query), [query]);

  const syncMenu = (nextValue: string, caret: number) => {
    const incomplete = incompleteTagAt(nextValue, caret);
    const field = textarea.current;
    if (!incomplete || !field) {
      setOpen(false);
      return;
    }
    const offset = caretOffset(field, incomplete.start);
    setQuery(incomplete.query);
    setActive(0);
    setMenu({
      top: Math.min(field.offsetHeight - 8, Math.max(24, offset.top + 22)),
      left: Math.min(Math.max(8, offset.left), Math.max(8, field.clientWidth - 280)),
    });
    setOpen(true);
  };

  const insert = (tag: string) => {
    const field = textarea.current;
    if (!field) return;
    const applied = applyAudioTag(value, field.selectionStart, tag);
    if (!applied) return;
    onChange(applied.text);
    setOpen(false);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(applied.caret, applied.caret);
    });
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const field = textarea.current;
      if (!field) return;
      const root = field.parentElement;
      if (root && !root.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onPointer);
    return () => window.removeEventListener('mousedown', onPointer);
  }, [open]);

  return (
    <div className="speech-tag-editor">
      <textarea
        ref={textarea}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          syncMenu(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) => syncMenu(event.currentTarget.value, event.currentTarget.selectionStart)}
        onKeyUp={(event) => {
          if (event.key === 'Escape' || event.key === 'ArrowDown' || event.key === 'ArrowUp') return;
          syncMenu(event.currentTarget.value, event.currentTarget.selectionStart);
        }}
        onKeyDown={(event) => {
          if (!open || matches.length === 0) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((current) => (current + 1) % matches.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) => (current - 1 + matches.length) % matches.length);
          } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            insert(matches[active]?.tag ?? matches[0].tag);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
          }
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {open && matches.length > 0 ? (
        <ul className="tag-suggest" role="listbox" style={{top: menu.top, left: menu.left}}>
          {matches.map((item, index) => (
            <li key={item.tag}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={index === active ? 'active' : ''}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insert(item.tag);
                }}
              >
                <code>[{item.tag}]</code>
                <span>{item.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <small className="tag-suggest-hint">Введите [ — подсказка тегов Eleven v3</small>
    </div>
  );
};
