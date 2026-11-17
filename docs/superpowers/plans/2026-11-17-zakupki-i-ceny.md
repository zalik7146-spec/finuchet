# Закупки, цены и дашборд — план работ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в ФинУчет ИИ поиск дублей, статус покупки, загрузку Excel-счетов, справочник товаров со сравнением цен и дашборд закупщика.

**Architecture:** Чистая логика (дубли, сравнение цен, итоговая уверенность ИИ, разбор Excel) выносится в отдельные модули с юнит-тестами на Vitest: клиентская — в `src/lib/`, серверная — в `server/`. Хранилище расширяется через интерфейс `DataStore` (`src/types.ts`) в обеих реализациях: `supabase.ts` (облако) и `localStore.ts` (демо). Изменения базы — миграциями Supabase с политиками «только участники» и зеркалом в `supabase/schema.sql`.

**Tech Stack:** React 19, Vite 8, Tailwind 4, Recharts 3, Express 5, `@google/genai`, Supabase JS, exceljs, Vitest (новый, только для тестов).

**Spec:** `docs/superpowers/specs/2026-11-17-zakupki-i-ceny-design.md`

## Global Constraints

- Все суммы в ₽; цена за единицу = сумма строки **с НДС** / количество в базовой единице.
- Базовые единицы товара — фиксированный список: `кг`, `л`, `шт`, `м`, `уп`.
- Новые таблицы — RLS только для `authenticated` через `(select private.is_member())`, `revoke all ... from anon`, таблицы в `supabase_realtime`.
- Миграции применяются к проекту Supabase `etgvwwcxbtlqeqgnusle` (инструмент `apply_migration`) и дублируются в `supabase/schema.sql`, чтобы новый проект поднимался одним файлом.
- Демо-режим (`localStore.ts`) поддерживает все новые методы `DataStore`.
- Распознавание не медленнее текущего более чем на 2 с; бюджет сервера — 82 с (не менять).
- Позиции у расхода необязательны: услуги и ручной ввод сохраняются как раньше.
- Визуальный стиль: без цветных «пилюль» и толстых акцентных полос; суммы, даты, цены — класс `num`; семантика цветов: `text-ok` / `text-warn` / `text-bad`.
- Интерфейс и сообщения — на русском.
- Каждая задача заканчивается рабочим приложением: `npx tsc --noEmit`, `npm test`, `npx vite build` проходят; коммит и `git push` (Render пересобирается сам).

## Review Focus

1. **Редактирование существующего расхода не находит дублем сам себя** и не сравнивает цену с собственными строками — во всех проверках исключается `excludeExpenseId`. Тесты: задачи 2 и 7.
2. **Строка с нулевым или пустым количеством** не даёт цену `Infinity`/`NaN` и не участвует в сравнении цен и графиках. Тест: задача 7.
3. **Excel с формулами, объединёнными ячейками и несколькими листами** превращается в текст со значениями формул (а не с самими формулами) и с именами листов; пустой файл — понятная ошибка. Тест: задача 4.
4. **Удаление товара, который используется в позициях,** не падает с ошибкой базы, а говорит «Товар используется в N позициях — объедините его с другим». Тест: задача 8 (`describeError` для `23503` на `expense_items_product_id_fkey`).
5. **Старый расход без позиций и без статуса покупки** (все 235 существующих) отображается и выгружается в Excel без пустых «undefined»/«NaN»: статус «—», лист «Позиции» без его строк. Тест: задача 9 (`buildPositionsRows` на расходе без позиций).

---

### Task 1: Тестовый стенд и быстрые исправления

**Files:**
- Modify: `package.json` (devDependency `vitest`, скрипт `"test": "vitest run"`), `tsconfig.json` (`include` += `"server"`)
- Create: `src/lib/filters.test.ts`, `server/confidence.ts`, `server/confidence.test.ts`
- Modify: `src/lib/filters.ts`, `src/App.tsx`, `src/components/Dashboard.tsx`, `server.ts`

**Interfaces:**
- Produces: `recentFirst(expenses: Expense[]): Expense[]` в `src/lib/filters.ts` — копия, отсортированная по `createdAt` убыв.
- Produces: `finalConfidence(model: Confidence, signals: { vendorEmpty: boolean; dateDefaulted: boolean; linesMismatch: boolean; unclearNewProduct: boolean }): Confidence` в `server/confidence.ts`.

