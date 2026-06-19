import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App.jsx';
import { queryClient } from './lib/queryClient.js';
const platform = Capacitor?.getPlatform?.() || 'web';
const shouldPreventZoomGestures = platform === 'ios';

let lastTouchEndAt = 0;

document.documentElement.classList.add(`platform-${platform}`);
document.body.classList.add(`platform-${platform}`);

const preventGestureZoom = (event) => {
  event.preventDefault();
};

const preventPinchZoom = (event) => {
  if (event.touches && event.touches.length > 1) {
    event.preventDefault();
  }
};

const preventDoubleTapZoom = (event) => {
  const now = Date.now();
  if (now - lastTouchEndAt <= 300) {
    event.preventDefault();
  }
  lastTouchEndAt = now;
};

if (shouldPreventZoomGestures) {
  document.addEventListener('gesturestart', preventGestureZoom, { passive: false });
  document.addEventListener('gesturechange', preventGestureZoom, { passive: false });
  document.addEventListener('gestureend', preventGestureZoom, { passive: false });
  document.addEventListener('touchstart', preventPinchZoom, { passive: false });
  document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
