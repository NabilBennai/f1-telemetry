import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import Layout from "./Layout.jsx";
import SessionHistory from "./pages/SessionHistory.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<App />} />
          <Route path="history" element={<SessionHistory />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