- [ ] **Step 1: Тесты**

```ts
// src/lib/filters.test.ts
test('recentFirst сортирует по времени добавления, а не по дате документа', () => {
  const a = exp({ id: 'a', date: '2026-11-20', createdAt: 1 });
  const b = exp({ id: 'b', date: '2026-10-01', createdAt: 2 });
  expect(recentFirst([a, b]).map((e) => e.id)).toEqual(['b', 'a']);
});
// server/confidence.test.ts
test('high без сигналов остаётся high', () => expect(finalConfidence('high', none)).toBe('high'));
test('любой сигнал понижает high до medium', () => expect(finalConfidence('high', { ...none, vendorEmpty: true })).toBe('medium'));
test('low модели не повышается', () => expect(finalConfidence('low', none)).toBe('low'));
test('два и более сигнала дают low', () => expect(finalConfidence('high', { ...none, vendorEmpty: true, dateDefaulted: true })).toBe('low'));
```

`exp()` — локальная фабрика расхода с полями по умолчанию; `none` — все сигналы `false`.

- [ ] **Step 2:** `npm test` — FAIL (функций нет).
- [ ] **Step 3: Реализация.** `recentFirst`; `finalConfidence` (один сигнал → не выше `medium`, два и более → `low`, никогда не повышает). В `server.ts` `sanitizeItems` вычисляет сигналы: `vendorEmpty` — пустой контрагент, `dateDefaulted` — дата не прошла проверку и подставлена сегодняшняя; `linesMismatch` и `unclearNewProduct` пока `false` (задача 6). Промпт: «high — только если сумма, дата и контрагент прочитаны однозначно, без догадок».
- [ ] **Step 4:** «Последние операции» (`App.tsx`, `Registry` с `limit`) получают `recentFirst(filteredExpenses)`; полный реестр остаётся по дате документа. Из `Dashboard.tsx` удаляется показатель «Средний чек» (сетка — три показателя до задачи 9).
- [ ] **Step 5:** `npm test` — PASS; `npx tsc --noEmit`; в браузере: последний добавленный расход наверху «Последних операций».
- [ ] **Step 6:** Коммит «Сортировка последних операций, без среднего чека, честная уверенность ИИ», push.

### Task 2: Поиск дублей

**Files:**
- Create: `src/lib/duplicates.ts`, `src/lib/duplicates.test.ts`, `src/components/ExpenseView.tsx`, `src/components/Duplicates.tsx`
- Modify: `src/types.ts`, `src/lib/supabase.ts`, `src/lib/localStore.ts`, `src/components/ReviewDialog.tsx`, `src/components/Registry.tsx`, `src/App.tsx`, `supabase/schema.sql`
- Migration: `duplicate_dismissals`

**Interfaces:**
- Produces (`src/lib/duplicates.ts`):
  - `normalizeVendor(s: string): string` — нижний регистр, без кавычек «»"', без ОПФ (`ооо`, `оао`, `зао`, `пао`, `ао`, `ип`), схлопнутые пробелы.
  - `pairKey(a: string, b: string): string` — `"min|max"`.
  - `isDuplicate(a: DupFields, b: DupFields): boolean`, где `DupFields = Pick<Expense, 'vendor' | 'amount' | 'date' | 'documentNumber'>`.
  - `findMatchesFor(d: DupFields, expenses: Expense[], excludeExpenseId?: string): Expense[]`.
  - `findDuplicatePairs(expenses: Expense[], dismissed: Set<string>): Array<[Expense, Expense]>`.
- Produces (`DataStore`): `subscribeDismissals(cb: (keys: Set<string>) => void, onError): () => void`, `dismissDuplicate(a: string, b: string): Promise<void>`.
- Produces: `<ExpenseView expense={Expense} onClose />` — карточка расхода только для чтения поверх любого окна (`Modal` с `z-50`); переиспользуется в задачах 6–8.

- [ ] **Step 1: Тесты** (`duplicates.test.ts`)

