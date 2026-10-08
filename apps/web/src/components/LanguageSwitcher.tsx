import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const isAm = i18n.language.startsWith("am");

  const toggle = () => {
    const next = isAm ? "en" : "am";
    i18n.changeLanguage(next);
    localStorage.setItem("enderasie_lang", next);
  };

  return (
    <button
      onClick={toggle}
      title={t("labels.language")}
      className="flex items-center gap-2 rounded-md border border-surface-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:border-brand-orange hover:text-brand-orange transition-colors"
    >
      <Languages size={16} />
      {isAm ? "English" : "አማርኛ"}
    </button>
  );
}