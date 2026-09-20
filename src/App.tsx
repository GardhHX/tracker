import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Privacy from "./pages/Privacy";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
