import { useEffect, useState } from 'react';
import { isXlsx } from '../lib/extract';

export function SourcePreview({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  const sheet = isXlsx(file);
  return (
    <aside className="min-w-0 self-start border-b border-line bg-slate-50 p-4 lg:sticky lg:top-0 lg:border-r lg:border-b-0" aria-label="Оригинал документа">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">Оригинал документа</h3>
        {url && (sheet ? <a className="link" href={url} download={file.name}>Скачать Excel</a>
          : <a className="link" href={url} target="_blank" rel="noopener noreferrer">Открыть отдельно</a>)}
      </div>
      <p className="mt-1 truncate text-xs text-slate-500" title={file.name}>{file.name}</p>
      {!sheet && url && <>
        <button className="link mt-2 lg:hidden" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? 'Скрыть оригинал' : 'Показать оригинал'}
        </button>
        <div className={`mt-3 ${mobileOpen ? 'block' : 'hidden'} lg:block`}>
          {file.type === 'application/pdf'
            ? <iframe className="h-[55vh] w-full rounded border border-line bg-white" title="Исходный PDF" src={url} />
            : <img className="mx-auto max-h-[54vh] max-w-full rounded object-contain" src={url} alt="Загруженный скан" />}
        </div>
      </>}
    </aside>
  );
}
