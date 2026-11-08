// Slug страницы места из EN-названия. Копия DiscoverIsraelNext/utils/slug.ts:
// адреса страниц уже в индексе поисковиков, алгоритмы должны совпадать.

export const toSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // диакритика: é → e
    .replace(/['’`]/g, '') // апостроф не разрывает слово: beit-shean
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Старый формат slug (пробелы → дефисы): старые ссылки ведут на новый адрес */
export const toLegacySlug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');
