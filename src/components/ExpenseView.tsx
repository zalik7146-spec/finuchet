import type { ReactNode } from 'react';
import type { Expense } from '../types';
import { CONFIDENCE_LABEL, SOURCE_LABEL, displayFileName, formatDate, formatRub } from '../lib/format';
import { Modal } from './ui';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-line px-5 py-2.5 text-sm last:border-b-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Карточка расхода только для просмотра. Открывается поверх других окон, не трогая их состояние. */
export function ExpenseView({ expense: e, onClose, extra }: { expense: Expense; onClose: () => void; extra?: ReactNode }) {
  return (
    <Modal title={e.vendor || 'Расход'} subtitle={`Добавлен ${new Date(e.createdAt).toLocaleString('ru-RU')}`} onClose={onClose} width="max-w-lg" top>
      <dl>
        <Row label="Сумма">
          <span className="num font-semibold">{formatRub(e.amount)}</span>
        </Row>
        <Row label="Дата документа">
          <span className="num">{formatDate(e.date)}</span>
        </Row>
        <Row label="№ документа">{e.documentNumber ? <span className="num">{e.documentNumber}</span> : '—'}</Row>
        <Row label="Направление">{e.categoryName}</Row>
        <Row label="Назначение">{e.description || '—'}</Row>
        <Row label="Источник">
          {SOURCE_LABEL[e.sourceType]}
          {displayFileName(e.sourceFileName) && ` · ${displayFileName(e.sourceFileName)}`}
          {e.sourceType !== 'manual' && ` · уверенность ИИ: ${CONFIDENCE_LABEL[e.aiConfidence]}`}
        </Row>
      </dl>
      {extra}
    </Modal>
  );
}
