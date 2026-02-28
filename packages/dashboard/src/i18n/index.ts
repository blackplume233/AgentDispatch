import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./en";
import { zhCN } from "./zh-CN";

export const supportedLanguages = [
  { code: "en" as const, label: "EN" },
  { code: "zh-CN" as const, label: "中文" },
] as const;

export type SupportedLang = (typeof supportedLanguages)[number]["code"];

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "zh-CN": { translation: zhCN },
  },
  lng: navigator.language.startsWith("zh") ? "zh-CN" : "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
