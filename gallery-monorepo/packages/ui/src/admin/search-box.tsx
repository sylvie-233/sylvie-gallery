import { Search } from 'lucide-react';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  placeholder: string;
}

/** 后台列表搜索框：回车或点「搜索」触发。 */
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
