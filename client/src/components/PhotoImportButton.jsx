// "Import from photo" button + modal (shared module). The AI only reads; the person reviews and saves through the normal records.
import { useMemo, useState } from 'react';
import { Button, Modal } from './ui.jsx';
import Icon from './Icon.jsx';
import PhotoImportModal from './PhotoImportModal.jsx';
import { api } from '../api.js';
import { photoT } from '../i18n/photoImportStrings.js';

const CLS = {
  btnPrimary: 'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-semibold bg-brand text-white border border-brand hover:bg-brand/90 disabled:opacity-50',
  btnGhost: 'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-semibold bg-surface text-ink border border-line hover:bg-wash disabled:opacity-50',
  input: 'w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand/30',
  inputWarn: '!bg-amberTint !border-amber', warnBox: 'rounded-md bg-amberTint border border-amber/30 p-2.5 text-xs text-ink', warnText: 'text-amber',
  panel: 'rounded-md border border-line bg-wash p-3',
};

// Anvil is English-only today: when a language switch is added, replace `lang` and the dictionary here.
export default function PhotoImportButton({ kind, title, fields, validate, toPayload, onSave, onImported }) {
  const [open, setOpen] = useState(false);
  const t = useMemo(() => {
    const base = photoT('en');
    return title ? (k, v) => (k === `photo.title.${kind}` ? title : base(k, v)) : base;
  }, [title, kind]);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="photo-import-open">
        <Icon name="camera" size={15} /> {t('photo.button')}
      </Button>
      {open && (
        <PhotoImportModal
          Modal={Modal} t={t} lang="en" api={api.photoApi} kind={kind} fields={fields} validate={validate} toPayload={toPayload}
          onSave={onSave} onImported={onImported} onClose={() => setOpen(false)} cls={CLS}
        />
      )}
    </>
  );
}