```ts
test('одинаковый номер у одного контрагента — дубль, даже при разной сумме', () =>
  expect(isDuplicate(d('ООО «Комус»', 100, '2026-11-01', '5531'), d('комус', 120, '2026-11-03', '5531'))).toBe(true));
test('разные номера при одинаковой сумме и дате — не дубль', () =>
  expect(isDuplicate(d('Комус', 100, '2026-11-01', '1'), d('Комус', 100, '2026-11-01', '2'))).toBe(false));
test('без номера: контрагент + сумма + дата', () =>
  expect(isDuplicate(d('ИП Петров', 4500, '2026-11-14', ''), d('Петров', 4500, '2026-11-14', '128'))).toBe(true));
test('findMatchesFor не находит сам расход при редактировании', () =>
  expect(findMatchesFor(e1, [e1], e1.id)).toEqual([]));
test('отклонённая пара не возвращается', () =>
  expect(findDuplicatePairs([e1, e1copy], new Set([pairKey(e1.id, e1copy.id)]))).toEqual([]));
```

- [ ] **Step 2:** `npm test` — FAIL.
- [ ] **Step 3: Реализация `duplicates.ts`** по правилам из спецификации (раздел «Дубли»).
- [ ] **Step 4: Миграция `duplicate_dismissals`:** `expense_a uuid`, `expense_b uuid`, оба `references expenses(id) on delete cascade`, `check (expense_a < expense_b)`, pk `(expense_a, expense_b)`, `created_at`; RLS select/insert/delete — участники. Методы хранилища в обеих реализациях; `dismissDuplicate` упорядочивает id сам.
- [ ] **Step 5: Экран проверки.** Под каждым черновиком, если `findMatchesFor` что-то нашёл (по сохранённым расходам и по другим черновикам того же пакета): строка `text-warn` «Похоже, это уже есть: {vendor} · {сумма} · {дата} · № {номер}» и кнопка «Открыть» → `ExpenseView`. Сохранение не блокируется.
- [ ] **Step 6: Реестр.** Над таблицей полного реестра, если пар > 0: «Возможные дубли: N» → раскрывает `Duplicates`: по каждой паре две строки, «Открыть» у каждой, «Удалить» у каждой (через существующий `Confirm`), «Не дубль».
- [ ] **Step 7:** `npm test`, `tsc`, сборка; в браузере (демо-режим): сохранить расход дважды → предупреждение; в реестре появляется пара; «Не дубль» убирает её навсегда.
- [ ] **Step 8:** Коммит «Поиск дублей: предупреждение при сохранении и список в реестре», push.

### Task 3: Статус покупки

**Files:**
- Create: `src/components/Purchases.tsx`
- Modify: `src/types.ts`, `src/lib/supabase.ts`, `src/lib/localStore.ts`, `src/components/ReviewDialog.tsx`, `src/components/Registry.tsx`, `src/App.tsx`, `src/lib/excel.ts`, `src/lib/filters.ts`, `src/lib/filters.test.ts`, `supabase/schema.sql`
- Migration: колонки `expenses`

**Interfaces:**
- Produces (`Expense`/`ExpenseInput`): `isPurchase: boolean`, `receivedAt: number | null`, `receivedByEmail: string`.
- Produces (`DataStore`): `setReceived(id: string, received: boolean): Promise<void>` — ставит/снимает `receivedAt` и почту текущего пользователя.
- Produces (`filters.ts`): `awaitingReceipt(expenses: Expense[], today?: string): Array<{ expense: Expense; waitingDays: number }>` — только `isPurchase && receivedAt === null`, по убыванию `waitingDays` (от даты документа).
- Produces: в `App` вид `'purchases'` с пунктом меню «Закупки»; `Purchases` пока с одной вкладкой «Ожидают получения» (вкладка «Товары» — задача 8).

