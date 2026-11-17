export type Confidence = 'high' | 'medium' | 'low';

export interface ConfidenceSignals {
  vendorEmpty: boolean;
  dateDefaulted: boolean;
  linesMismatch: boolean;
  unclearNewProduct: boolean;
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * Окончательная уверенность определяется сервером: модель склонна ставить «high» всегда.
 * Один тревожный сигнал — не выше medium, два и более — low. Оценку модели никогда не повышаем.
 */
export function finalConfidence(model: Confidence, signals: ConfidenceSignals): Confidence {
  const count = Object.values(signals).filter(Boolean).length;
  const cap: Confidence = count === 0 ? 'high' : count === 1 ? 'medium' : 'low';
  return RANK[cap] < RANK[model] ? cap : model;
}
