import React, { useEffect } from 'react';
import '../styles/frame.css';

interface FrameRendererProps {
  children: React.ReactNode;
}

const DesktopFrame: React.FC<FrameRendererProps> = ({ children }) => {
  return (
    <div className="desktop-frame">
      <div className="arcade-wrapper">
        <div className="arcade-machine">
          <div className="desktop-app">
            <div className="viewport-root">
              {children}
            </div>
          </div>
          <img
            src="/assets/arcade_computadora.png"
            alt=""
            className="desktop-frame-image"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
};

const MobileFrame: React.FC<FrameRendererProps> = ({ children }) => {
  return (
    <div className="mobile-frame">
      <div className="mobile-machine">
        <div className="mobile-app">
          <div className="mobile-app-inner">
            {children}
          </div>
        </div>
        <img
          src="/assets/marco_celular.png"
          alt=""
          className="mobile-frame-image"
          draggable={false}
        />
      </div>
    </div>
  );
};

const FrameRenderer: React.FC<FrameRendererProps> = ({ children }) => {
  useEffect(() => {
    console.log('[FRAME]', { isMobile: window.innerWidth < 1024 });
  }, []);

  const isMobile = window.innerWidth < 1024;

  if (isMobile) {
    return <MobileFrame>{children}</MobileFrame>;
  }

  return <DesktopFrame>{children}</DesktopFrame>;
};

export default FrameRenderer;
