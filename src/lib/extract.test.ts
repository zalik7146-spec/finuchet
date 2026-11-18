import { expect, test } from 'vitest';
import { validateFile } from './extract';

const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

test('временный файл Excel «~$…» отклоняется с подсказкой', () => {
  expect(validateFile(new File(['x'], '~$расчет тары.xlsx', { type: xlsx }))).toBe(
    'Это временный файл, который Excel создаёт, пока документ открыт. Выберите сам документ — без «~$» в начале имени.',
  );
});

test('обычный .xlsx проходит', () => {
  expect(validateFile(new File(['x'], 'расчет тары.xlsx', { type: xlsx }))).toBeNull();
});
