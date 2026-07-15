import Link from "next/link";
import styles from "./product-navigation.module.css";

const destinations = [
  { href: "/admin", label: "Admin" },
  { href: "/chat", label: "Chatbot" },
  { href: "/lab/agent-flow", label: "Agent Flow" },
] as const;

export type ProductArea = "admin" | "chat" | "agent-flow";

function NavigationIcon({ area }: { area: ProductArea }) {
  if (area === "admin") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M3.5 3.5h5v5h-5zM11.5 3.5h5v5h-5zM3.5 11.5h5v5h-5zM11.5 11.5h5v5h-5z" />
      </svg>
    );
  }
  if (area === "chat") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M4.25 4.25h11.5v8.5h-6l-3.5 3v-3h-2z" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <circle cx="5" cy="5" r="2" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="10" cy="15" r="2" />
      <path d="m6.8 5.35 6.35.45M6.1 6.75l2.8 6.5m4.75-5.6-2.7 5.65" />
    </svg>
  );
}

export function ProductNavigation({
  active,
  variant = "tabs",
}: {
  active: ProductArea;
  variant?: "tabs" | "sidebar";
}) {
  return (
    <nav
      className={`${styles.navigation} ${variant === "sidebar" ? styles.sidebar : ""}`}
      aria-label="A2UI Studio"
    >
      {destinations.map((destination) => {
        const destinationArea = destination.href === "/admin"
          ? "admin"
          : destination.href === "/chat"
            ? "chat"
            : "agent-flow";
        const isActive = destinationArea === active;

        return (
          <Link
            aria-label={destination.label}
            aria-current={isActive ? "page" : undefined}
            className={`${styles.link} ${isActive ? styles.active : ""}`}
            href={destination.href}
            key={destination.href}
          >
            {variant === "sidebar" ? <NavigationIcon area={destinationArea} /> : null}
            <span>{destination.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
