/**
 * 后台筛选页签。
 *
 * 泛型 `T` 约束页签值类型，使 `onChange` 能保留联合类型的收窄能力。
 * 样式依赖后台全局类 `.tabs` 与选中态 `.on`；计数徽章使用 `bg-brand`。
 * 前台没有对应的页签组件，分类切换由各页面自行实现。
 */
interface TabItem<T extends string> {
  value: T;
  label: string;
  badge?: number;
}

interface TabsProps<T extends string> {
  items: Array<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
}

/**
 * 后台筛选页签：支持可选计数徽章。
 *
 * 徽章仅在 `badge` 为大于 0 的数字时显示；组件受控，不做内部选中状态。
 *
 * @param items 页签列表，每项包含值、文案与可选计数
 * @param value 当前选中的页签值
 * @param onChange 切换回调
 */
export function Tabs<T extends string>({ items, value, onChange }: TabsProps<T>) {
  return (
    <div className="tabs">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className={value === item.value ? 'on' : ''}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.badge !== undefined && item.badge > 0 ? (
            <span className="ml-1.5 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
              {item.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
