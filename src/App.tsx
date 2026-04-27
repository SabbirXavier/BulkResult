import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Vibe from "./pages/Vibe";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/vibe" element={<Vibe />} />
      </Routes>
    </BrowserRouter>
  );
}
