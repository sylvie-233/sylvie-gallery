/**
 * 浮层相关的无样式 Hook。
 *
 * 适用于灯箱、登录弹窗、公告详情等需要「锁滚动 + 键盘导航」的场景，
 * 前台与后台都在复用。Hook 内部直接访问 `document` / `window`，
 * 因此只能在客户端组件中调用：Next.js App Router 下需位于 `"use client"`
 * 组件内，或在 `useEffect` 中调用；不可在 Server Component 渲染期间执行。
 */
import { useEffect, useRef } from 'react';

/**
 * 浮层打开时锁定页面滚动，关闭或组件卸载时恢复原有的 `body.style.overflow`。
 *
 * 通过 `active` 参数由浮层的 `open` 状态驱动，避免浮层未打开时也加锁；
 * 同页面多个浮层先后打开时，各自保存并在清理时恢复自己进入前的值。
 *
 * @param active 是否处于锁定状态，默认 `true`
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

/** 浮层键盘导航回调；均可省略，未提供的按键不响应。 */
export interface NavigationKeys {
  /** 按下 `Escape` 时触发，通常用于关闭浮层。 */
  onEscape?: () => void;
  /** 按下 `ArrowLeft` 时触发，通常用于上一张/上一页。 */
  onPrev?: () => void;
  /** 按下 `ArrowRight` 时触发，通常用于下一张/下一页。 */
  onNext?: () => void;
}

/**
 * 监听全局 `keydown`，把 Esc / 左右方向键映射为浮层操作。
 *
 * 回调保存在 ref 中，父组件传入内联函数也不会反复解绑/绑定监听；
 * 仅在 `enabled` 变化时重新挂载监听。注意监听绑定在 `document` 上，
 * 多个浮层同时启用时都会收到事件，调用方应通过 `enabled` 保证只有顶层浮层响应。
 *
 * @param keys 按键回调集合
 * @param enabled 是否启用监听，默认 `true`
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
