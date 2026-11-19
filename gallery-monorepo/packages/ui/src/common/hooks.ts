import { useEffect, useRef } from 'react';

/**
 * 打开浮层时锁定页面滚动，关闭或卸载时恢复原有 overflow。
 * 使用 active 控制，便于由 `open` 状态驱动。
 */
export function useBodyScrollLock(active = true): void {
  useEffect(() => {
    if (!active) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

export interface NavigationKeys {
  onEscape?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

/**
 * 浮层键盘导航：Esc 关闭、左右方向键切换。
 * 回调通过 ref 保存，避免父组件内联函数导致事件反复绑定。
 */
export function useNavigationKeys(keys: NavigationKeys, enabled = true): void {
  const keysRef = useRef(keys);
  keysRef.current = keys;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      const handlers = keysRef.current;
      if (event.key === 'Escape') {
        handlers.onEscape?.();
      } else if (event.key === 'ArrowLeft') {
        handlers.onPrev?.();
      } else if (event.key === 'ArrowRight') {
        handlers.onNext?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled]);
}
