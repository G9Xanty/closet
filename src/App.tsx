import { useEffect } from "react";
import { useAuthContext } from "./store/AuthProvider";
import { AppProvider } from "./store/AppProvider";
import FrameRenderer from "./components/FrameRenderer";
import ViewportContent from "./components/ViewportContent";
import InstallPrompt from "./components/InstallPrompt";
import AuthScreen from "./screens/AuthScreen";
import AuthLoadingScreen from "./components/AuthLoadingScreen";

export default function App() {
  const { user, loading, signOut } = useAuthContext();

  useEffect(() => {
    const handleAuthLogout = async () => {
      console.log("[APP] Logout automatico por sesion expirada");
      await signOut();
    };
    window.addEventListener("auth:logout", handleAuthLogout);
    return () => window.removeEventListener("auth:logout", handleAuthLogout);
  }, [signOut]);

  console.log("[APP RENDER]", { loading, user: !!user });

  if (loading) return <AuthLoadingScreen />;
  if (!user) return <AuthScreen />;

  return (
    <AppProvider>
      <InstallPrompt />
      <FrameRenderer>
        <div className="viewport-root">
          <ViewportContent />
        </div>
      </FrameRenderer>
    </AppProvider>
  );
}
