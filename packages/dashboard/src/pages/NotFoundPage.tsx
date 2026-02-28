import type React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotFoundPage(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h1 className="text-7xl font-bold text-muted-foreground/30">404</h1>
      <p className="mt-2 text-lg text-muted-foreground">{t("notFound.message", "Page not found")}</p>
      <Link to="/" className="mt-6">
        <Button variant="outline">
          <Home className="mr-2 h-4 w-4" />
          {t("notFound.backHome", "Back to Dashboard")}
        </Button>
      </Link>
    </div>
  );
}
