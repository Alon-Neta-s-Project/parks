import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import he from "./he.json";

/**
 * Every user-facing string lives in a locale file (brief §8) — including the
 * opening questions, which are keyed off the question ids in lib/profile so the
 * question set can change without touching the chat.
 */
void i18n.use(initReactI18next).init({
  resources: { he: { translation: he } },
  lng: "he",
  fallbackLng: "he",
  interpolation: { escapeValue: false },
});

export default i18n;
