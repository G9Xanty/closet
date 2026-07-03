import { useAuthContext } from "./store/AuthProvider";
import { AppProvider } from "./store/AppProvider";
import FrameRenderer from "./components/FrameRenderer";
import ViewportContent from "./components/ViewportContent";
import InstallPrompt from "./components/InstallPrompt";
import AuthScreen from "./screens/AuthScreen";
import LoadingScreen from "./screens/LoadingScreen";
import AuthLoadingScreen from "./components/AuthLoadingScreen";

export default function App() {
  const { user, loading } = useAuthContext();

  console.log('[APP RENDER]', { loading, user: !!user, dealerId: user?.dealer_id, renderedScreen: loading ? 'AuthLoading' : !user ? 'AuthScreen' : 'AppProvider' });
  console.log('[AUTH GATE]', { user, dealerId: user?.dealer_id, loading });

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
