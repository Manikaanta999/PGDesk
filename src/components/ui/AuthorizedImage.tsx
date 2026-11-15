import React, { useEffect, useState } from 'react';
import { getStoredToken } from '../../lib/api';
import { auth } from '../../lib/firebase';

interface AuthorizedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string | null | undefined;
  fallback?: React.ReactNode;
}

/**
 * Renders images stored behind authenticated `/api/files/:id` endpoints by fetching
 * with the active Authorization header / HttpOnly cookie and binding a Blob URL.
 */
export function AuthorizedImage({ src, alt, fallback = null, ...rest }: AuthorizedImageProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setResolvedUrl(null);
      setFailed(false);
      return;
    }

    if (!src.startsWith('/api/files/')) {
      setResolvedUrl(src);
      setFailed(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    const load = async () => {
      try {
        const headers = new Headers();
        const storedToken = getStoredToken();
        if (storedToken) {
          headers.set('Authorization', `Bearer ${storedToken}`);
        } else if (auth?.currentUser) {
          const fbToken = await auth.currentUser.getIdToken().catch(() => null);
          if (fbToken) headers.set('Authorization', `Bearer ${fbToken}`);
        }

        const res = await fetch(src, { headers, credentials: 'include' });
        if (!res.ok) throw new Error('Image fetch failed');
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setResolvedUrl(objectUrl);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setResolvedUrl(null);
          setFailed(true);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  if (!src || failed || !resolvedUrl) {
    return <>{fallback}</>;
  }

  return <img src={resolvedUrl} alt={alt || ''} onError={() => setFailed(true)} {...rest} />;
}
