/**
 * 后台列表搜索框。
 *
 * 采用受控输入：输入时只调用 `onChange`，不会自动搜索；回车或点击
 * 「搜索」按钮（表单提交）才触发 `onSearch`，便于调用方在此时重置页码。
 * 依赖后台全局类 `.seg` 与 `.btn` / `.btn-line` / `.btn-sm`。
 */
import { Search } from 'lucide-react';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  placeholder: string;
}

/**
 * 后台列表搜索框：回车或点「搜索」触发。
 *
 * @param value 当前输入值
 * @param onChange 输入变化回调
 * @param onSearch 提交搜索回调（表单 submit）
 * @param placeholder 输入框占位文案
 */
export function SearchBox({ value, onChange, onSearch, placeholder }: SearchBoxProps) {
  return (
    <form
      className="seg"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-t3"
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="pl-9"
          style={{ minWidth: 210 }}
        />
      </div>
      <button type="submit" className="btn btn-line btn-sm">
        搜索
      </button>
    </form>
  );
}