- [ ] **Step 1: Тест** `awaitingReceipt`: полученные и не-покупки исключены; `waitingDays` для документа от `2026-11-03` при `today = '2026-11-17'` = 14; сортировка по убыванию.
- [ ] **Step 2:** `npm test` — FAIL.
- [ ] **Step 3: Миграция:** `is_purchase boolean not null default false`, `received_at timestamptz`, `received_by_email text not null default '' check (char_length(...) <= 254)`. Маппинг полей в `supabase.ts`; `localStore` — значения по умолчанию для старых записей при загрузке.
- [ ] **Step 4:** `awaitingReceipt`; `setReceived` в обоих хранилищах (облачное берёт почту из сессии).
- [ ] **Step 5: Интерфейс.** Галочка «Покупка товара» в черновике и карточке. Вкладка «Ожидают получения»: заголовок «Ожидают получения · N покупок · сумма», строки `дата · поставщик · назначение · сумма · ждём N дней` (> 14 дней — `text-warn`), кнопка «Получено». В реестре — столбец «Статус»: «—» / «Ожидает» / «Получено 18.11 · почта»; снятие отметки — из карточки расхода (режим `edit` в `ReviewDialog`).
- [ ] **Step 6: Excel.** В «Детальный реестр» — столбцы «Покупка» (да/пусто) и «Получено» (дата или пусто).
- [ ] **Step 7:** Проверки и браузер: отметить покупку → появилась во вкладке → «Получено» → исчезла, в реестре статус с датой.
- [ ] **Step 8:** Коммит «Статус покупки и список ожидающих получения», push.

### Task 4: Загрузка счетов в Excel

**Files:**
- Create: `server/xlsx.ts`, `server/xlsx.test.ts`
- Modify: `server.ts`, `src/lib/extract.ts`, `src/components/Capture.tsx`, `src/types.ts`, `src/lib/format.ts`, `supabase/schema.sql`
- Migration: `source_type` += `'excel'`

**Interfaces:**
- Produces: `xlsxToText(buf: Buffer, limits?: { maxRows: number; maxChars: number }): Promise<string>` — по умолчанию 2000 строк / 200 000 символов; каждый лист начинается строкой `# Лист: {имя}`, ячейки строки через `\t`, значения формул — результат, даты — `ДД.ММ.ГГГГ`, пустые строки пропускаются. Пустая книга → `throw new Error('empty')`.
- Produces: `SourceType` += `'excel'`, `SOURCE_LABEL.excel = 'Excel'`.

