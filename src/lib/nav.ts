import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Search,
  Users,
  Megaphone,
  Send,
  ListChecks,
  BarChart3,
  Settings,
  Globe,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
};

/** Main navigation per spec §6. Order matters — matches the sidebar layout. */
export const NAV_ITEMS: NavItem[] = [
  {
    label: "Overview",
    href: "/overview",
    icon: LayoutDashboard,
    description: "Pipeline summary, counts, and today's follow-ups.",
  },
  {
    label: "Discover",
    href: "/discover",
    icon: Search,
    description: "Run a discovery job against configured sources.",
  },
  {
    label: "Web Intelligence",
    href: "/intelligence",
    icon: Globe,
    description:
      "Discover companies, crawl eligible websites, and extract corporate intel.",
  },
  {
    label: "Leads",
    href: "/leads",
    icon: Users,
    description: "Search, filter, score, and review leads.",
  },
  {
    label: "Campaigns",
    href: "/campaigns",
    icon: Megaphone,
    description: "Audience, offer, and campaign-level metrics.",
  },
  {
    label: "Outreach",
    href: "/outreach",
    icon: Send,
    description: "Drafts, approvals, and manually logged contact.",
  },
  {
    label: "Tasks",
    href: "/tasks",
    icon: ListChecks,
    description: "Follow-ups, reviews, and manual sends.",
  },
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
    description: "Funnel, source breakdown, and campaign comparisons.",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Services, scoring weights, API integrations, demo mode.",
  },
];
