import { html, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";

export const remainder = Symbol("remaining ungrouped data");

// type ColumnConfig<T extends object, C extends keyof T> = {
//   value: C;
//   label?: string;
//   priority?: number;
//   renderCell?: (
//     value: T,
//     column: C,
//     rowIndex: number,
//   ) => TemplateResult<1> | string;
// };

/** Types acceptable as map keys. */
type GroupFunctionReturn = string | number | boolean | typeof remainder;

type GroupFunction<T extends object> = (datum: T) => GroupFunctionReturn;

/** Either a key of T, or a function deriving a value from T. */
type GroupResolvable<
  T extends object,
  G extends keyof T,
  GR extends G | GroupFunction<T>,
> = GR extends (datum: T) => infer K ? (datum: T) => K : G;

/**
 * Either a value of T, or a derived value from T.
 *
 * Typing `GR` as generic allows us to infer the return type, which means if our
 * deriving function return type is a union of literals, we can restrict the
 * group configs to only those matching the return types.
 */
type GroupKey<
  T extends object,
  G extends keyof T,
  GR extends G | GroupFunction<T>,
> = (GR extends (datum: T) => infer K ? K : T[G]) | typeof remainder;

type GroupConfig<
  T extends object,
  G extends keyof T,
  GR extends G | GroupFunction<T>,
> = {
  /**
   * Value of the group in either the source data, or returned by the deriving
   * function. This is distinct from the `value` field in the main function's
   * `groupBy` option, which is either a key used as an accessor for T, or a
   * function deriving a value from T.
   */
  value: GroupKey<T, G, GR>;
  label?: string;
  collapsible?: boolean;
  startCollapsed?: boolean;
  displayIfEmpty?: boolean;
  renderLabel?: (group: {
    group: GroupConfig<T, G, GR> | null;
    data: T[];
  }) => TemplateResult<1> | string;
};

type Comparator<T> = (a: T, b: T) => number;

const defaultWrapperRenderer = (contents: TemplateResult<1>) => contents;

const defaultLabelRenderer = <
  T extends object,
  G extends keyof T,
  GR extends G | GroupFunction<T>,
>({
  group,
  data,
}: {
  group: GroupConfig<T, G, GR> | null;
  data: T[];
}) =>
  html`${group?.value === remainder
    ? "ungrouped"
    : group?.label ?? group?.value}
  (${data.length})`;

const defaultGroupRenderer = (
  header: TemplateResult<1>,
  items: (TemplateResult<1> | null)[],
) =>
  html`<details open>
    <summary>${header}</summary>
    ${items}
  </details>`;

const defaultItemRenderer = (item: unknown) => html`${JSON.stringify(item)}`;

/**
 * A generic optionally-grouped list
 */
export function GroupedList<
  /** The type of a single datum */
  const T extends object,
  /** A single key of T, used for grouping */
  const G extends keyof T,
  /** Either a single key of T, or a function taking T and returning a value */
  const GR extends GroupResolvable<T, G, G | GroupFunction<T>>,
>({
  data,
  sortBy,
  groupBy,
  // columns,
  renderWrapper = defaultWrapperRenderer,
  renderItem = defaultItemRenderer,
  renderGroup = defaultGroupRenderer,
  key,
}: {
  data: T[];
  sortBy?: { by: keyof T; direction: "asc" | "desc" } | Comparator<T>;
  groupBy?: GR | { value: GR; groups?: GroupConfig<T, G, GR>[] };
  // columns?: false | { [k in keyof T]?: boolean | ColumnConfig<T, k> };
  renderWrapper?: (contents: TemplateResult<1>) => TemplateResult<1>;
  renderItem?: (
    item: T,
    // columns: ColumnConfig<T, keyof T>[],
    index: number,
  ) => TemplateResult<1> | null;
  renderGroup?: (
    header: TemplateResult<1>,
    items: (TemplateResult<1> | null)[],
    group: GroupConfig<T, G, GR> | null,
  ) => TemplateResult<1>;
  key?: keyof T;
}) {
  // Utility functions
  const renderData = (d: T[]) =>
    key
      ? (repeat(d, (v) => v[key], renderItem) as (TemplateResult<1> | null)[])
      : d.map((datum, index) => renderItem(datum, index));

  // Grouping

  // TODO (emma, 2024-02-25) look into performance with larger datasets, and
  // maybe memoize some of the calculations if need be
  let groups: null | { group: GroupConfig<T, G, GR> | null; data: T[] }[] =
    null;
  if (groupBy) {
    let groupKey: GR;
    if (typeof groupBy === "object") {
      groupKey = groupBy.value;
    } else {
      groupKey = groupBy;
    }

    const dataMap = new Map<GroupKey<T, G, GR>, T[]>();
    const configMap = new Map<GroupKey<T, G, GR>, GroupConfig<T, G, GR>>();

    // Ensure that defined group configs are ordered before the remainder group,
    // if it gets created
    if (typeof groupBy === "object" && groupBy.groups) {
      for (const groupConfig of groupBy.groups) {
        configMap.set(groupConfig.value, groupConfig);
      }
    }

    // If groups are explicitly listed, sort everything not in these into the
    // remainder group; otherwise, create whatever the groups we need
    const allowedKeys =
      typeof groupBy === "object"
        ? groupBy.groups?.map((group) => group.value)
        : undefined;

    // Iterate through data and sort it into groups
    for (const datum of data) {
      const resolvedKey = (
        typeof groupKey === "function"
          ? groupKey(datum)
          : datum[groupKey as unknown as G]
      ) as GroupKey<T, G, GR>;
      const shouldUseKey = allowedKeys?.includes(resolvedKey) ?? true;
      const key = shouldUseKey ? resolvedKey : remainder;

      if (!configMap.has(key)) {
        configMap.set(key, {
          // Defaults
          value: key,
          collapsible: false,
          renderLabel: defaultLabelRenderer,

          // Overrides from config
          ...(typeof groupBy === "object" &&
            groupBy.groups?.find((group) => group.value === key)),
        });
      }

      const dataForGroup = dataMap.get(key) ?? [];
      dataMap.set(key, [...dataForGroup, datum]);
    }

    groups = Array.from(configMap).map(([key, config]) => ({
      data: dataMap.get(key) ?? [],
      group: config,
    }));
  }

  // Sorting
  if (sortBy) {
    let sortFunction: Comparator<T>;
    if (typeof sortBy === "function") {
      sortFunction = sortBy;
    } else {
      // Default slightly-less-naïve-than-default sort function (does a
      // locale-aware comparison on the stringified values)
      sortFunction = (a: T, b: T) => {
        const [itemA, itemB] = [a[sortBy.by], b[sortBy.by]];
        let cmp = String(itemA).localeCompare(String(itemB));
        if (sortBy.direction === "desc") {
          cmp *= -1;
        }
        return cmp;
      };
    }
    if (groups) {
      for (const group of groups) {
        group.data.sort(sortFunction);
      }
    } else {
      data.sort(sortFunction);
    }
  }

  // Render
  return renderWrapper(
    html`${groups
      ? groups.map((group) =>
          group.data.length > 0 || group.group?.displayIfEmpty
            ? renderGroup(
                html`${group.group?.renderLabel?.(group) ??
                group.group?.label ??
                group.group?.value}`,
                renderData(group.data),
                group.group,
              )
            : null,
        )
      : renderData(data)}`,
  );
}