- [ ] **Step 1: Тесты** (книга собирается в тесте через exceljs): формула `=B2*C2` даёт число, а не текст формулы; два листа — оба заголовка; объединённые ячейки не дублируют значение больше одного раза в строке; пустая книга бросает `empty`; обрезка по `maxRows`.
- [ ] **Step 2:** `npm test` — FAIL.
- [ ] **Step 3:** Реализация `xlsxToText`.
- [ ] **Step 4: Сервер.** MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` разрешён; такой файл не уходит в `inlineData`, а превращается в текст и передаётся как «Содержимое Excel-счёта». `.xls` (`application/vnd.ms-excel`) → 415 «Сохраните файл как .xlsx»; `empty` → 400 «В таблице нет данных».
- [ ] **Step 5: Клиент.** `ACCEPTED_MIME` и `accept` у поля файла дополняются xlsx; `sourceType` для него — `'excel'`; подпись зоны загрузки «PDF, JPG, PNG, WEBP, XLSX». Миграция расширяет `check` на `source_type`.
- [ ] **Step 6:** Проверки; ручная проверка: собрать .xlsx-счёт скриптом и прогнать через тестовый сервер без входа (как в предыдущих проверках, порт 3100).
- [ ] **Step 7:** Коммит «Загрузка счетов в формате Excel», push.

### Task 5: Справочник товаров и позиции — данные

**Files:**
- Modify: `src/types.ts`, `src/lib/supabase.ts`, `src/lib/localStore.ts`, `supabase/schema.sql`
- Migration: `products`, `expense_items`

**Interfaces:**
- Produces (`types.ts`):
  - `type BaseUnit = 'кг' | 'л' | 'шт' | 'м' | 'уп'`
  - `interface Product { id: string; name: string; unit: BaseUnit; aliases: string[]; createdAt: number }`
  - `interface ExpenseLine { id: string; expenseId: string; position: number; rawName: string; productId: string | null; docQuantity: number | null; docUnit: string; baseQuantity: number | null; lineTotal: number }` (`productId === null` — «не товар»).
  - `ExpenseInput.lines?: Omit<ExpenseLine, 'id' | 'expenseId'>[]` — для `addExpenses`/`updateExpense` (замена позиций целиком).
- Produces (`DataStore`): `subscribeProducts`, `subscribeLines(cb: (lines: ExpenseLine[]) => void, onError)`, `addProduct(p: { name: string; unit: BaseUnit; aliases?: string[] }): Promise<Product>`, `updateProduct(id, patch)`, `deleteProduct(id)`, `mergeProducts(fromId: string, intoId: string): Promise<void>` (переносит позиции и алиасы, удаляет `fromId`).

- [ ] **Step 1: Миграция.** `products`: `id uuid pk`, `name text` 1–120, уникальный индекс по `lower(name)`, `unit text check (unit in (...))`, `aliases text[] not null default '{}'`, `created_by`, `created_at`. `expense_items`: поля как в интерфейсе, `expense_id ... on delete cascade`, `product_id ... on delete restrict`, `line_total numeric(14,2) check (line_total >= 0)`, `base_quantity numeric(14,3) check (base_quantity > 0)` (null допустим). RLS, realtime, `schema.sql`.
- [ ] **Step 2:** Методы в `supabase.ts` (позиции расхода пишутся после вставки расхода; `updateExpense` с `lines` удаляет старые и вставляет новые; `mergeProducts` — `update expense_items set product_id`, слияние `aliases`, `delete`) и в `localStore.ts`.
- [ ] **Step 3:** Проверка прав в базе тем же SQL-сценарием, что раньше: участник видит и пишет `products`/`expense_items`, посторонний — нет; удаление товара с позициями → `23503`.
- [ ] **Step 4:** `tsc`, сборка; коммит «Справочник товаров и позиции: база и хранилище», push.

### Task 6: Распознавание позиций и экран проверки

**Files:**
- Create: `server/lines.ts`, `server/lines.test.ts`, `src/components/LinesEditor.tsx`
- Modify: `server.ts`, `src/lib/extract.ts`, `src/types.ts` (`Draft.lines`), `src/components/ReviewDialog.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `Product`, `ExpenseLine`, `BaseUnit` (задача 5); `finalConfidence` (задача 1).
- Produces (`server/lines.ts`): `sanitizeLines(raw: unknown, productIds: Set<string>): SanitizedLine[]`, где `SanitizedLine = { rawName: string; docQuantity: number | null; docUnit: string; baseQuantity: number | null; lineTotal: number; productId: string | null; notGoods: boolean; suggestedName: string; suggestedUnit: BaseUnit | '' }`; `linesMismatch(lines: SanitizedLine[], amount: number): boolean` (|Σ − итог| > 1 ₽).
- Produces (`Draft`): `lines: DraftLine[]`, `DraftLine = { key: string; rawName: string; productId: string | null; notGoods: boolean; newProduct?: { name: string; unit: BaseUnit }; docQuantity: string; docUnit: string; baseQuantity: string; lineTotal: string }`.
- Produces: `extractExpenses(input, categories, products: Product[], accessToken)` — справочник передаётся полем `products` (`id`, `name`, `unit`, до 3 алиасов).

