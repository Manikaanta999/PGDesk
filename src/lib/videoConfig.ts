export type ParsedVideoSource =
  | { type: 'placeholder' }
  | { type: 'mp4'; src: string }
  | { type: 'embed'; src: string };

export function parseDemoVideoSource(rawUrl: string | undefined | null): ParsedVideoSource {
  const url = (rawUrl || '').trim();
  if (!url) {
    return { type: 'placeholder' };
  }

  // Direct video file URL (.mp4, .webm, .ogg, or local /videos/* path)
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url) || url.startsWith('/videos/')) {
    return { type: 'mp4', src: url };
  }

  // YouTube watch or share URL -> privacy-enhanced embed URL (never autoplays with unmuted audio without user click)
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  if (ytMatch) {
    return {
      type: 'embed',
      src: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0`,
    };
  }

  // Vimeo URL -> embed URL
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) {
    return {
      type: 'embed',
      src: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
    };
  }

  // Fallback for any other direct video stream URL
  return { type: 'mp4', src: url };
}
