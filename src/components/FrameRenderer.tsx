import React, { useEffect, useState } from 'react';
import '../styles/frame.css';

interface FrameRendererProps {
  children: React.ReactNode;
}

const BREAKPOINT = 1024;

function useViewport() {
  const [isDesktop, setDesktop] = useState(() => window.innerWidth >= BREAKPOINT);

  useEffect(() => {
    const onResize = () => setDesktop(window.innerWidth >= BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return isDesktop;
}

function DesktopFrame({ children }: { children: React.ReactNode }) {
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

function MobileFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mobile-wrapper">
      <div className="mobile-machine">
        <div className="mobile-app">
          <div className="viewport-safe">
            {children}
          </div>
        </div>
        <img className="mobile-frame" src="/assets/marco_celular.png" alt="" draggable={false} />
      </div>
    </div>
  );
}

export default function FrameRenderer({ children }: { children: React.ReactNode }) {
  const isDesktop = useViewport();
  console.log('[FRAME]', { isDesktop, frameType: isDesktop ? 'desktop' : 'mobile' });
  return isDesktop ? <DesktopFrame>{children}</DesktopFrame> : <MobileFrame>{children}</MobileFrame>;
}
