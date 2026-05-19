import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/**
 * Lightweight Virtual List component for rendering large lists efficiently.
 * Only renders items visible in the viewport + a small buffer.
 * 
 * No external dependencies — pure React implementation.
 * 
 * Usage:
 *   <VirtualList
 *     items={filteredItems}
 *     itemHeight={64}
 *     containerHeight={600}
 *     renderItem={(item, index) => <ItemRow key={item.id} item={item} />}
 *   />
 */

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight?: number;
  overscan?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  emptyMessage?: string;
}

function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 5,
  renderItem,
  className = '',
  emptyMessage = 'Tidak ada data',
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(containerHeight || 500);

  // Measure container height if not provided
  useEffect(() => {
    if (containerHeight) {
      setHeight(containerHeight);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeight(entry.contentRect.height);
      }
    });

    observer.observe(container);
    setHeight(container.clientHeight);

    return () => observer.disconnect();
  }, [containerHeight]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const { visibleItems, startIndex, totalHeight, offsetY } = useMemo(() => {
    const totalHeight = items.length * itemHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length,
      Math.ceil((scrollTop + height) / itemHeight) + overscan,
    );
    const visibleItems = items.slice(startIndex, endIndex);
    const offsetY = startIndex * itemHeight;

    return { visibleItems, startIndex, totalHeight, offsetY };
  }, [items, itemHeight, scrollTop, height, overscan]);

  if (items.length === 0) {
    return (
      <div className={`flex items-center justify-center p-8 text-slate-400 font-semibold text-sm ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  // For small lists (< 100 items), render normally without virtualization
  if (items.length < 100) {
    return (
      <div className={`overflow-y-auto ${className}`} style={{ maxHeight: height }}>
        {items.map((item, index) => renderItem(item, index))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto ${className}`}
      style={{ height: containerHeight || '100%', maxHeight: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => renderItem(item, startIndex + index))}
        </div>
      </div>
    </div>
  );
}

export default VirtualList;
