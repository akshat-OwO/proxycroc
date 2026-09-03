import { useEffect, useMemo, useRef, useState } from "react";

const ALL = "All repositories";

/**
 * Type-ahead picker for the key's repository scope.
 *
 * A native <select> cannot be searched, and an installation can easily see a
 * few hundred repositories, so this is a combobox: the input doubles as the
 * filter, and an empty value means every repository.
 */
export function RepositoryPicker({
  value,
  onChange,
  repositories,
}: {
  value: string;
  onChange: (value: string) => void;
  repositories: { id: number; fullName: string }[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const names = repositories.map((r) => r.fullName);
    const matches = needle
      ? names.filter((name) => name.toLowerCase().includes(needle))
      : names;
    return needle && !ALL.toLowerCase().includes(needle)
      ? matches
      : ["", ...matches];
  }, [query, repositories]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [open]);

  function choose(option: string) {
    onChange(option);
    setQuery("");
    setOpen(false);
  }

  function keydown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => {
        const next = event.key === "ArrowDown" ? i + 1 : i - 1;
        return Math.max(0, Math.min(options.length - 1, next));
      });
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = options[active];
      if (option !== undefined) choose(option);
    } else if (event.key === "Escape" && open) {
      // Close the list without closing the surrounding <dialog>.
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="picker" ref={box}>
      <input
        className="field"
        role="combobox"
        aria-expanded={open}
        aria-label="Repository scope"
        placeholder={ALL}
        value={open ? query : value || ALL}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={keydown}
      />

      {open && (
        <ul className="picker__list" role="listbox">
          {options.length === 0 && <li className="picker__empty">No matches</li>}
          {options.map((option, i) => (
            <li key={option || "__all__"}>
              <button
                type="button"
                role="option"
                aria-selected={option === value}
                className={i === active ? "is-active" : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(option)}
              >
                {option || ALL}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
