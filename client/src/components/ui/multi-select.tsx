import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
  group?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  emptyText = 'No options available',
  className,
}: MultiSelectProps) {
  const selectedSet = React.useMemo(() => new Set(value), [value]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, MultiSelectOption[]>();
    for (const opt of options) {
      const key = opt.group || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(opt);
    }
    return Array.from(map.entries());
  }, [options]);

  const selectedLabels = React.useMemo(() => {
    const labelByValue = new Map(options.map((o) => [o.value, o.label]));
    return value.map((v) => labelByValue.get(v) || v);
  }, [options, value]);

  function toggle(v: string) {
    if (selectedSet.has(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }

  function clearAll(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1.5 text-left text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring',
            className
          )}
        >
          <div className="flex flex-1 flex-wrap gap-1">
            {value.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selectedLabels.map((label, i) => (
                <span
                  key={value[i]}
                  className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                >
                  {label}
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(value[i]);
                    }}
                    className="cursor-pointer rounded-sm hover:bg-muted"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </span>
              ))
            )}
          </div>
          {value.length > 0 && (
            <span
              role="button"
              tabIndex={-1}
              onClick={clearAll}
              className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className={cn(
            'z-50 max-h-80 w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-md border bg-background p-1 text-foreground shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out'
          )}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</div>
          ) : (
            grouped.map(([group, opts]) => (
              <div key={group || '_'}>
                {group && (
                  <div className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                    {group}
                  </div>
                )}
                {opts.map((opt) => {
                  const checked = selectedSet.has(opt.value);
                  return (
                    <div
                      key={opt.value}
                      role="option"
                      aria-selected={checked}
                      onClick={() => toggle(opt.value)}
                      className="flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded border',
                          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                        )}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="flex-1">{opt.label}</span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
