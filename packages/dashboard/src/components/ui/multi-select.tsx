import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  /** Allow typing custom tags not in options. Default true. */
  creatable?: boolean;
  className?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  emptyText,
  creatable = true,
  className,
}: MultiSelectProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const allOptions = React.useMemo(() => {
    const set = new Set(options);
    for (const s of selected) set.add(s);
    return Array.from(set).sort();
  }, [options, selected]);

  const toggle = (value: string): void => {
    onChange(
      selected.includes(value)
        ? selected.filter((s) => s !== value)
        : [...selected, value],
    );
  };

  const remove = (value: string, e: React.MouseEvent): void => {
    e.stopPropagation();
    onChange(selected.filter((s) => s !== value));
  };

  const addCustomTag = (): void => {
    const tag = inputValue.trim().toLowerCase();
    if (tag && !selected.includes(tag)) {
      onChange([...selected, tag]);
      setInputValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustomTag();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex min-h-9 w-full items-center justify-between gap-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <div className="flex flex-1 flex-wrap gap-1">
            {selected.length === 0 && (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            {selected.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 px-1.5 py-0">
                {tag}
                <X
                  className="h-3 w-3 cursor-pointer opacity-60 hover:opacity-100"
                  onClick={(e) => remove(tag, e)}
                />
              </Badge>
            ))}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-h-60 overflow-y-auto p-1 w-[var(--radix-popover-trigger-width)]">
        {creatable && (
          <div className="p-1 border-b mb-1" onClick={(e) => e.stopPropagation()}>
            <Input
              ref={inputRef}
              placeholder={placeholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-sm"
            />
          </div>
        )}
        {allOptions.length === 0 && !creatable ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          allOptions.map((option) => {
            const isSelected = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                className={cn(
                  "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  isSelected && "font-medium",
                )}
                onClick={() => toggle(option)}
              >
                <span className="flex-1 text-left">{option}</span>
                {isSelected && (
                  <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}
