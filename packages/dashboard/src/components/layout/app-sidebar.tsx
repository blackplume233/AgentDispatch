import type React from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ListTodo,
  Monitor,
  Radio,
  Settings,
  Languages,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { supportedLanguages, type SupportedLang } from "@/i18n";

const navItems = [
  { to: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { to: "/tasks", icon: ListTodo, labelKey: "nav.tasks" },
  { to: "/clients", icon: Monitor, labelKey: "nav.clients" },
  { to: "/events", icon: Radio, labelKey: "nav.events" },
];

const bottomItems = [
  { to: "/settings", icon: Settings, labelKey: "nav.settings" },
];

export function AppSidebar(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <aside className="flex w-56 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2.5 border-b px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground">
          <span className="text-xs font-bold text-background">AD</span>
        </div>
        <span className="text-sm font-semibold">{t("nav.brand")}</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </nav>

      <Separator />

      <div className="space-y-1 px-3 py-4">
        {bottomItems.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </div>

      <Separator />

      <div className="px-3 py-2">
        <LanguageSwitcher />
      </div>

      <Separator />

      <div className="px-5 py-3 text-xs text-muted-foreground">
        <p>AgentDispatch v0.0.1</p>
      </div>
    </aside>
  );
}

function SidebarLink({
  to,
  icon: Icon,
  labelKey,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
}): React.ReactElement {
  const { t } = useTranslation();

  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        )
      }
    >
      <Icon className="h-4 w-4" />
      {t(labelKey)}
    </NavLink>
  );
}

function LanguageSwitcher(): React.ReactElement {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language ?? "en") as string;

  const handleChange = (lang: SupportedLang): void => {
    void i18n.changeLanguage(lang);
  };

  return (
    <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5">
      <Languages className="h-4 w-4 text-muted-foreground" />
      <div className="flex gap-0.5">
        {supportedLanguages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            className={cn(
              "rounded px-2 py-0.5 text-xs font-medium transition-colors",
              currentLang.startsWith(lang.code.split("-")[0] ?? lang.code)
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            )}
          >
            {lang.label}
          </button>
        ))}
      </div>
    </div>
  );
}
