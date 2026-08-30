import { useTranslation } from "react-i18next";
import { Chat } from "./components/Chat";
import { Orb } from "./components/Orb";

export default function App() {
  const { t } = useTranslation();

  return (
    <div className="app">
      <div className="app__inner">
        <header className="topbar">
          <Orb large />
          <div className="topbar__id">
            <b>{t("app.title")}</b>
            <span>{t("app.subtitle")}</span>
          </div>
        </header>
        <Chat />
      </div>
    </div>
  );
}
