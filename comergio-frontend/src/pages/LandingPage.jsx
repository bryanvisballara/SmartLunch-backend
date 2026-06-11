import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

const VIDEO_SRC = '/landing/hero-scroll.mp4';
const FRAME_START_SRC = '/landing/frame-start.png';
const FRAME_END_SRC = '/landing/frame-end.png';
const NATIVE_WIDTH = 1024;
const NATIVE_HEIGHT = 576;
const PIN_ZONE = 0.07;
const FADE_ZONE = 0.08;
const FRAME_FPS = 24;
const LOAD_PROGRESS_FRAMES_START = 0.45;

const SCROLL_PHYSICS = {
  wheelSensitivity: 0.0045,
  touchSensitivity: 0.0032,
  touchMomentumBoost: 1.35,
  friction: 0.94,
  stopThreshold: 0.00005,
  maxVelocity: 3,
  keyVelocity: 0.55,
  maxFrameDelta: 0.032,
};

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function computeLayers(progress) {
  const p = clamp(progress);

  if (p <= PIN_ZONE) {
    return { start: 1, video: 0, end: 0, videoProgress: 0 };
  }

  if (p >= 1 - PIN_ZONE) {
    return { start: 0, video: 0, end: 1, videoProgress: 1 };
  }

  const videoProgress = clamp((p - PIN_ZONE) / (1 - 2 * PIN_ZONE));

  if (p < PIN_ZONE + FADE_ZONE) {
    const blend = clamp((p - PIN_ZONE) / FADE_ZONE);
    return { start: 1 - blend, video: blend, end: 0, videoProgress };
  }

  if (p > 1 - PIN_ZONE - FADE_ZONE) {
    const blend = clamp((p - (1 - PIN_ZONE - FADE_ZONE)) / FADE_ZONE);
    return { start: 0, video: 1 - blend, end: blend, videoProgress };
  }

  return { start: 0, video: 1, end: 0, videoProgress };
}

function fitMediaToViewport(viewport, mediaElements, mediaWidth, mediaHeight) {
  if (!viewport || !mediaWidth || !mediaHeight) {
    return;
  }

  const viewportWidth = viewport.clientWidth;
  const viewportHeight = viewport.clientHeight;
  if (!viewportWidth || !viewportHeight) {
    return;
  }

  const scale = Math.min(
    viewportWidth / mediaWidth,
    viewportHeight / mediaHeight,
  );
  const width = Math.round(mediaWidth * scale);
  const height = Math.round(mediaHeight * scale);

  mediaElements.forEach((element) => {
    if (element) {
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
    }
  });
}

