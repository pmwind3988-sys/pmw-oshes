export interface SurveyChoiceLoaders {
  getSharePointChoices: (listTitle: string, fieldName: string) => Promise<string[]>;
  getFilteredListChoices: (
    listTitle: string,
    valueColumn: string,
    filterColumn?: string,
    filterValue?: string,
  ) => Promise<string[]>;
}

interface ChoiceSource {
  list?: string;
  column?: string;
}

interface FilteredListSource {
  list?: string;
  valueColumn?: string;
  filterColumn?: string;
  filterValue?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneSurveyJson<T extends Record<string, unknown>>(surveyJson: T): T {
  return JSON.parse(JSON.stringify(surveyJson)) as T;
}

function assignChoices(element: Record<string, unknown>, choices: string[]): void {
  if (choices.length > 0) element.choices = choices;
}

export async function enrichSurveyJsonChoices<T extends Record<string, unknown>>(
  surveyJson: T,
  loaders: SurveyChoiceLoaders,
): Promise<T> {
  const clone = cloneSurveyJson(surveyJson);
  const pending: Promise<void>[] = [];

  const enqueue = (
    element: Record<string, unknown>,
    loadChoices: Promise<string[]>,
  ): void => {
    pending.push(
      loadChoices
        .then((choices) => assignChoices(element, choices))
        .catch(() => {}),
    );
  };

  const walk = (elements: unknown): void => {
    if (!Array.isArray(elements)) return;

    for (const element of elements) {
      if (!isRecord(element)) continue;

      const src = element.spChoicesSource as ChoiceSource | undefined;
      if (src?.list && src?.column) {
        enqueue(element, loaders.getSharePointChoices(src.list, src.column));
      }

      const filteredSource = element.spFilteredListSource as FilteredListSource | undefined;
      if (filteredSource?.list && filteredSource?.valueColumn) {
        enqueue(
          element,
          loaders.getFilteredListChoices(
            filteredSource.list,
            filteredSource.valueColumn,
            filteredSource.filterColumn,
            filteredSource.filterValue,
          ),
        );
      }

      if ((element.type === "matrixdynamic" || element.type === "dynamicmatrix") && Array.isArray(element.columns)) {
        for (const column of element.columns) {
          if (!isRecord(column)) continue;

          const columnSource = column.choicesSource as ChoiceSource | undefined;
          if (columnSource?.list && columnSource?.column) {
            enqueue(column, loaders.getSharePointChoices(columnSource.list, columnSource.column));
          }

          const columnFilteredSource = column.filteredListSource as FilteredListSource | undefined;
          if (columnFilteredSource?.list && columnFilteredSource?.valueColumn) {
            enqueue(
              column,
              loaders.getFilteredListChoices(
                columnFilteredSource.list,
                columnFilteredSource.valueColumn,
                columnFilteredSource.filterColumn,
                columnFilteredSource.filterValue,
              ),
            );
          }
        }
      }

      walk(element.elements);
      walk(element.templateElements);
    }
  };

  const pages = Array.isArray(clone.pages) ? clone.pages : [];
  for (const page of pages) {
    if (isRecord(page)) walk(page.elements);
  }

  await Promise.all(pending);
  return clone;
}
