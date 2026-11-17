import { expect, test } from 'vitest';
import { finalConfidence } from './confidence';

const none = { vendorEmpty: false, dateDefaulted: false, linesMismatch: false, unclearNewProduct: false };

test('high без сигналов остаётся high', () => expect(finalConfidence('high', none)).toBe('high'));

test('любой сигнал понижает high до medium', () =>
  expect(finalConfidence('high', { ...none, vendorEmpty: true })).toBe('medium'));

test('low модели не повышается', () => expect(finalConfidence('low', none)).toBe('low'));

test('medium модели с одним сигналом остаётся medium', () =>
  expect(finalConfidence('medium', { ...none, linesMismatch: true })).toBe('medium'));

test('два и более сигнала дают low', () =>
  expect(finalConfidence('high', { ...none, vendorEmpty: true, dateDefaulted: true })).toBe('low'));
