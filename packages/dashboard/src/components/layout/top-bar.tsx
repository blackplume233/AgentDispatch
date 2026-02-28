import { useTranslation } from "react-i18next";
import { Activity, Wifi, WifiOff, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

export function TopBar() {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-3">
        <Activity className="h-5 w-5 text-foreground" />
        <h1 className="text-lg font-semibold tracking-tight">{t("nav.brand")}</h1>
      </div>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <Button variant="ghost" size="icon" onClick={toggle} className="h-8 w-8">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <ServerStatus />
      </div>
    </header>
  );
}

function ServerStatus() {
  const { t } = useTranslation();
  const online = true;

  return (
    <div className="flex items-center gap-1.5">
      {online ? (
        <>
          <Wifi className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-emerald-600 font-medium">{t("common.online")}</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5 text-destructive" />
          <span className="text-destructive font-medium">{t("common.offline")}</span>
        </>
      )}
    </div>
  );
}