function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function seekVideoTo(video, time) {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

async function extractVideoFrames(video, onProgress) {
  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!duration || !Number.isFinite(duration) || !width || !height) {
    return { frames: [], width: 0, height: 0 };
  }

  const frameCount = Math.max(2, Math.ceil(duration * FRAME_FPS));
  const frames = [];
  const scratch = document.createElement('canvas');
  scratch.width = NATIVE_WIDTH;
  scratch.height = NATIVE_HEIGHT;
  const ctx = scratch.getContext('2d');

  for (let i = 0; i < frameCount; i += 1) {
    const videoProgress = i / (frameCount - 1);
    const targetTime = videoProgress * Math.max(duration - 0.001, 0);
    await seekVideoTo(video, targetTime);
    ctx.drawImage(video, 0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);
    frames.push(await createImageBitmap(scratch));

    onProgress?.((i + 1) / frameCount);

    if (i % 3 === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  return { frames, width: NATIVE_WIDTH, height: NATIVE_HEIGHT };
}

function LandingPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const startRef = useRef(null);
  const endRef = useRef(null);
  const framesRef = useRef([]);
  const mediaSizeRef = useRef({ width: NATIVE_WIDTH, height: NATIVE_HEIGHT });
  const lastFrameIndexRef = useRef(-1);
  const progressRef = useRef(0);
  const velocityRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const inputActiveRef = useRef(false);
  const loopActiveRef = useRef(false);
  const lastTouchYRef = useRef(0);
  const lastTouchTimeRef = useRef(0);
  const touchVelocityRef = useRef(0);
  const rafRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  const paintFrame = useCallback((videoProgress) => {
    const frames = framesRef.current;
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) {
      return;
    }

    const index = Math.min(
      frames.length - 1,
      Math.round(clamp(videoProgress) * (frames.length - 1)),
    );

    lastFrameIndexRef.current = index;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(frames[index], 0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);
  }, []);

  const applyLayers = useCallback((layers) => {
    const start = startRef.current;
    const canvas = canvasRef.current;
    const end = endRef.current;

    if (start) {
      start.style.opacity = String(layers.start);
      start.style.visibility = layers.start > 0 ? 'visible' : 'hidden';
    }

    if (canvas) {
      canvas.style.opacity = String(layers.video);
      canvas.style.visibility = layers.video > 0 ? 'visible' : 'hidden';
    }

    if (end) {
      end.style.opacity = String(layers.end);
      end.style.visibility = layers.end > 0 ? 'visible' : 'hidden';
    }
  }, []);

  const applyProgress = useCallback((nextProgress) => {
    const clamped = clamp(nextProgress);
    progressRef.current = clamped;

    const hasFrames = framesRef.current.length > 0;
    const layers = hasFrames
      ? computeLayers(clamped)
      : clamped >= 1 - PIN_ZONE
        ? { start: 0, video: 0, end: 1, videoProgress: 1 }
        : { start: 1, video: 0, end: 0, videoProgress: 0 };

    applyLayers(layers);

    if (layers.video > 0 && hasFrames) {
      paintFrame(layers.videoProgress);
    } else if (layers.video === 0) {
      lastFrameIndexRef.current = -1;
    }
  }, [applyLayers, paintFrame]);

  const syncMediaSize = useCallback(() => {
    const { width, height } = mediaSizeRef.current;
    fitMediaToViewport(viewportRef.current, [
      startRef.current,
      canvasRef.current,
      endRef.current,
    ], width, height);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('landing-route-active');
    document.body.classList.add('landing-route-active');
    window.scrollTo(0, 0);

    return () => {
      document.documentElement.classList.remove('landing-route-active');
      document.body.classList.remove('landing-route-active');
    };
  }, []);

  const applyProgressRef = useRef(applyProgress);
  applyProgressRef.current = applyProgress;
  const syncMediaSizeRef = useRef(syncMediaSize);
  syncMediaSizeRef.current = syncMediaSize;

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    if (!video) {
      return undefined;
    }

    setLoading(true);
    setLoadProgress(0);
    velocityRef.current = 0;
    progressRef.current = 0;

    const waitForEvent = (eventName) => new Promise((resolve, reject) => {
      const onSuccess = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Video event failed: ${eventName}`));
      };
      const cleanup = () => {
        video.removeEventListener(eventName, onSuccess);
        video.removeEventListener('error', onError);
      };

      video.addEventListener(eventName, onSuccess, { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    const bootstrap = async () => {
      setLoadProgress(0.05);
      await preloadImage(FRAME_START_SRC);

      if (cancelled) {
        return;
      }

      setLoadProgress(0.2);
      await preloadImage(FRAME_END_SRC);

      if (cancelled) {
        return;
      }

      setLoadProgress(0.35);

      if (video.readyState < 1) {
        video.load();
      }

      await waitForEvent('loadeddata');
      video.pause();

      if (cancelled) {
        return;
      }

      setLoadProgress(LOAD_PROGRESS_FRAMES_START);

      const { frames, width, height } = await extractVideoFrames(video, (fraction) => {
        if (!cancelled) {
          setLoadProgress(LOAD_PROGRESS_FRAMES_START + fraction * (1 - LOAD_PROGRESS_FRAMES_START));
        }
      });

      if (cancelled) {
        frames.forEach((bitmap) => bitmap.close());
        return;
      }

      if (frames.length === 0) {
        throw new Error('No video frames extracted');
      }

      mediaSizeRef.current = { width, height };
      framesRef.current = frames;

      if (canvasRef.current) {
        canvasRef.current.width = width;
        canvasRef.current.height = height;
        const ctx = canvasRef.current.getContext('2d');
        ctx.drawImage(frames[0], 0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);
        lastFrameIndexRef.current = 0;
      }

      applyProgressRef.current(0);
      syncMediaSizeRef.current();
      setLoadProgress(1);
      setLoading(false);
    };

    bootstrap().catch(() => {
      if (!cancelled) {
        framesRef.current = [];
        setLoadProgress(0);
        setLoading(true);
      }
    });

    return () => {
      cancelled = true;
      framesRef.current.forEach((bitmap) => bitmap.close());
      framesRef.current = [];
      lastFrameIndexRef.current = -1;
    };
  }, []);

  useLayoutEffect(() => {
    syncMediaSize();
  }, [loading, syncMediaSize]);

  useEffect(() => {
    if (loading) {
      return undefined;
    }

    const blockScroll = (event) => {
      event.preventDefault();
    };

    const addVelocity = (delta) => {
      velocityRef.current = clamp(
        velocityRef.current + delta,
        -SCROLL_PHYSICS.maxVelocity,
        SCROLL_PHYSICS.maxVelocity,
      );
      inputActiveRef.current = true;
    };

    const stopPhysicsLoop = () => {
      loopActiveRef.current = false;
      lastFrameTimeRef.current = 0;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };

    const stepPhysics = (timestamp) => {
      if (!loopActiveRef.current) {
        return;
      }

      let dt = 0.016;
      if (lastFrameTimeRef.current > 0) {
        dt = Math.min(
          (timestamp - lastFrameTimeRef.current) / 1000,
          SCROLL_PHYSICS.maxFrameDelta,
        );
      }
      lastFrameTimeRef.current = timestamp;

      if (!inputActiveRef.current) {
        velocityRef.current *= SCROLL_PHYSICS.friction;
        if (Math.abs(velocityRef.current) < SCROLL_PHYSICS.stopThreshold) {
          velocityRef.current = 0;
        }
      }
      inputActiveRef.current = false;

      if (velocityRef.current !== 0) {
        let nextProgress = progressRef.current + velocityRef.current * dt;

        if (nextProgress <= 0) {
          nextProgress = 0;
          velocityRef.current = 0;
        } else if (nextProgress >= 1) {
          nextProgress = 1;
          velocityRef.current = 0;
        }

        applyProgress(nextProgress);
      }

      if (velocityRef.current !== 0) {
        rafRef.current = requestAnimationFrame(stepPhysics);
      } else {
        stopPhysicsLoop();
      }
    };

    const startPhysicsLoop = () => {
      if (loopActiveRef.current) {
        return;
      }

      loopActiveRef.current = true;
      lastFrameTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(stepPhysics);
    };

    const onWheel = (event) => {
      event.preventDefault();
      addVelocity(event.deltaY * SCROLL_PHYSICS.wheelSensitivity);
      startPhysicsLoop();
      applyProgress(progressRef.current + velocityRef.current * 0.016);
    };

    const onTouchStart = (event) => {
      const touchY = event.touches[0]?.clientY ?? 0;
      lastTouchYRef.current = touchY;
      lastTouchTimeRef.current = performance.now();
      touchVelocityRef.current = 0;
      velocityRef.current = 0;
    };

    const onTouchMove = (event) => {
      const currentY = event.touches[0]?.clientY ?? lastTouchYRef.current;
      const now = performance.now();
      const deltaY = lastTouchYRef.current - currentY;
      const elapsed = now - lastTouchTimeRef.current;

      if (Math.abs(deltaY) > 0) {
        event.preventDefault();

        if (elapsed > 0) {
          touchVelocityRef.current = (deltaY / elapsed) * SCROLL_PHYSICS.touchSensitivity;
        }

        addVelocity(deltaY * SCROLL_PHYSICS.touchSensitivity);
        startPhysicsLoop();
        applyProgress(progressRef.current + velocityRef.current * 0.016);
      }

      lastTouchYRef.current = currentY;
      lastTouchTimeRef.current = now;
    };

    const onTouchEnd = () => {
      const momentum = touchVelocityRef.current * SCROLL_PHYSICS.touchMomentumBoost;
      if (Math.abs(momentum) > SCROLL_PHYSICS.stopThreshold) {
        addVelocity(momentum);
        startPhysicsLoop();
      }
      touchVelocityRef.current = 0;
    };

    const onKeyDown = (event) => {
      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault();
        addVelocity(SCROLL_PHYSICS.keyVelocity);
        startPhysicsLoop();
      }

      if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        addVelocity(-SCROLL_PHYSICS.keyVelocity);
        startPhysicsLoop();
      }

      if (event.key === 'Home') {
        event.preventDefault();
        velocityRef.current = 0;
        stopPhysicsLoop();
        applyProgress(0);
      }

      if (event.key === 'End') {
        event.preventDefault();
        velocityRef.current = 0;
        stopPhysicsLoop();
        applyProgress(1);
      }
    };

    const resizeObserver = viewportRef.current
      ? new ResizeObserver(() => syncMediaSize())
      : null;

    resizeObserver?.observe(viewportRef.current);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', syncMediaSize);
    document.addEventListener('scroll', blockScroll, { passive: false });

    return () => {
      stopPhysicsLoop();
      velocityRef.current = 0;
      resizeObserver?.disconnect();
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', syncMediaSize);
      document.removeEventListener('scroll', blockScroll);
    };
  }, [applyProgress, loading, syncMediaSize]);

  const initialLayers = computeLayers(0);

  return (
    <div className="landing-video-page">
      <div ref={viewportRef} className="landing-video-page__viewport">
        <div className="landing-video-page__stage">
          <img
            ref={startRef}
            alt=""
            className="landing-video-page__frame landing-video-page__frame--start"
            decoding="sync"
            draggable={false}
            fetchPriority="high"
            loading="eager"
            src={FRAME_START_SRC}
            style={{
              opacity: initialLayers.start,
              visibility: initialLayers.start > 0 ? 'visible' : 'hidden',
            }}
          />
          <canvas
            ref={canvasRef}
            className="landing-video-page__frame landing-video-page__frame--canvas"
            width={NATIVE_WIDTH}
            height={NATIVE_HEIGHT}
            aria-hidden="true"
            style={{
              opacity: initialLayers.video,
              visibility: initialLayers.video > 0 ? 'visible' : 'hidden',
            }}
          />
          <img
            ref={endRef}
            alt=""
            className="landing-video-page__frame landing-video-page__frame--end"
            decoding="async"
            draggable={false}
            loading="eager"
            src={FRAME_END_SRC}
            style={{
              opacity: initialLayers.end,
              visibility: initialLayers.end > 0 ? 'visible' : 'hidden',
            }}
          />
        </div>

        <video
          ref={videoRef}
          className="landing-video-page__video-source"
          muted
          playsInline
          preload="auto"
          src={VIDEO_SRC}
          tabIndex={-1}
          aria-hidden="true"
        />

        <div className="landing-video-page__shade" />

        <header className="landing-video-page__actions">
          <Link className="landing-video-page__button landing-video-page__button--primary" to="/login">
            Iniciar sesión
          </Link>
          <Link className="landing-video-page__button" to="/register">
            Registrar colegio
          </Link>
          <Link className="landing-video-page__button" to="/contact">
            Contacto
          </Link>
        </header>

        {!loading ? (
          <div className="landing-video-page__scroll-hint" aria-hidden="true">
            <span>Scroll</span>
            <i />
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="landing-video-page__loader">
          <div className="landing-video-page__loader-content">
            <p>Preparando experiencia</p>
            <div className="landing-video-page__loader-bar">
              <span
                className="landing-video-page__loader-bar-fill"
                style={{ transform: `scaleX(${Math.max(loadProgress, 0.02)})` }}
              />
            </div>
            <small>{Math.round(loadProgress * 100)}%</small>
            <header className="landing-video-page__actions landing-video-page__actions--loader">
              <Link className="landing-video-page__button landing-video-page__button--primary" to="/login">
                Iniciar sesión
              </Link>
              <Link className="landing-video-page__button" to="/register">
                Registrar colegio
              </Link>
              <Link className="landing-video-page__button" to="/contact">
                Contacto
              </Link>
            </header>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default LandingPage;
