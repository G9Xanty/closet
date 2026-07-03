import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Screen, Product } from "./appState";
import type { AppUser } from "../hooks/useAuth";
import { useAuthContext } from "./AuthProvider";

interface AppContextType {
  screen: Screen;
  goTo: (s: Screen) => void;
  goBack: () => void;
  canGoBack: boolean;
  user: AppUser | null;
  session: boolean | null;
  authLoading: boolean;
  products: Product[];
  setProducts: (p: Product[]) => void;
  activeProduct: Product | null;
  setActiveProduct: (p: Product | null) => void;
  activeCategory: string;
  setActiveCategory: (c: string) => void;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { user, session, loading: authLoading, signOut } = useAuthContext();
  const [screen, setScreen] = useState<Screen>("play");
  const [history, setHistory] = useState<Screen[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [activeCategory, setActiveCategory] = useState("all");

  console.log('[APP PROVIDER]', { screen });

  const goTo = useCallback((s: Screen) => {
    setHistory(prev => {
      const next = [...prev, screen];
      return next.length > 10 ? next.slice(-10) : next;
    });
    setScreen(s);
  }, [screen]);

  const goBack = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const prevScreen = next.pop()!;
      setScreen(prevScreen);
      return next;
    });
  }, []);

  return (
    <AppContext.Provider
      value={{
        screen, goTo, goBack,
        canGoBack: history.length > 0,
        user, session, authLoading,
        signOut,
        products, setProducts,
        activeProduct, setActiveProduct,
        activeCategory, setActiveCategory,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be inside AppProvider");
  return ctx;
}
