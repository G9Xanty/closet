import { useEffect, useState, type ReactNode } from "react";
import "../styles/frame.css";

const BREAKPOINT = 1024;

function useViewport() {
  const [isDesktop, setDesktop] = useState(() => window.innerWidth >= BREAKPOINT);

  useEffect(() => {
    const onResize = () => setDesktop(window.innerWidth >= BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return isDesktop;
}

function DesktopFrame({ children }: { children: ReactNode }) {
  return (
    <div className="arcade-wrapper">
      <div className="arcade-machine">
        <div className="desktop-app">
          <div className="viewport-safe">
            {children}
          </div>
        </div>
        <img className="desktop-frame" src="/assets/arcade_computadora.png" alt="" draggable={false} />
      </div>
    </div>
  );
}

function MobileFrame({ children }: { children: ReactNode }) {
  return (
    <div className="arcade-machine mobile-machine">
      <img className="mobile-bg" src="/assets/vantablack cell.png" alt="" draggable={false} />
      <div className="mobile-app">
        <div className="viewport-safe">
          {children}
        </div>
      </div>
      <img className="mobile-frame" src="/assets/ChatGPT Image 29 jun 2026, 10_48_09.png" alt="" draggable={false} />
    </div>
  );
}

export default function FrameRenderer({ children }: { children: ReactNode }) {
  const isDesktop = useViewport();
  console.log('[FRAME]', { isDesktop, frameType: isDesktop ? 'desktop' : 'mobile' });
  return isDesktop ? <DesktopFrame>{children}</DesktopFrame> : <MobileFrame>{children}</MobileFrame>;
}
