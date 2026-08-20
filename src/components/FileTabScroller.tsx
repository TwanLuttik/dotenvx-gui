import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

interface FileTabScrollerProps {
  children: React.ReactNode;
  activeId: string | null;
  className?: string;
}

export function FileTabScroller({
  children,
  activeId,
  className,
}: FileTabScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateOverflow = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const maxScroll = node.scrollWidth - node.clientWidth;
    setCanScrollLeft(node.scrollLeft > 1);
    setCanScrollRight(maxScroll - node.scrollLeft > 1);
  }, []);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;

    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    node.addEventListener("scroll", updateOverflow, { passive: true });
    window.addEventListener("resize", updateOverflow);

    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", updateOverflow);
      window.removeEventListener("resize", updateOverflow);
    };
  }, [children, updateOverflow]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || !activeId) return;
    const active = node.querySelector<HTMLElement>('[data-state="active"]');
    active?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [activeId]);

  const scrollBy = (direction: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: direction * 180, behavior: "smooth" });
  };

  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      {canScrollLeft && (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center bg-gradient-to-r from-background from-30% to-transparent pr-7">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="pointer-events-auto ml-0.5"
            onClick={() => scrollBy(-1)}
            aria-label="Show earlier files"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
        </div>
      )}

      <div
        ref={scrollerRef}
        className="overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={(event) => {
          if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
          event.currentTarget.scrollLeft += event.deltaY;
          event.preventDefault();
        }}
      >
        {children}
      </div>

      {canScrollRight && (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center bg-gradient-to-l from-background from-30% to-transparent pl-7">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="pointer-events-auto mr-0.5"
            onClick={() => scrollBy(1)}
            aria-label="Show more files"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
