import type { FrontmatterRecord } from "@rumi/contracts";
import type { ReactElement } from "react";
import { CheckSquare } from "@phosphor-icons/react/dist/csr/CheckSquare";
import { Square } from "@phosphor-icons/react/dist/csr/Square";
import { formatPropertyValue } from "./pagePresentation";

export interface PagePropertiesProps {
  frontmatter: FrontmatterRecord;
}

export function PageProperties({ frontmatter }: PagePropertiesProps): ReactElement | null {
  const properties = Object.entries(frontmatter);

  if (properties.length === 0) {
    return null;
  }

  return (
    <section className="mt-8" aria-labelledby="page-properties-heading">
      <h2
        id="page-properties-heading"
        className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        Properties
      </h2>
      <dl className="space-y-1">
        {properties.map(([name, value]) => (
          <div
            key={name}
            className="grid min-h-8 grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)] items-start gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/70"
          >
            <dt className="truncate text-muted-foreground" title={name}>
              {name}
            </dt>
            <dd className="min-w-0 break-words text-foreground">
              <PropertyValue value={value} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PropertyValue({ value }: { value: unknown }): ReactElement {
  if (typeof value === "boolean") {
    const Icon = value ? CheckSquare : Square;

    return (
      <span className="inline-flex items-center gap-1.5">
        <Icon size={16} className="text-neutral-400" aria-hidden="true" />
        {value ? "True" : "False"}
      </span>
    );
  }

  if (Array.isArray(value) && value.length > 0) {
    return (
      <span className="flex flex-wrap gap-1.5">
        {value.map((item, index) => (
          <span key={index} className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {formatPropertyValue(item)}
          </span>
        ))}
      </span>
    );
  }

  const displayValue = formatPropertyValue(value);

  return (
    <span className={displayValue === "Empty" ? "text-muted-foreground" : undefined}>
      {displayValue}
    </span>
  );
}
