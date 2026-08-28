import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveApiAssetUrl } from '../../lib/api';
import './FamilyFeed.css';

function FeedHeartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function FeedCommentIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M21 11.7a8.2 8.2 0 0 1-8.5 8.1 9.6 9.6 0 0 1-3.8-.8L3 20.5l1.5-4.3A7.7 7.7 0 0 1 3.7 12a8.3 8.3 0 0 1 8.6-8.1A8.3 8.3 0 0 1 21 11.7Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function getMediaItems(item = {}) {
  return (Array.isArray(item.media) ? item.media : [])
    .map((mediaItem, index) => {
      const src = resolveApiAssetUrl(mediaItem?.src || mediaItem?.url || mediaItem?.imageUrl || mediaItem?.videoUrl || '');
      if (!src) {
        return null;
      }
      return {
        id: mediaItem.id || `${item._id || 'media'}-${index}`,
        kind: mediaItem.kind === 'video' ? 'video' : 'image',
        src,
        thumbUrl: resolveApiAssetUrl(mediaItem.thumbUrl || ''),
        alt: mediaItem.alt || item.title || 'Publicación',
      };
    })
    .filter(Boolean);
}

function FamilyFeedText({ text }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const cleanText = String(text || '').trim();
  const lineCount = cleanText.split(/\r?\n/).length;
  const canExpand = cleanText.length > 280 || lineCount > 5;

  if (!cleanText) {
    return null;
  }

  return (
    <div className="family-feed__message">
      <p className={canExpand && !isExpanded ? 'is-clamped' : ''}>{cleanText}</p>
      {canExpand ? (
        <button onClick={() => setIsExpanded((current) => !current)} type="button">
          {isExpanded ? 'Ver menos' : 'Ver más'}
        </button>
      ) : null}
    </div>
  );
}

function FamilyFeedMedia({ item }) {
  const mediaItems = useMemo(() => getMediaItems(item), [item]);
  const [activeIndex, setActiveIndex] = useState(0);
  const viewportRef = useRef(null);

  useEffect(() => {
    setActiveIndex(0);
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
    }
  }, [item?._id, mediaItems.length]);

  if (!mediaItems.length) {
    return null;
  }

  return (
    <div className="family-feed__media">
      <div
        className="family-feed__gallery"
        onScroll={(event) => {
          const { scrollLeft, clientWidth } = event.currentTarget;
          if (!clientWidth) {
            return;
          }
          const nextIndex = Math.round(scrollLeft / clientWidth);
          if (nextIndex !== activeIndex) {
            setActiveIndex(nextIndex);
          }
        }}
        ref={viewportRef}
      >
        {mediaItems.map((mediaItem) => (
          <figure className="family-feed__slide" key={mediaItem.id}>
            {mediaItem.kind === 'video' ? (
              <video controls playsInline poster={mediaItem.thumbUrl || undefined} preload="metadata" src={mediaItem.src} />
            ) : (
              <img alt={mediaItem.alt} loading="lazy" src={mediaItem.src} />
            )}
          </figure>
        ))}
      </div>
      {mediaItems.length > 1 ? (
        <>
          <div className="family-feed__count">{activeIndex + 1}/{mediaItems.length}</div>
          <div className="family-feed__dots">
            {mediaItems.map((mediaItem, index) => (
              <span className={index === activeIndex ? 'is-active' : ''} key={mediaItem.id} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function FamilyFeedPost({ item, subtitle, onOpenLikes, onOpenComments }) {
  const authorName = item.authorName || 'Institucional';
  const photoUrl = resolveApiAssetUrl(item.authorThumbUrl || item.authorPhotoUrl || '');
  const likesCount = Number(item.likesCount || item.likes?.length || 0);
  const commentsCount = Number(item.commentsCount || item.comments?.length || 0);

  return (
    <article className="family-feed__post">
      <div className="family-feed__post-head">
        <div className="family-feed__avatar">
          {photoUrl ? <img alt={authorName} src={photoUrl} /> : authorName.slice(0, 2).toUpperCase()}
        </div>
        <div className="family-feed__author">
          <strong>{authorName}</strong>
          <span>{subtitle}</span>
        </div>
      </div>
      <FamilyFeedMedia item={item} />
      <div className="family-feed__actions">
        <button aria-label="Ver likes" className="family-feed__heart" onClick={() => onOpenLikes?.(item)} type="button">
          <FeedHeartIcon />
        </button>
        <button className="family-feed__count-btn" onClick={() => onOpenLikes?.(item)} type="button">
          {likesCount}
        </button>
        <button className="family-feed__comment" onClick={() => onOpenComments?.(item)} type="button">
          <FeedCommentIcon />
          <span>{commentsCount}</span>
        </button>
      </div>
      {item.title ? <h3 className="family-feed__caption-title">{item.title}</h3> : null}
      <FamilyFeedText text={item.body} />
    </article>
  );
}

export default function FamilyFeed({
  items = [],
  emptyLabel = 'Aún no hay publicaciones en el feed de familias.',
  getSubtitle,
  onOpenLikes,
  onOpenComments,
}) {
  return (
    <div className="family-feed">
      <div className="family-feed__phone">
        {items.length === 0 ? (
          <p className="family-feed__empty">{emptyLabel}</p>
        ) : (
          <div className="family-feed__list">
            {items.map((item) => (
              <FamilyFeedPost
                item={item}
                key={item._id || item.id}
                onOpenComments={onOpenComments}
                onOpenLikes={onOpenLikes}
                subtitle={getSubtitle?.(item) || ''}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
