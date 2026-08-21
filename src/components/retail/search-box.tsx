"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { searchRetailProducts } from "@/lib/mock/retail-products";

export function SearchBox({
  className,
  inputClassName,
  placeholder = "Search products",
  onNavigate,
}: {
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = query.trim() ? searchRetailProducts(query, 6) : [];

  // Close the dropdown when focus/clicks move elsewhere.
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    setHighlighted(-1);
    onNavigate?.();
    router.push(href);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (highlighted >= 0 && suggestions[highlighted]) {
      go(`/shop/product/${suggestions[highlighted].slug}`);
      return;
    }
    if (!query.trim()) return;
    go(`/shop/search?q=${encodeURIComponent(query.trim())}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlighted(-1);
    }
  }

  return (
    <div ref={containerRef} className={className}>
      <form onSubmit={submit} className="relative">
        <div className="flex w-full items-center gap-2 rounded-full border border-neutral-200 px-3 py-1.5 text-sm text-neutral-500 focus-within:border-rose-400">
          <Search className="h-4 w-4 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setHighlighted(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label="Search products"
            aria-expanded={open && suggestions.length > 0}
            aria-autocomplete="list"
            role="combobox"
            aria-controls="search-suggestions"
            className={
              inputClassName ??
              "w-full bg-transparent text-neutral-800 outline-none placeholder:text-neutral-400"
            }
          />
        </div>

        {open && query.trim() !== "" && (
          <ul
            id="search-suggestions"
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg"
          >
            {suggestions.length === 0 ? (
              <li className="px-3 py-3 text-sm text-neutral-500">
                No matches for &ldquo;{query}&rdquo;
              </li>
            ) : (
              suggestions.map((product, i) => (
                <li key={product.id} role="option" aria-selected={i === highlighted}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlighted(i)}
                    onClick={() => go(`/shop/product/${product.slug}`)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                      i === highlighted ? "bg-rose-50" : "hover:bg-neutral-50"
                    }`}
                  >
                    <Image
                      src={product.images[0]}
                      alt=""
                      width={32}
                      height={40}
                      className="h-10 w-8 shrink-0 rounded object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-neutral-800">{product.name}</span>
                      <span className="block text-xs text-neutral-400">
                        {product.brand} &middot; {product.subcategory}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium text-neutral-900">
                      {formatPrice(product.price)}
                    </span>
                  </button>
                </li>
              ))
            )}

            {suggestions.length > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => go(`/shop/search?q=${encodeURIComponent(query.trim())}`)}
                  className="w-full border-t border-neutral-100 px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-neutral-50"
                >
                  See all results for &ldquo;{query}&rdquo;
                </button>
              </li>
            )}
          </ul>
        )}
      </form>
    </div>
  );
}
