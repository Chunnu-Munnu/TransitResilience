import { BrowserRouter } from "react-router-dom";
import { OperationsProvider } from "../state/operationsStore.jsx";
import { AuthProvider } from "../state/authStore.jsx";
import AppRoutes from "./routes.jsx";
import "../styles/globals.css";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OperationsProvider>
          <AppRoutes />
        </OperationsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
