import { useAppContext } from "../store/AppProvider";
import PlayScreen from "../screens/PlayScreen";
import LoadingScreen from "../screens/LoadingScreen";
import AuthScreen from "../screens/AuthScreen";
import FeedScreen from "../screens/FeedScreen";
import DetailScreen from "../screens/DetailScreen";
import ProfileScreen from "../screens/ProfileScreen";
import UploadProductScreen from "../screens/UploadProductScreen";
import PublicProfileScreen from "../screens/PublicProfileScreen";
import SellerProfileScreen from "../screens/SellerProfileScreen";
import SettingsScreen from "../screens/SettingsScreen";
import AdminScreen from "../screens/AdminScreen";
import RequestsScreen from "../screens/RequestsScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import "../styles/screens.css";

const NAV_HIDE: string[] = ["play", "loading", "auth"];

export default function ViewportContent() {
  const { screen, goTo, goBack, canGoBack } = useAppContext();

  const renderScreen = () => {
    switch (screen) {
      case "play":    return <PlayScreen />;
      case "loading": return <LoadingScreen />;
      case "auth":    return <AuthScreen />;
      case "feed":    return <FeedScreen />;
      case "detail":  return <DetailScreen />;
      case "profile": return <ProfileScreen />;
      case "upload":  return <UploadProductScreen />;
      case "publicProfile": return <PublicProfileScreen />;
      case "sellerProfile": return <SellerProfileScreen />;
      case "settings":return <SettingsScreen />;
      case "admin":   return <AdminScreen />;
      case "requests":return <RequestsScreen />;
      case "notifications":return <NotificationsScreen />;
      default:        return <PlayScreen />;
    }
  };

  const showNav = !NAV_HIDE.includes(screen);
  const onFeed = screen === "feed";

  return (
    <div className="viewport-stack">
      <div className="viewport-screen">
        {renderScreen()}
      </div>
      {showNav && (
        <div className="bottom-nav">
          <button className="bottom-nav-btn" disabled={!canGoBack} onClick={goBack}>◀</button>
          {!onFeed && <button className="bottom-nav-btn" onClick={() => goTo("feed")}>🏠</button>}
        </div>
      )}
    </div>
  );
}
