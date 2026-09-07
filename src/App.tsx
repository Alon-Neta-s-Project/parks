import { Link, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Orb } from "./components/Orb";
import { Chat } from "./components/Chat";
import { HomePage } from "./pages/HomePage";
import { BrowsePage } from "./pages/BrowsePage";
import { ExperiencePage } from "./pages/ExperiencePage";
import { AdminPage } from "./pages/AdminPage";
import { MemoryPage } from "./pages/MemoryPage";
import { ContentProvider } from "./data/content";
import { SourceNotice } from "./components/SourceNotice";

export default function App() {
  const { t } = useTranslation();
  return (
    <ContentProvider>
    <div className="app">
      <div className="app__inner">
        <header className="topbar">
          <Link to="/" className="topbar__brand">
            <Orb />
            <b>{t("app.title")}</b>
          </Link>
          <nav className="topbar__nav">
            <Link to="/browse">{t("nav.browse")}</Link>
            <Link to="/chat">{t("nav.chat")}</Link>
            <Link to="/me">{t("nav.me")}</Link>
          </nav>
        </header>

        <SourceNotice />

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/park/:park" element={<BrowsePage />} />
          <Route path="/experience/:slug" element={<ExperiencePage />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/me" element={<MemoryPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </div>
    </div>
    </ContentProvider>
  );
}