- [ ] **Step 1: Тесты `server/lines.ts`:** неизвестный `productId` → `null` и сохраняется предложение; `baseQuantity <= 0` → `null`; отрицательная `lineTotal` отбрасывает строку; `linesMismatch` true при расхождении 1,50 ₽ и false при 0,40 ₽; пустой список строк → `linesMismatch === false`.
- [ ] **Step 2:** `npm test` — FAIL.
- [ ] **Step 3: Сервер.** Схема ответа: у документа массив `lines` (поля из `SanitizedLine` без `notGoods`-логики на клиенте; `productId` — `enum` из id справочника плюс пустая строка). Промпт: правила из спецификации (раздел «Распознавание»: суммы строк с НДС, распределение НДС по ставке строки, `baseQuantity` в единице товара, `notGoods` для услуг/доставки/возвратной тары). Сигналы `linesMismatch` и `unclearNewProduct` (новый товар без `suggestedUnit`) подключаются к `finalConfidence`. Замерить время на тестовом PDF до и после; рост > 2 с — сократить передаваемый справочник (без алиасов).
- [ ] **Step 4: `LinesEditor`.** Таблица под полями черновика: «Позиция в документе · Товар · Кол-во · Сумма · Цена/ед.»; выбор товара — поле поиска по названию и алиасам + «+ Новый товар» (название/единица из предложения ИИ) + «Не товар»; строки можно добавить/удалить; предупреждение «Позиции не сходятся с итогом на N ₽». Галочка «Покупка товара» включается автоматически, если есть строка с товаром, и не включается, если её сняли вручную.
- [ ] **Step 5: Сохранение.** `App.saveDrafts`: сначала создаются новые товары (`addProduct`), их id подставляются в строки; `rawName` строки добавляется в `aliases` товара, если его там нет; затем `addExpenses` с `lines`. Режим `edit` открывает расход с его позициями.
- [ ] **Step 6:** Проверки; ручная проверка на тестовом PDF и Excel: строки распознаны, новый товар создаётся, при повторной загрузке похожего счёта товар подставляется сам.
- [ ] **Step 7:** Коммит «Распознавание позиций и привязка к справочнику», push.

### Task 7: Сравнение цен

**Files:**
- Create: `src/lib/prices.ts`, `src/lib/prices.test.ts`, `src/components/PriceHint.tsx`
- Modify: `src/components/LinesEditor.tsx`

**Interfaces:**
- Consumes: `ExpenseLine`, `Expense`.
- Produces (`src/lib/prices.ts`):
  - `interface PricePoint { expenseId: string; productId: string; vendor: string; date: string; documentNumber: string; unitPrice: number }`
  - `pricePoints(lines: ExpenseLine[], expenses: Expense[]): PricePoint[]` — только строки с товаром, `baseQuantity > 0`, `unitPrice = lineTotal / baseQuantity` с округлением до 4 знаков.
  - `priceInsight(productId: string, unitPrice: number, date: string, points: PricePoint[], excludeExpenseId?: string): { last: PricePoint | null; best90: PricePoint | null; deltaPct: number | null }` — `last`: самая поздняя точка с датой документа **строго раньше** `date` (точки с той же датой документа не учитываются); `best90`: минимальная цена за 90 дней до `date`, только если ниже `unitPrice`; `deltaPct` относительно `last`.
- Produces: `<PriceHint insight onOpen={(expenseId) => void} />`.

- [ ] **Step 1: Тесты:** цена за мешок и за кг сравниваются по базовой единице (29 ₽/кг против 27,50 ₽/кг → `deltaPct ≈ 5.45`); точки самого редактируемого расхода исключены; точка с более поздней датой документа не становится `last`; `best90` не показывается, если текущая цена ниже; `baseQuantity` 0 или `null` не создаёт точку; без истории — все `null`.
- [ ] **Step 2:** `npm test` — FAIL.
- [ ] **Step 3:** Реализация `prices.ts`.
- [ ] **Step 4: `PriceHint`** под строкой: «дороже на 5,5%: в прошлый раз 27,50 ₽/кг · Мельница №1 · 03.11 · счёт 512 [Открыть]» (`text-warn` при росте > 1%, нейтрально иначе) и «лучшая за 90 дней: …» при наличии. «Открыть» → `ExpenseView` поверх черновика, черновик не теряется.
- [ ] **Step 5:** Проверки; ручная проверка: два счёта на один товар с разной ценой.
- [ ] **Step 6:** Коммит «Сравнение цен с прошлыми закупками», push.

### Task 8: Вкладка «Товары» и карточка товара

**Files:**
- Create: `src/components/Products.tsx`, `src/components/ProductCard.tsx`
- Modify: `src/components/Purchases.tsx`, `src/lib/prices.ts`, `src/lib/prices.test.ts`, `src/lib/supabase.ts`

**Interfaces:**
- Consumes: `pricePoints`, `PricePoint` (задача 7), методы товаров (задача 5).
- Produces (`prices.ts`): `productSummaries(products: Product[], points: PricePoint[], lines: ExpenseLine[], from: string, to: string): Array<{ product: Product; last: PricePoint | null; changePct: number | null; boughtQuantity: number; boughtTotal: number }>`, где `changePct` — последняя цена к предыдущей закупке.

