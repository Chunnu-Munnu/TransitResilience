import { BrowserRouter } from "react-router-dom";
import { OperationsProvider } from "../state/operationsStore.jsx";
import { AuthProvider } from "../state/authStore.jsx";
import { ThemeProvider } from "../state/themeStore.jsx";
import ErrorBoundary from "../components/shared/ErrorBoundary";
import AppRoutes from "./routes.jsx";
import "../styles/globals.css";

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <OperationsProvider>
              <AppRoutes />
            </OperationsProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
