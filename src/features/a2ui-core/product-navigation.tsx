import Link from "next/link";
import styles from "./product-navigation.module.css";

const destinations = [
  { href: "/admin", label: "Admin" },
  { href: "/chat", label: "Chatbot" },
  { href: "/lab/agent-flow", label: "Agent Flow" },
] as const;

export type ProductArea = "admin" | "chat" | "agent-flow";

export function ProductNavigation({ active }: { active: ProductArea }) {
  return (
    <nav className={styles.navigation} aria-label="A2UI Studio">
      {destinations.map((destination) => {
        const destinationArea = destination.href === "/admin"
          ? "admin"
          : destination.href === "/chat"
            ? "chat"
            : "agent-flow";
        const isActive = destinationArea === active;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`${styles.link} ${isActive ? styles.active : ""}`}
            href={destination.href}
            key={destination.href}
          >
            {destination.label}
          </Link>
        );
      })}
    </nav>
  );
}