- [ ] **Step 1: Тест `productSummaries`:** количество и сумма — только в периоде; `changePct` — по двум последним точкам; товар без закупок — `last: null`, `changePct: null`.
- [ ] **Step 2: Тест `describeError`:** `{ code: '23503', details: '... expense_items_product_id_fkey ...' }` → «Товар используется в позициях — объедините его с другим товаром вместо удаления».
- [ ] **Step 3:** `npm test` — FAIL; реализация обоих.
- [ ] **Step 4: Вкладка «Товары»:** таблица «Товар · Ед. · Последняя цена · Поставщик · Изменение · Куплено за период»; сортировка по изменению цены по клику на заголовок; поиск по названию.
- [ ] **Step 5: `ProductCard`:** график цены за единицу во времени (Recharts `ScatterChart`, ось Y — ₽/ед., цвет точки — поставщик, подсказка с датой и документом), таблица закупок со ссылками «Открыть» (`ExpenseView`), правка названия/единицы/алиасов, «Объединить с…» (выбор товара + `Confirm`), удаление.
- [ ] **Step 6:** Проверки; браузер: карточка с двумя закупками, объединение двух товаров переносит позиции.
- [ ] **Step 7:** Коммит «Справочник товаров: список, карточка, график цены, объединение», push.

### Task 9: Дашборд закупщика и Excel-отчёт

**Files:**
- Modify: `src/components/Dashboard.tsx`, `src/lib/filters.ts`, `src/lib/filters.test.ts`, `src/lib/excel.ts`, `src/App.tsx`
- Create: `src/lib/excel.test.ts`

**Interfaces:**
- Consumes: `normalizeVendor` (2), `awaitingReceipt` (3), `pricePoints`, `productSummaries` (7–8).
- Produces (`filters.ts`): `previousPeriod(f: Filter, now?: Date): { from: string; to: string } | null` (для «Всё время» — `null`); `totalsByVendor(expenses: Expense[], limit: number): Array<{ vendor: string; total: number; count: number }>`; `timelineByCategory(expenses, f): { granularity; buckets: Array<{ key: string } & Record<string /*categoryId*/, number>> }`.
- Produces (`excel.ts`): `buildPositionsRows(expenses: Expense[], lines: ExpenseLine[], products: Product[]): Array<(string | number | Date)[]>`.

- [ ] **Step 1: Тесты:** `previousPeriod` для «Текущий месяц» в ноябре — весь октябрь; для «Квартал» — предыдущий квартал; `totalsByVendor` объединяет «ООО Комус» и «Комус» через `normalizeVendor`, показывает первое встреченное написание; `buildPositionsRows` на расходе без позиций возвращает `[]`, на строке «не товар» — строку с пустым товаром и ценой.
- [ ] **Step 2:** `npm test` — FAIL; реализация.
- [ ] **Step 3: Показатели:** «Расходы за период» + «к прошлому периоду: +12,4%» (нейтральный цвет); «Закупки в пути» — N · сумма, клик → «Закупки»; «Подорожало» — число товаров с `changePct > 1` среди купленных в периоде, клик → «Товары» с сортировкой по росту; «Топ-направление».
- [ ] **Step 4: Графики:** «Расходы по времени» — сложенные столбики по направлениям, легенда-фильтр (клик переключает направление в `filter.categoryIds`); «Доли направлений» — без изменений; «Топ-10 поставщиков» — горизонтальные полосы; «Рост цен» — топ-5 товаров «было → стало, %» со ссылкой в карточку товара. На ширине телефона графики в одну колонку.
- [ ] **Step 5: Excel:** лист «Позиции» (дата, поставщик, № документа, товар, кол-во, ед., сумма, цена/ед.) из `buildPositionsRows` по текущей выборке; формат ₽ как на других листах.
- [ ] **Step 6:** Проверки; браузер на демо-данных и на реальной базе: все блоки заполнены, клики ведут куда нужно; выгрузка Excel открывается, лист «Позиции» есть.
- [ ] **Step 7:** Обновить `README.md` (разделы «Закупки», «Товары», Excel-загрузка); коммит «Дашборд закупщика и лист позиций в Excel», push.
